import {chromium} from '@playwright/test'
import {mkdir,writeFile,readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
const out='artifacts/acceptance/live-1.1.4'; await mkdir(out,{recursive:true})
const browser=await chromium.launch({headless:true})
const report={date:new Date().toISOString(),base:'https://ipw.cc',mocked:false,pages:[],interactions:[],errors:[],failedRequests:[]}
try {
 for(const width of [390,1440]) {
  const context=await browser.newContext({viewport:{width,height:1000}})
  const page=await context.newPage()
  const assetChecks=[]
  if(width===390) page.on('response',r=>{const path=new URL(r.url()).pathname;if(['/assets/index-B2i78kl-.js','/assets/index-BICFt5la.css'].includes(path)) assetChecks.push((async()=>{const body=await r.body();const local=await readFile('dist'+path);return {path,status:r.status(),same:body.equals(local),sha256:createHash('sha256').update(body).digest('hex')}})())})
  page.on('pageerror',e=>report.errors.push({width,message:e.message}))
  page.on('requestfailed',r=>report.failedRequests.push({width,path:new URL(r.url()).pathname,error:r.failure()?.errorText}))
  let messages=0;page.on('websocket',ws=>ws.on('framereceived',()=>messages++))
  await page.goto(report.base,{waitUntil:'domcontentloaded',timeout:60000})
  await page.locator('[data-testid="node-card"]').first().waitFor({timeout:45000})
  const link=await page.locator('a[href^="/stats/"]').first().getAttribute('href')
  const nodePath=link.split('?')[0]
  for(const [name,path,selector] of [['home','/','[data-testid="node-card"]'],['quality','/network-quality','main a[data-node-id]'],['overview',nodePath,'.overview-metrics'],['node-quality',nodePath+'?tab=quality','[role="img"][aria-label^="网络延迟趋势"]'],['ip',nodePath+'?tab=ip','main dl']]) {
   messages=0
   const response=await page.goto(report.base+path,{waitUntil:'domcontentloaded',timeout:60000})
   await page.locator(selector).first().waitFor({timeout:45000})
   await page.waitForTimeout(2500)
   const record=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,canvas:document.querySelectorAll('canvas').length,connectionVisible:[...document.querySelectorAll('.connection-status')].some(e=>e.getBoundingClientRect().height>0),oldReceiveText:document.body.innerText.includes('最后接收'),entry:[...document.scripts].map(s=>s.src).find(s=>s.includes('/assets/index-')),ttfb:performance.getEntriesByType('navigation')[0].responseStart,domContentLoaded:performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd,metrics:[...document.querySelectorAll('.overview-metrics > *')].map(e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width}})}))
   const box=await page.locator(name==='home'?'[data-testid="node-card"]':name==='quality'?'main a[data-node-id]':name==='overview'?'[role="img"][aria-label^="负载详情"]':selector).first().boundingBox().catch(()=>null)
   report.pages.push({width,page:name,status:response.status(),wsMessages:messages,...record,mainY:box?.y})
   await page.screenshot({path:`${out}/${width}-${name}.png`,fullPage:true})
   if(name==='overview' && width===390) {
    const initial=await page.locator('canvas').count()
    await page.setViewportSize({width:1440,height:1000}); await page.waitForTimeout(600)
    const desktop=await page.locator('canvas').count()
    await page.setViewportSize({width:390,height:1000}); await page.waitForTimeout(600)
    const mobileAgain=await page.locator('canvas').count()
    const button=page.getByRole('button',{name:'连接数与累计流量',exact:true})
    const id=await button.getAttribute('aria-controls')
    const closed=await page.locator(`[id="${id}"]`).evaluate(e=>e.childElementCount)
    await button.click();await page.waitForTimeout(500)
    const opened=await page.locator(`[id="${id}"]`).evaluate(e=>e.childElementCount)
    await button.click();await page.waitForTimeout(300)
    const reclosed=await page.locator(`[id="${id}"]`).evaluate(e=>e.childElementCount)
    report.interactions.push({kind:'responsive-canvases',initial,desktop,mobileAgain},{kind:'foldout-unmount',closed,opened,reclosed})
   }
   if(name==='home') {
    const button=page.getByRole('button',{name:'更多筛选',exact:true})
    await button.click();const opened=await button.getAttribute('aria-expanded');await button.click()
    report.interactions.push({width,kind:'home-filter',opened,closed:await button.getAttribute('aria-expanded')})
   }
   if(name==='quality') {
    const summary=page.locator('summary').filter({hasText:'更多筛选'})
    await summary.click();const opened=await summary.evaluate(e=>e.parentElement.open);await summary.click()
    report.interactions.push({width,kind:'quality-filter',opened,closed:await summary.evaluate(e=>e.parentElement.open)})
   }
   if(name==='node-quality') {
    const button=page.locator('.quality-targets button.disclosure-trigger')
    report.interactions.push({width,kind:'targets-default',triggerVisible:await button.isVisible(),expanded:await button.getAttribute('aria-expanded')})
   }
  }
  if(width===390) report.assets=await Promise.all(assetChecks)
  await context.close()
 }
} catch(e) {report.fatal=e.stack;console.error(e)} finally {await writeFile(`${out}/verification.json`,JSON.stringify(report,null,2));await browser.close()}
console.log(JSON.stringify(report,null,2))
if(report.fatal)process.exitCode=1
