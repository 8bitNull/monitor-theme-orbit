import { test, expect } from '@playwright/test'
const history = { metrics: [], probes: {'1':'Synthetic target'}, ping: [{task_id:1, ts:120, latency:40}], loss: {} }
test('live node polling does not refetch history and global concurrency is four', async ({page}) => {
 let requests=0, active=0, peak=0
 await page.route('**/api/nodes/*/metrics?*', async route => {
  requests++; active++; peak=Math.max(peak,active)
  await new Promise(resolve=>setTimeout(resolve,100))
  await route.fulfill({json:history}); active--
 })
 await page.goto('/network-quality')
 await expect(page.locator('main').getByText('40ms',{exact:true}).first()).toBeVisible()
 await expect.poll(()=>requests).toBe(16)
 await page.waitForTimeout(6500)
 expect(requests).toBe(16); expect(peak).toBeLessThanOrEqual(4)
})
test('same range refresh performs a request and retains data on temporary failure', async ({page}) => {
 let pingRequests=0, fail=false
 await page.route('**/api/nodes/*/metrics?*', route=> {
  if(new URL(route.request().url()).searchParams.get('series')==='ping') pingRequests++
  return fail ? route.fulfill({status:503,contentType:'text/plain',body:'Synthetic outage'}) : route.fulfill({json:history})
 })
 await page.goto('/stats/1/')
 await page.getByRole('tab',{name:'网络质量',exact:true}).click()
 await expect(page.getByRole('button').filter({hasText:'Synthetic target'})).toBeVisible()
 const first=pingRequests; fail=true
 await page.getByRole('button',{name:'刷新网络质量',exact:true}).click()
 await expect(page.getByText('Synthetic outage',{exact:false})).toBeVisible()
 expect(pingRequests).toBe(first+1)
 await expect(page.getByRole('button').filter({hasText:'Synthetic target'})).toBeVisible()
 fail=false
 await page.getByRole('button',{name:'7d',exact:true}).click()
 await expect.poll(()=>pingRequests).toBe(first+2)
 await expect(page.getByText('7d',{exact:true})).toHaveCount(2)
})
test('IP tab requests no resource history', async ({page}) => {
 let requests=0
 await page.route('**/api/nodes/*/metrics?*', route=>{requests++;return route.fulfill({json:history})})
 await page.goto('/stats/1/?tab=ip')
 await page.getByRole('tab',{name:'归属地与节点信息',exact:true}).click()
 const initial=requests
 await page.waitForTimeout(1000)
 expect(requests).toBe(initial)
})
test('hidden pages pause periodic refresh and visible events share running work', async ({page}) => {
 let requests=0,identities=0
 await page.clock.install()
 await page.clock.pauseAt(new Date())
 await page.route('**/api/me',route=>route.fulfill({json:{authed:false,public_page:true,site_name:`Review ${++identities}`}}))
 await page.route('**/api/nodes/*/metrics?*', async route=> {
  requests++
  await new Promise(resolve=>setTimeout(resolve,100))
  await route.fulfill({json:history})
 })
 await page.goto('/network-quality')
 await expect.poll(()=>requests).toBe(16)
 await expect(page.locator('main').getByText('有效桶延迟均值',{exact:true}).first().locator('..')).toContainText('40')
 await page.locator('summary').filter({hasText:'更多筛选'}).click()
 const stamp = await page.locator('.quality-more > p').textContent()
 await page.clock.runFor(59000)
 await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')))
 // Same identity keeps the owner and its still-fresh history cache.
 await expect(page.locator('footer a[href="/"]')).toHaveText('Review 2')
 expect(requests).toBe(16)
 await expect(page.locator('.quality-more > p')).toHaveText(stamp!)
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))})
 await page.clock.runFor(61000)
 expect(requests).toBe(16)
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});for(let i=0;i<3;i++)document.dispatchEvent(new Event('visibilitychange'))})
 await expect(page.locator('footer a[href="/"]')).toHaveText('Review 3')
 await expect.poll(()=>requests).toBe(32)
 await expect(page.locator('.quality-more > p')).not.toHaveText(stamp!)
 await page.waitForTimeout(200)
 expect(requests).toBe(32)
})
test('range changes never show old-range values and a failed node does not erase others', async ({page}) => {
 let nextRange=false, release!:()=>void
 const gate = new Promise<void>(resolve=>{release=resolve})
 await page.route('**/api/nodes/*/metrics?*', async route=> {
  if(nextRange) await gate
  if(route.request().url().includes('/nodes/2/')) return route.fulfill({status:503,body:'Synthetic failure'})
  return route.fulfill({json:history})
 })
 await page.goto('/network-quality')
 await expect(page.locator('main').getByText('有效桶延迟均值',{exact:true}).first().locator('..')).toContainText('40')
 await expect(page.getByText('部分历史获取失败',{exact:false})).toBeVisible()
 nextRange=true
 await page.getByRole('button').filter({hasText: /^1 小时$/}).click()
 await expect(page.locator('main').getByText('有效桶延迟均值',{exact:true}).first().locator('..')).toContainText('--')
 release()
 await expect(page.locator('main').getByText('有效桶延迟均值',{exact:true}).first().locator('..')).toContainText('40')
})
test('repeated refresh while running shares one request and keeps displayed data', async ({page}) => {
 let requests=0, pending=false, release!:()=>void
 const gate=new Promise<void>(resolve=>{release=resolve})
 await page.route('**/api/nodes/*/metrics?*', async route=> {
  if(new URL(route.request().url()).searchParams.get('series')==='ping') {
   requests++; if(pending) await gate
  }
  await route.fulfill({json:history})
 })
 await page.goto('/stats/1/')
 await page.getByRole('tab',{name:'网络质量',exact:true}).click()
 const target=page.getByRole('button').filter({hasText:'Synthetic target'})
 await expect(target).toBeVisible()
 const initial=requests; pending=true
 await page.getByRole('button',{name:'刷新网络质量',exact:true}).click()
 await expect.poll(()=>requests).toBe(initial+1)
 await page.getByRole('button',{name:'刷新网络质量',exact:true}).click()
 await expect(target).toBeVisible()
 expect(requests).toBe(initial+1)
 release()
 await expect(page.getByRole('status').filter({hasText:'正在加载历史'})).toHaveCount(0)
 expect(requests).toBe(initial+1)
})
