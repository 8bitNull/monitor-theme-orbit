import {chromium} from '@playwright/test'
import {writeFile} from 'node:fs/promises'
const browser=await chromium.launch({headless:true});const results=[]
try {
 for(let sample=1;sample<=3;sample++) {
  const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();const cdp=await context.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4})
  await page.addInitScript(()=>{new MutationObserver(()=>{if(!window.firstCard && document.querySelector('[data-testid="node-card"]')){window.firstCard=performance.now();requestAnimationFrame(()=>requestAnimationFrame(()=>window.firstCardFrame=performance.now()))}}).observe(document,{childList:true,subtree:true})})
  for(const cache of ['cold','warm']) {
   await page.goto('https://ipw.cc/',{waitUntil:'domcontentloaded',timeout:60000});await page.waitForFunction(()=>window.firstCardFrame,{timeout:45000})
   results.push(await page.evaluate(({sample,cache})=>{const nav=performance.getEntriesByType('navigation')[0];return {sample,cache,cpuRate:4,network:'unthrottled',ttfbMs:nav.responseStart,firstCardMs:window.firstCard,firstCardFrameProxyMs:window.firstCardFrame,nodes:document.querySelectorAll('[data-testid="node-card"]').length,resources:performance.getEntriesByType('resource').filter(r=>/\/api\/(me|nodes)|\/assets\/index-.*\.js/.test(r.name)).map(r=>({path:new URL(r.name).pathname,start:r.startTime,end:r.responseEnd,transfer:r.transferSize}))}},{sample,cache}))
  }
  await context.close()
 }
} finally {await browser.close();await writeFile('artifacts/acceptance/live-1.1.4/loading.json',JSON.stringify(results,null,2))}
console.log(JSON.stringify(results,null,2))
