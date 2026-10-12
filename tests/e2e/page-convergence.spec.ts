import {test,expect} from '@playwright/test'
import {installFixture} from './fixtures'

for(const width of [360,390,1440]) test(`converged pages at ${width}px retain content without overflow`,async({page})=>{
 await page.setViewportSize({width,height:1000})
 const fixture=await installFixture(page)
 await page.goto('/network-quality')
 await expect.poll(()=>fixture.connected()).toBe(true);fixture.emitNodes()
 await expect(page.locator('.connection-status')).toHaveCount(0)
 await expect(page.locator('.quality-controls > [role="status"]')).toBeEmpty()
 const result=page.locator('main a[data-node-id]').first()
 await expect(result).toBeVisible()
 expect((await result.boundingBox())!.y).toBeLessThan(width<768?600:420)
 for(const path of ['/network-quality','/stats/1/','/stats/1/?tab=quality','/stats/1/?tab=ip']){
  await page.goto(path)
  await expect(page.locator('main')).toBeVisible()
  await expect.poll(()=>fixture.connected()).toBe(true);fixture.emitNodes();await expect(page.locator('.connection-status')).toHaveCount(0)
  if(path.includes('tab=quality')) await expect(page.getByRole('img',{name:/网络延迟趋势/})).toBeVisible()
  else if(path.includes('tab=ip')) await expect(page.getByText('已隐藏',{exact:true})).toBeVisible()
  else if(path.includes('stats')) await expect(page.getByRole('heading',{name:'处理器',exact:true})).toBeVisible()
  else await expect(page.locator('main a[data-node-id]').first()).toBeVisible()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.screenshot({path:`artifacts/acceptance/page-convergence/${width}-${path.includes('quality')?(path.includes('stats')?'node-quality':'quality'):path.includes('ip')?'ip':'overview'}.png`})
 }
})

test('mobile overview shows four metrics in two rows before full trends',async({page})=>{
 await page.setViewportSize({width:390,height:844});const fixture=await installFixture(page);await page.goto('/stats/1/')
 await expect.poll(()=>fixture.connected()).toBe(true);fixture.emitNodes();await expect(page.locator('.connection-status')).toHaveCount(0)
 const cards=page.locator('section').filter({has:page.getByRole('heading',{name:/^(处理器|内存|硬盘|网络流量)$/})})
 await expect(cards).toHaveCount(4)
 const boxes=await Promise.all((await cards.all()).map(card=>card.boundingBox()))
 expect(boxes[0]!.y).toBe(boxes[1]!.y)
 expect(boxes[2]!.y).toBe(boxes[3]!.y)
 const load=page.getByRole('heading',{name:'负载详情',exact:true})
 expect((await load.boundingBox())!.y).toBeLessThan(750)
 await expect(page.getByRole('img',{name:/磁盘使用率历史/})).toBeVisible()
 await expect(page.getByText('TCP 连接',{exact:true})).toBeVisible()
 await expect(page.getByRole('img',{name:/区间流量估算/})).toBeVisible()
})

test('mobile network trend comes before always visible target detail',async({page})=>{
 await page.setViewportSize({width:390,height:844});await installFixture(page);await page.goto('/stats/1/?tab=quality')
 const chart=page.getByRole('img',{name:/网络延迟趋势/})
 await expect(chart).toBeVisible()
 expect((await chart.boundingBox())!.y).toBeLessThan(650)
 await expect(page.getByRole('button',{name:'监控目标详情',exact:true})).toHaveCount(0)
 await expect(page.getByText(/目标平均成功率：/)).toBeVisible()
 await expect(page.getByRole('button').filter({hasText:'Demo·国内入口'}).first()).toBeVisible()
})

test('public identity is compact without empty map and keeps addresses private',async({page})=>{
 await page.setViewportSize({width:390,height:844});await installFixture(page);await page.goto('/stats/1/?tab=ip')
 await expect(page.getByText('已隐藏',{exact:true})).toBeVisible()
 await expect(page.getByText(/城市级定位不可用|暂无坐标/)).toHaveCount(0)
 expect((await page.getByRole('tabpanel').boundingBox())!.height).toBeLessThan(450)
})

test('secondary quality controls remain usable after disclosure',async({page})=>{
 await installFixture(page);await page.goto('/network-quality')
 await expect(page.locator('main a[data-node-id]').first()).toBeVisible()
 await expect(page.getByRole('button',{name:'探索视图',exact:true})).not.toBeVisible()
 await page.locator('summary').filter({hasText:'更多筛选'}).click()
 await page.getByRole('button',{name:'探索视图',exact:true}).click()
 await expect(page.locator('main a[data-node-id]').first()).toBeVisible()
 await page.locator('summary').filter({hasText:'更多筛选'}).click()
 await expect(page.locator('summary').filter({hasText:'更多筛选'})).toContainText('探索视图')
 await expect(page.getByRole('button',{name:'探索视图',exact:true})).not.toBeVisible()
})

test('home secondary filters disclose and active filter chips stay removable',async({page})=>{
 await installFixture(page);await page.goto('/')
 await expect(page.getByTestId('node-card')).toHaveCount(16)
 await expect(page.getByRole('button',{name:'高丢包',exact:true})).not.toBeVisible()
 await page.getByRole('button',{name:'更多筛选',exact:true}).click()
 await page.getByRole('button',{name:'即将到期',exact:true}).click()
 await page.keyboard.press('Escape')
 const chip=page.getByRole('button',{name:/清除.*即将到期/})
 await expect(chip).toBeVisible();await chip.click()
 await expect(page.getByTestId('node-card')).toHaveCount(16)
})

test('overview mounts small history charts only when desktop layout exposes them',async({page})=>{
 await page.setViewportSize({width:390,height:844});await installFixture(page);await page.goto('/stats/1/')
 await expect(page.getByRole('heading',{name:'处理器',exact:true})).toBeVisible()
 await expect(page.getByRole('img',{name:/负载详情/}).locator('canvas')).toBeVisible()
 await expect(page.locator('.metric-spark')).toHaveCount(0)
 await page.setViewportSize({width:1440,height:1000})
 await expect(page.locator('.metric-spark')).toHaveCount(3)
 await expect(page.locator('.metric-spark canvas')).toHaveCount(3)
 await page.setViewportSize({width:390,height:844})
 await expect(page.locator('.metric-spark')).toHaveCount(0)
})
