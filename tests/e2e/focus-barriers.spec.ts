import {test,expect} from '@playwright/test'
import {installFixture} from './fixtures'

for(const barrier of ['401','navigation']as const)test(`administrator ${barrier} blocks a pending resume review`,async({page})=>{
 const fixture=await installFixture(page,{admin:true})
 let calls=0,release:(()=>void)|undefined
 await page.route('**/api/me',async route=>{
  const call=++calls
  if(call===2)await new Promise<void>(r=>{release=r})
  await route.fulfill(call>=3?{status:401}:{json:{authed:true,public_page:true,site_name:call===2?'Reviewed':'DStatus',github:false}}).catch(()=>{})
 })
 await page.goto('/')
 await expect(page.getByTestId('node-card')).toHaveCount(16)
 await expect.poll(()=>fixture.connected()).toBe(true);fixture.emitNodes()
 await page.evaluate(()=>dispatchEvent(new Event('focus')))
 await expect.poll(()=>!!release).toBe(true)
 await expect(page.getByTestId('node-card')).toHaveCount(16)
 if(barrier==='401') {
  await page.evaluate(()=>dispatchEvent(new Event('dstatus-auth-invalidated')))
  await expect(page.getByText('身份状态暂时无法确认')).toBeVisible()
  await expect(page.getByTestId('node-card')).toHaveCount(0)
  expect(calls).toBe(3)
  release!()
  // A stale identity reply has been fulfilled; give its promise callbacks time to run.
  await page.waitForTimeout(100)
  await expect(page.getByText('身份状态暂时无法确认')).toBeVisible()
  await expect(page.locator('footer a[href="/"]')).not.toHaveText('Reviewed')
 } else {
  await page.getByRole('link',{name:'网络质量',exact:true}).click()
  await expect(page.getByText('正在确认身份…')).toBeVisible()
  await expect(page.getByRole('heading',{name:'网络质量监控',exact:true})).toHaveCount(0)
  expect(calls).toBe(2)
  release!()
  await expect(page.getByRole('heading',{name:'网络质量监控',exact:true})).toBeVisible()
  await expect(page.locator('footer a[href="/"]')).toHaveText('Reviewed')
 }
})

for(const outcome of ['same','failure','invalid']as const)test(`administrator resume with public page disabled handles ${outcome}`,async({page})=>{
 await installFixture(page,{admin:true})
 let calls=0,release:(()=>void)|undefined
 await page.route('**/api/me',async route=>{
  const call=++calls
  if(call===2)await new Promise<void>(r=>{release=r})
  await route.fulfill(call===2&&outcome==='failure'?{status:503}:{json:{authed:call===2&&outcome==='invalid'?null:true,public_page:false,site_name:call===2?'Reviewed':'DStatus',github:false}})
 })
 await page.goto('/stats/1/?tab=ip')
 await expect(page.getByText('203.0.113.11',{exact:true})).toBeVisible()
 await page.evaluate(()=>{
  Object.defineProperty(document,'hidden',{configurable:true,value:true})
  document.dispatchEvent(new Event('visibilitychange'));dispatchEvent(new Event('blur'))
 })
 expect(calls).toBe(1)
 await page.evaluate(()=>{
  Object.defineProperty(document,'hidden',{configurable:true,value:false})
  document.dispatchEvent(new Event('visibilitychange'));dispatchEvent(new Event('focus'))
 })
 await expect.poll(()=>!!release).toBe(true)
 await expect(page.getByText('203.0.113.11',{exact:true})).toBeVisible()
 expect(calls).toBe(2)
 release!()
 if(outcome==='same') {
  await expect(page.locator('footer a[href="/"]')).toHaveText('Reviewed')
  await expect(page.getByText('203.0.113.11',{exact:true})).toBeVisible()
 } else {
  await expect(page.getByText('身份状态暂时无法确认')).toBeVisible()
  await expect(page.getByText('203.0.113.11',{exact:true})).toHaveCount(0)
 }
})
