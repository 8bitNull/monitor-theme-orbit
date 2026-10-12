import {test,expect} from '@playwright/test'
import {installFixture} from './fixtures'

for(const admin of [false,true])for(const [name,path,ready] of [
 ['home','/','[data-testid="node-card"]'],
 ['global-quality','/network-quality','main a[data-node-id]'],
 ['overview','/stats/1/','[role="img"][aria-label^="负载详情"] canvas'],
 ['node-quality','/stats/1/?tab=quality','[role="img"][aria-label^="网络延迟趋势"] canvas'],
 ['public-info','/stats/1/?tab=ip','[role="tabpanel"] dl'],
]as const)test(`${admin?'administrator':'public'} ${name} keeps mounted page and view across focus/visibility review`,async({page})=>{
 const fixture=await installFixture(page,{admin})
 let identities=0,hold=false,release:(()=>void)|undefined,documents=0,histories=0
 page.on('request',r=>{
  if(r.isNavigationRequest()&&r.frame()===page.mainFrame())documents++
  if(new URL(r.url()).pathname.match(/^\/api\/nodes\/\d+\/metrics$/))histories++
 })
 await page.route('**/api/me',async route=>{
  identities++
  if(hold)await new Promise<void>(r=>{release=r})
  await route.fulfill({json:{authed:admin,public_page:true,site_name:hold?'Focus reviewed':'DStatus',github:false}})
 })
 await page.goto(path)
 await expect(page.locator(ready).first()).toBeVisible()
 await expect.poll(()=>fixture.connected()).toBe(true);fixture.emitNodes()
 await expect(page.locator('.connection-status')).toHaveCount(0)
 if(name==='global-quality') {
  await expect(page.getByText('监测组合数',{exact:true}).locator('..')).toContainText('48')
  await expect(page.locator('.quality-controls > [role="status"]')).toBeEmpty()
 }
 if(name==='home')await expect(page.getByTestId('node-card')).toHaveCount(16)
 await expect(page.getByText(/正在加载历史|正在刷新历史/)).toHaveCount(0)
 if(name==='home')await page.getByPlaceholder('搜索节点名称').fill('Demo')
 await page.evaluate(selector=>{
  (window as any).__focusProbe={main:document.querySelector('main'),node:document.querySelector(selector),document,nonce:Math.random()}
  scrollTo(0,400)
 },ready)
 const before=await page.evaluate(()=>({scrollY,nonce:(window as any).__focusProbe.nonce}))
 const navigationCount=documents,initialIdentities=identities,initialHistories=histories
 hold=true
 await page.evaluate(()=>{dispatchEvent(new Event('blur'));dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));dispatchEvent(new Event('focus'))})
 await expect.poll(()=>!!release).toBe(true)
 await expect(page.locator(ready).first()).toBeVisible()
 await expect(page.getByText('正在确认身份…')).toHaveCount(0)
 expect(identities).toBe(initialIdentities+1)
 expect(await page.evaluate(selector=>{const saved=(window as any).__focusProbe;return saved.main===document.querySelector('main')&&saved.node===document.querySelector(selector)&&saved.document===document},ready)).toBe(true)
 expect(documents).toBe(navigationCount)
 expect(histories).toBe(initialHistories)
 release!()
 await expect(page.locator('footer a[href="/"]')).toHaveText('Focus reviewed')
 hold=false
 await expect(page.locator('.connection-status')).toHaveCount(0)
 expect(await page.evaluate(selector=>{const saved=(window as any).__focusProbe;return saved.main===document.querySelector('main')&&saved.node===document.querySelector(selector)},ready)).toBe(true)
 expect(await page.evaluate(()=>({scrollY,nonce:(window as any).__focusProbe.nonce}))).toEqual(before)
 expect(histories).toBe(initialHistories)
 if(name==='home')await expect(page.getByPlaceholder('搜索节点名称')).toHaveValue('Demo')
})

for(const outcome of ['closed','failure','upgrade']as const)test(`focus background review handles ${outcome} without trusting old identity`,async({page})=>{
 const fixture=await installFixture(page)
 let review=false,release:(()=>void)|undefined
 await page.route('**/admin/',r=>r.fulfill({contentType:'text/html',body:'<h1>Login</h1>'}))
 await page.route('**/api/me',async route=>{
  if(review)await new Promise<void>(r=>{release=r})
  await route.fulfill(review&&outcome==='failure'?{status:503}:{json:{authed:review&&outcome==='upgrade',public_page:!(review&&outcome==='closed'),site_name:'DStatus',github:false}})
 })
 await page.goto('/stats/1/?tab=ip')
 await expect(page.getByText('已隐藏',{exact:true})).toBeVisible()
 await expect.poll(()=>fixture.connected()).toBe(true);fixture.emitNodes()
 await expect(page.locator('.connection-status')).toHaveCount(0)
 review=true
 await page.evaluate(()=>dispatchEvent(new Event('focus')))
 await expect.poll(()=>!!release).toBe(true)
 await expect(page.getByText('已隐藏',{exact:true})).toBeVisible()
 await expect(page.getByText('正在确认身份…')).toHaveCount(0)
 if(outcome==='upgrade')fixture.setAdmin(true)
 release!()
 if(outcome==='closed')await expect(page).toHaveURL(/\/admin\/$/)
 else if(outcome==='failure') {
  await expect(page.getByText('身份状态暂时无法确认')).toBeVisible()
  await expect(page.getByText('已隐藏',{exact:true})).toHaveCount(0)
 } else {
  await expect(page.getByText('管理员视图',{exact:true})).toBeVisible()
  await expect(page.getByText('203.0.113.11',{exact:true})).toBeVisible()
 }
})
