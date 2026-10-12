import {chromium} from '@playwright/test'
import {mkdir,writeFile} from 'node:fs/promises'
import {spawn} from 'node:child_process'
import {resolve} from 'node:path'

// Local geometry comparison only; these numbers do not measure online loading time.
const baseline = process.env.LAYOUT_BASELINE_URL || 'http://127.0.0.1:19324'
const candidate = process.env.LAYOUT_CANDIDATE_URL || 'http://127.0.0.1:19325'
const output = 'artifacts/acceptance/page-convergence'
await mkdir(output,{recursive:true})
const servers = []
for(const [external,url,dist] of [[process.env.LAYOUT_BASELINE_URL,baseline,resolve('../.worktrees/page-convergence-preview-baseline/dist')],[process.env.LAYOUT_CANDIDATE_URL,candidate,resolve('dist')]]) {
 if(!external) servers.push(spawn(process.execPath,['mock-server.mjs'],{env:{...process.env,MOCK_PORT:new URL(url).port,MOCK_DIST:dist},stdio:'ignore'}))
 for(let attempt=0;attempt<40;attempt++) {
  try {if((await fetch(url)).ok) break} catch {}
  if(attempt===39) throw new Error(`Preview did not start: ${url}`)
  await new Promise(resolve=>setTimeout(resolve,100))
 }
}
const browser = await chromium.launch({headless:true})
const results = []
try {
 for(const [build,url,width,mode] of [['baseline',baseline,390,'light'],['candidate',candidate,390,'light'],['candidate',candidate,390,'dark'],['candidate',candidate,1440,'light'],['candidate',candidate,1440,'dark']]) {
  const context = await browser.newContext({viewport:{width,height:1000}})
  const page = await context.newPage()
  await page.addInitScript(mode=>localStorage.setItem('theme',mode),mode)
  let frame, socket
  await page.route('**/api/me',route=>route.fulfill({json:{authed:false,public_page:true,site_name:'DStatus'}}))
  await page.route('**/api/nodes',async route=>{
   const response = await route.fetch()
   frame = await response.json()
   await route.fulfill({json:frame})
  })
  await page.routeWebSocket('**/api/ws',ws=>{socket=ws;if(frame) ws.send(JSON.stringify(frame))})
  for(const [name,path,ready] of [['home','/','[data-testid="node-card"]'],['quality','/network-quality','main a[data-node-id]'],['overview','/stats/1/','.overview-metrics, main section h2'],['node-quality','/stats/1/?tab=quality','[role="img"][aria-label^="网络延迟趋势"]'],['ip','/stats/1/?tab=ip','main dl']]) {
   socket = null
   await page.goto(url+path)
   await page.locator(ready).first().waitFor()
   for(let attempt=0;attempt<40 && (!socket || !frame);attempt++) await page.waitForTimeout(50)
   if(!socket || !frame) throw new Error('Fixture websocket not connected')
   socket.send(JSON.stringify(frame))
   await page.waitForFunction(()=>!document.querySelector('.connection-status'))
   await page.waitForTimeout(600)
   const getBox = async selector => {
    const el=page.locator(selector).first()
    return await el.count() ? el.boundingBox() : null
   }
   const record = {build,width,mode,page:name,firstResult:await getBox(name==='home'?'[data-testid="node-card"]':'main a[data-node-id]'),mainTrend:await getBox(name==='overview'?'[role="img"][aria-label^="负载详情"]':'[role="img"][aria-label^="网络延迟趋势"]'),panel:await getBox('[role="tabpanel"]'),overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),canvasCount:await page.locator('canvas').count()}
   if(record.overflow) throw new Error(`Overflow: ${build} ${width} ${mode} ${name}`)
   results.push(record)
   await page.screenshot({path:`${output}/${build}-${width}-${mode}-${name}.png`})
  }
  await context.close()
 }
 await writeFile(`${output}/comparison.json`,JSON.stringify(results,null,2)+'\n')
 console.log(JSON.stringify(results.filter(r=>r.width===390 && r.mode==='light').map(r=>({build:r.build,page:r.page,firstResultY:r.firstResult?.y,mainTrendY:r.mainTrend?.y,panelHeight:r.panel?.height,canvas:r.canvasCount})),null,2))
} finally {await browser.close();for(const server of servers) server.kill()}
