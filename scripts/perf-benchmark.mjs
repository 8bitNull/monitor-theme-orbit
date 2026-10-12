// Production-only measurement. Never route requests or serialize API payloads/query text.
import {chromium} from '@playwright/test'
import {mkdir, readFile, writeFile} from 'node:fs/promises'
import {dirname, resolve} from 'node:path'
import {execFileSync} from 'node:child_process'
import os from 'node:os'
import {SYNTHETIC_DATA_VERSION} from '../tests/performance/synthetic-data.mjs'
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, i, all) => {
 if (i % 2 === 0) pairs.push([value.replace(/^--/, ''), all[i + 1]])
 return pairs
}, []))
const baseURL = args['base-url'], nodeCount = Number(args.nodes), output = args.output
if (!baseURL || ![16,100].includes(nodeCount) || !output) throw new Error('Required: --base-url URL --nodes 16|100 --output PATH --label LABEL')
const pairs = Number(args.samples ?? 5)
if (!Number.isInteger(pairs) || pairs < 1) throw new Error('Invalid samples')
const throttle = {offline:false,latency:150,downloadThroughput:200000,uploadThroughput:100000}
const samples = []
const protocol = {cold: 'new browser context', warm: 'reload in same context immediately after cold measurement', interactions: '100-node warm samples only, after initial history completion; cold interactions excluded to preserve paired reload', routing: false, sampleTimeoutMs: 90000}
const browser = await chromium.launch()
const version = browser.version()
const environment = {browser:version,node:process.version,platform:os.platform(),release:os.release(),architecture:os.arch(),cpu:os.cpus()[0]?.model,cpuCount:os.cpus().length,memoryBytes:os.totalmem(),commit:execFileSync('git',['rev-parse','HEAD']).toString().trim(),dataVersion:SYNTHETIC_DATA_VERSION,fixedTimestamp:1790800000,viewport:{width:390,height:844},cpuThrottle:4,network:throttle}
try { if (!args.label?.startsWith('baseline-') && !args.label?.startsWith('smoke-')) throw new Error('Current production'); environment.productionSourceCommit = JSON.parse(await readFile(resolve(dirname(output),'baseline-manifest.json'),'utf8')).sourceCommit } catch { environment.productionSourceCommit = environment.commit }
function installObserver() {
 window.__perf = {longTasks:[],marks:{}}
 performance.setResourceTimingBufferSize(5000)
 new PerformanceObserver(list=>{for(const e of list.getEntries()) window.__perf.longTasks.push({start:e.startTime,duration:e.duration})}).observe({type:'longtask',buffered:true})
 const mark=()=>{
  const p=window.__perf, card=document.querySelector('[data-testid="node-card"]')
  if(card && !p.marks.firstNode) p.marks.firstNode=performance.now()
  const graph=card?.querySelector('[role="img"][aria-label^="延迟最近"]')
  if(graph && !/最近 0 个/.test(graph.getAttribute('aria-label')||'') && !p.marks.firstHistory) p.marks.firstHistory=performance.now()
  if(document.querySelector('[data-testid="boot-skeleton"]') && !p.marks.skeleton) p.marks.skeleton=performance.now()
 }
 new MutationObserver(mark).observe(document,{childList:true,subtree:true,attributes:true})
 addEventListener('DOMContentLoaded',mark)
}
async function prepare(page) {
 const cdp=await page.context().newCDPSession(page)
 await cdp.send('Network.enable')
 await cdp.send('Network.setCacheDisabled',{cacheDisabled:false})
 await cdp.send('Emulation.setCPUThrottlingRate',{rate:4})
 await cdp.send('Network.emulateNetworkConditions',throttle)
 await page.addInitScript(installObserver)
 let records = new Map(), origin = null, waiters = []
 const notify = () => { for (const callback of waiters) callback() }
 cdp.on('Network.requestWillBeSent',e=>{
  if(origin === null) origin = e.timestamp
  const u = new URL(e.request.url)
  records.set(e.requestId,{pingKey:u.pathname,category:u.pathname.startsWith('/api/')?'api':/\.js$/.test(u.pathname)?'js':/\.woff2?$/.test(u.pathname)?'font':e.type==='Document'?'document':'other',ping:/\/api\/nodes\/\d+\/metrics$/.test(u.pathname)&&u.searchParams.get('series')==='ping',hashed:/\/assets\/.*[.-][A-Za-z0-9_-]{8,}\./.test(u.pathname),startMs:(e.timestamp-origin)*1000,cache:false})
 })
 cdp.on('Network.requestServedFromCache',e=>{const r=records.get(e.requestId);if(r){r.cache=true;r.cacheSource='memory'}})
 cdp.on('Network.responseReceived',e=>{const r=records.get(e.requestId);if(r){r.cache ||= !!e.response.fromDiskCache || !!e.response.fromPrefetchCache;if(e.response.fromDiskCache)r.cacheSource='disk';r.status=e.response.status;r.gzip=e.response.headers['Content-Encoding']==='gzip'||e.response.headers['content-encoding']==='gzip'}})
 cdp.on('Network.loadingFinished',e=>{const r=records.get(e.requestId);if(r){r.endMs=(e.timestamp-origin)*1000;r.bytes=e.encodedDataLength;r.complete=true;notify()}})
 cdp.on('Network.loadingFailed',e=>{const r=records.get(e.requestId);if(r){r.failed=true;notify()}})
 return {
  reset(){records=new Map();origin=null},
  snapshot(){return [...records.values()].map(({pingKey,...metrics})=>metrics)},
  waitHistory(count,timeout){return new Promise((resolve,reject)=>{
   const check=()=>{if(new Set([...records.values()].filter(r=>r.ping&&r.complete&&r.status===200).map(r=>r.pingKey)).size>=count){cleanup();resolve()}}
   const timer=setTimeout(()=>{cleanup();reject(new Error('History completion timeout'))},timeout)
   const cleanup=()=>{clearTimeout(timer);waiters=waiters.filter(w=>w!==check)}
   waiters.push(check);check()
  })},
 }
}
async function collect(page, network) {
 const doc=await page.evaluate(()=>{
  const entries=[...performance.getEntriesByType('navigation'),...performance.getEntriesByType('resource')]
  return {...window.__perf,timeOrigin:performance.timeOrigin,elapsedMs:performance.now(),resources:entries.map(e=>({category:e.entryType==='navigation'?'document':/\.js(?:\?|$)/.test(e.name)?'js':/\.woff2?(?:\?|$)/.test(e.name)?'font':e.name.includes('/api/')?'api':'other',transferSize:e.transferSize,encodedBodySize:e.encodedBodySize,decodedBodySize:e.decodedBodySize,duration:e.duration}))}
 })
 const requests=network.snapshot()
 const sum=(rows,key)=>rows.reduce((n,r)=>n+(r[key]??0),0)
 return {...doc,requests,pingRequests:requests.filter(r=>r.ping).length,pingCompleted:requests.filter(r=>r.ping&&r.complete).length,allHistoryMs:requests.some(r=>r.ping&&r.complete)?Math.max(...requests.filter(r=>r.ping&&r.complete).map(r=>r.endMs)):null,hashedCacheHits:requests.filter(r=>r.hashed&&r.cache).length,apiRequests:requests.filter(r=>r.category==='api').length,gzip:requests.some(r=>r.gzip),transferBytes:sum(doc.resources,'transferSize'),decodedBytes:sum(doc.resources,'decodedBodySize'),jsTransferBytes:sum(doc.resources.filter(r=>r.category==='js'),'transferSize'),jsDecodedBytes:sum(doc.resources.filter(r=>r.category==='js'),'decodedBodySize'),longTaskMs:sum(doc.longTasks,'duration')}
}
async function interactions(page,network,remaining) {
 const results=[]
 async function action(name,perform) {
  page.setDefaultTimeout(remaining())
  const before=await page.evaluate(()=>({start:performance.now(),tasks:window.__perf.longTasks.length}))
  await perform()
  const after=await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>resolve({end:performance.now(),tasks:window.__perf.longTasks}))))
  results.push({name,startMs:before.start,endMs:after.end,nextFrameMs:after.end-before.start,longTasks:after.tasks.slice(before.tasks)})
 }
 await action('search',()=>page.getByRole('textbox',{name:'搜索节点名称',exact:true}).fill('Synthetic'))
 await action('clear-search',()=>page.getByRole('textbox',{name:'搜索节点名称',exact:true}).fill(''))
 // Mobile region controls live inside the summary disclosure.
 const region=page.locator('button.region-tag').first()
 if(!await region.isVisible()) {
  const disclosure=page.getByRole('button',{name:/地区与地图/})
  if(await disclosure.count()) await disclosure.first().click()
 }
 await action('region',()=>region.click())
 await action('clear-region',()=>page.getByRole('button',{name:'清除地区筛选',exact:true}).click())
 await action('list-view',()=>page.getByRole('button',{name:'列表视图',exact:true}).click())
 await action('card-view',()=>page.getByRole('button',{name:'卡片视图',exact:true}).click())
 await action('scroll',()=>page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight)))
 await page.evaluate(()=>window.scrollTo(0,0))
 const previous=await page.evaluate(()=>({timeOrigin:performance.timeOrigin,start:performance.now()}))
 network.reset()
 await page.locator('a[href^="/stats/"]').first().click()
 await page.waitForURL(/\/stats\//,{timeout:remaining()})
 await page.waitForFunction(()=>document.querySelector('[role="tab"]'),null,{timeout:remaining()})
 const after=await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>resolve({timeOrigin:performance.timeOrigin,end:performance.now()}))))
 results.push({name:'internal-navigation',kind:after.timeOrigin===previous.timeOrigin?'same-document':'new-document',startMs:previous.start,endMs:after.end,durationMs:after.timeOrigin+after.end-previous.timeOrigin-previous.start,document:await collect(page,network)})
 return results
}
async function sample(page,network,mode,index) {
 const started=Date.now(), result={mode,index,ok:false}
 const remaining=()=>{const n=90000-(Date.now()-started);if(n<=0)throw new Error('Sample exceeded 90 seconds');return n}
 network.reset();page.setDefaultTimeout(90000)
 const deadline=setTimeout(()=>{void page.close().catch(()=>{})},90000)
 try {
  result.phase='navigation'
  if(mode==='cold')await page.goto(baseURL,{waitUntil:'domcontentloaded',timeout:remaining()})
  else await page.reload({waitUntil:'domcontentloaded',timeout:remaining()})
  result.phase='histories'
  await network.waitHistory(nodeCount,remaining())
  result.phase='first-history-mark'
  await page.waitForFunction(()=>!!window.__perf?.marks.firstHistory,null,{timeout:remaining()})
  await page.evaluate(()=>document.fonts.ready)
  Object.assign(result,await collect(page,network))
  if(mode==='warm' && !result.hashedCacheHits)throw new Error('Warm hashed-resource cache not observed')
  if(nodeCount===100 && mode==='warm'){result.phase='interactions';result.interactions=await interactions(page,network,remaining)}
  result.ok=true;result.phase='complete'
 } catch(error) {
  result.error={type:error.name,message:error.name==='TimeoutError'?'Browser operation timed out':error.message.startsWith('History')?error.message:error.message.startsWith('Warm')?error.message:'Sample failed'}
  if(!result.resources)try{Object.assign(result,await collect(page,network))}catch{}
 }
 clearTimeout(deadline)
 result.wallTimeMs=Date.now()-started
 return result
}
function summarize(mode) {
 const rows=samples.filter(s=>s.mode===mode&&s.ok), stats={successful:rows.length,failed:samples.filter(s=>s.mode===mode&&!s.ok).length}
 for(const key of ['firstNode','firstHistory','skeleton','allHistoryMs','transferBytes','decodedBytes','jsTransferBytes','jsDecodedBytes','longTaskMs','hashedCacheHits']) {
  const values=rows.map(s=>s[key]??s.marks?.[key]).filter(v=>Number.isFinite(v)).sort((a,b)=>a-b)
  stats[key]=values.length?{median:values.length%2?values[(values.length-1)/2]:(values[values.length/2-1]+values[values.length/2])/2,min:values[0],max:values.at(-1),count:values.length}:null
 }
 stats.interactions={}
 for(const name of ['search','clear-search','region','clear-region','list-view','card-view','scroll','internal-navigation']) {
  const values=rows.flatMap(row=>(row.interactions??[]).filter(i=>i.name===name).map(i=>i.nextFrameMs??i.durationMs)).sort((a,b)=>a-b)
  if(values.length)stats.interactions[name]={median:values.length%2?values[(values.length-1)/2]:(values[values.length/2-1]+values[values.length/2])/2,min:values[0],max:values.at(-1),count:values.length}
 }
 return stats
}
async function save(){await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify({label:args.label,nodeCount,pairs,protocol,environment,gzip:samples.some(s=>s.gzip),samples,summary:{cold:summarize('cold'),warm:summarize('warm')}},null,2)+'\n')}
try {
 for(let index=1;index<=pairs;index++) {
  const context=await browser.newContext({viewport:environment.viewport})
  const page=await context.newPage(), network=await prepare(page)
  for(const mode of ['cold','warm']) {
   const result=await sample(page,network,mode,index);samples.push(result);await save()
   console.log(`${args.label} ${index}/${pairs} ${mode}: ${result.ok?'ok':'FAILED'} (${result.pingCompleted??0} histories)`)
  }
  await context.close()
 }
} finally {await browser.close();await save()}
if(samples.some(s=>!s.ok))process.exitCode=1
