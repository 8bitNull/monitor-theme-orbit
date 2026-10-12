import {chromium} from '@playwright/test'
import {spawn} from 'node:child_process'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const baseline=process.env.STARTUP_BASELINE_DIST
if(!baseline)throw new Error('Set STARTUP_BASELINE_DIST to an unchanged 1.1.4 dist directory')
const out='artifacts/acceptance/startup-identity';await mkdir(out,{recursive:true})
const rows=[],servers=[],browser=await chromium.launch({headless:true})
const environment={synthetic:true,nodes:16,viewport:{width:390,height:844},cpuRate:4,network:{latency:150,downloadThroughput:200000,uploadThroughput:100000},samples:3,browser:browser.version(),baseline:resolve(baseline),candidate:resolve('dist')}
try {
 for(const [variant,port,dist]of[['baseline',19421,resolve(baseline)],['candidate',19422,resolve('dist')]]){
  const server=spawn(process.execPath,['mock-server.mjs'],{env:{...process.env,MOCK_DIST:dist,MOCK_PORT:String(port),MOCK_NODE_COUNT:'16',MOCK_WS:'1',MOCK_GZIP:'1',MOCK_FIXED_TS:'1790800000'},stdio:['ignore','pipe','pipe']});servers.push(server)
  await new Promise((res,rej)=>{server.stdout.once('data',res);server.once('error',rej);server.once('exit',c=>rej(new Error('Server exit '+c)))})
 }
 for(let sample=1;sample<=3;sample++)for(const [variant,port]of(sample%2?[['baseline',19421],['candidate',19422]]:[['candidate',19422],['baseline',19421]])){
  const context=await browser.newContext({viewport:environment.viewport});const page=await context.newPage();const cdp=await context.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});await cdp.send('Network.emulateNetworkConditions',{offline:false,...environment.network})
  await page.addInitScript(()=>{window.__startup={};new MutationObserver(()=>{if(!window.__startup.firstCard&&document.querySelector('[data-testid="node-card"]')){window.__startup.firstCard=performance.now();requestAnimationFrame(()=>requestAnimationFrame(()=>window.__startup.frame=performance.now()))}}).observe(document,{subtree:true,childList:true})})
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  for(const cache of ['cold','warm']){
   await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'domcontentloaded',timeout:60000})
   await page.waitForFunction(()=>window.__startup.frame&&document.querySelectorAll('[data-testid="node-card"]').length===16,{},{timeout:60000})
   await page.waitForFunction(()=>performance.getEntriesByType('resource').some(r=>r.name.endsWith('/api/nodes')))
   const row=await page.evaluate(()=>{const nav=performance.getEntriesByType('navigation')[0];return {...window.__startup,ttfb:nav.responseStart,nodes:document.querySelectorAll('[data-testid="node-card"]').length,overflow:document.documentElement.scrollWidth>innerWidth,resources:performance.getEntriesByType('resource').filter(r=>/\/api\/(me|nodes)$|\/assets\/index-.*\.js$/.test(r.name)).map(r=>({path:new URL(r.name).pathname,start:r.startTime,end:r.responseEnd,transfer:r.transferSize}))}})
   rows.push({variant,sample,cache,errors:[...errors],...row});await writeFile(`${out}/benchmark.json`,JSON.stringify({environment,rows},null,2));console.log(variant,sample,cache,Math.round(row.frame),'ms')
  }
  await context.close()
 }
}finally{await browser.close();for(const server of servers)server.kill()}
