import {chromium} from '@playwright/test'
import {spawn} from 'node:child_process'
import {writeFile,readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import os from 'node:os'
const root=new URL('../',import.meta.url).pathname
const baseline='/data/data/App/DStatus/.worktrees/dstatus-dashboard-rendering-baseline/dist'
const output=root+'artifacts/acceptance/dashboard-rendering/benchmark.json'
const rows=[],servers=[]
const browser=await chromium.launch({args:['--no-sandbox']})
const environment={browser:browser.version(),cpu:os.cpus()[0].model,viewport:{width:390,height:844},cpuThrottle:4,network:{latency:150,downloadThroughput:200000,uploadThroughput:100000},samples:3,fixedTimestamp:1790800000,baselineDist:baseline}
const save=()=>writeFile(output,JSON.stringify({environment,rows},null,2))
function observe(){
 window.__renderPerf={tasks:[],firstNodeDom:null,firstNodeFrame:null,allNodesDom:null}
 new PerformanceObserver(list=>list.getEntries().forEach(e=>window.__renderPerf.tasks.push({start:e.startTime,duration:e.duration}))).observe({type:'longtask',buffered:true})
 const observer=new MutationObserver(()=>{
  const count=document.querySelectorAll('[data-testid="node-card"]').length
  if(count&&!window.__renderPerf.firstNodeDom){window.__renderPerf.firstNodeDom=performance.now();requestAnimationFrame(()=>requestAnimationFrame(()=>window.__renderPerf.firstNodeFrame=performance.now()))}
  if(count===window.__expectedNodes){window.__renderPerf.allNodesDom=performance.now();observer.disconnect()}
 })
 observer.observe(document,{childList:true,subtree:true})
}
try{
 for(const count of [16,100]){
 for(const [variant,port,dist] of [['baseline',18821,baseline],['candidate',18822,root+'dist']]){
 const child=spawn(process.execPath,[root+'mock-server.mjs'],{cwd:root,env:{...process.env,MOCK_DIST:dist,MOCK_PORT:String(port),MOCK_NODE_COUNT:String(count),MOCK_GZIP:'1',MOCK_WS:'1',MOCK_FIXED_TS:'1790800000'},stdio:['ignore','pipe','pipe']});servers.push(child)
 await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>reject(new Error('mock exited '+code)))})
 }
 for(let round=0;round<3;round++)for(const [variant,port] of [['baseline',18821],['candidate',18822]]){
 const ctx=await browser.newContext({viewport:environment.viewport}),p=await ctx.newPage(),cdp=await ctx.newCDPSession(p)
 await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});await cdp.send('Network.emulateNetworkConditions',{offline:false,...environment.network});await p.addInitScript(n=>window.__expectedNodes=n,count);await p.addInitScript(observe)
 for(const mode of ['cold','warm']){
 const histories=new Set(),errors=[];const handle=r=>{if(/\/api\/nodes\/\d+\/metrics\?/.test(r.url()))r.finished().then(()=>histories.add(new URL(r.url()).pathname))};const fail=e=>errors.push(e.message);p.on('response',handle);p.on('pageerror',fail)
 await p.goto('http://127.0.0.1:'+port+'/',{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.__renderPerf.firstNodeFrame&&window.__renderPerf.allNodesDom,{},{timeout:90000})
 const deadline=Date.now()+90000
 while(histories.size<count&&Date.now()<deadline)await p.waitForTimeout(100)
 await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
 const sample=await p.evaluate(()=>{const s=window.__renderPerf;return {...s,totalDomNodes:document.getElementsByTagName('*').length,chartCells:document.querySelectorAll('.mini-chart > div').length,initialLongestTaskMs:Math.max(0,...s.tasks.filter(t=>t.start<=s.firstNodeFrame).map(t=>t.duration)),mountLongestTaskMs:Math.max(0,...s.tasks.filter(t=>t.start<=s.allNodesDom).map(t=>t.duration)),totalLongTaskMs:s.tasks.reduce((n,t)=>n+t.duration,0),jsTransfer:performance.getEntriesByType('resource').filter(r=>r.name.endsWith('.js')).reduce((n,r)=>n+r.transferSize,0)}})
 rows.push({count,variant,round,mode,histories:histories.size,errors,...sample});console.log(count,variant,round,mode,'first frame',Math.round(sample.firstNodeFrame),'initial longest',sample.initialLongestTaskMs,'cells',sample.chartCells);await save();p.off('response',handle);p.off('pageerror',fail)
 }
 await ctx.close()
 }
 for(const child of servers.splice(0))child.kill();
 }
}finally{for(const child of servers)child.kill();await browser.close();await save()}
const hashes={}
for(const [variant,file] of [['baseline',baseline+'/index.html'],['candidate',root+'dist/index.html']])hashes[variant]=createHash('sha256').update(await readFile(file)).digest('hex')
await writeFile(output,JSON.stringify({environment,hashes,rows},null,2))
if(rows.some(r=>r.errors.length||r.histories!==r.count))process.exitCode=1
