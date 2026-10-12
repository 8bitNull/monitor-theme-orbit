import {test,expect} from '@playwright/test'
import {installFixture} from './fixtures'

for(const width of [360,390,1440]) test(`healthy layout ${width} clears fixed navigation and prioritizes cards`,async({page})=>{
 await page.setViewportSize({width,height:1000})
 const fixture=await installFixture(page)
 await page.goto('/')
 await expect(page.getByTestId('node-card')).toHaveCount(16)
 fixture.emitNodes()
 await expect(page.locator('.connection-status')).toHaveCount(0)
 const nav=(await page.locator('.navbar').boundingBox())!,summary=(await page.locator('.node-summary').boundingBox())!,card=(await page.getByTestId('node-card').first().boundingBox())!
 expect(summary.y).toBeGreaterThanOrEqual(nav.y+nav.height)
 expect(card.y).toBeLessThanOrEqual(width===1440?540:430)
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false)
 await page.screenshot({path:`artifacts/acceptance/layout-compact/healthy-${width}.png`})
})

test('desktop regions share a compact row and reset appears only for an active selection',async({page})=>{
 await page.setViewportSize({width:1440,height:1000})
 await installFixture(page);await page.goto('/')
 const region=page.locator('section.surface-card').filter({has:page.locator('.region-tags-row')})
 await expect(region).toBeVisible()
 expect((await region.boundingBox())!.height).toBeLessThanOrEqual(90)
 await expect(page.getByRole('button',{name:'清除地区筛选',exact:true})).toHaveCount(0)
 const china=page.getByRole('button',{name:'中国，4个节点',exact:true})
 await china.click();await expect(page.getByTestId('node-card')).toHaveCount(4)
 const reset=page.getByRole('button',{name:'清除地区筛选',exact:true})
 await expect(reset).toBeVisible();await reset.click()
 await expect(page.getByTestId('node-card')).toHaveCount(16)
 await expect(reset).toHaveCount(0)
 await expect(page.getByRole('button',{name:'3D地图',exact:true})).toHaveAttribute('aria-expanded','false')
})

for(const path of ['/network-quality','/stats/1/']) test(`healthy ${path} keeps main content below navigation`,async({page})=>{
 await page.setViewportSize({width:390,height:844})
 const fixture=await installFixture(page)
 await page.goto(path)
 await expect(page.locator('main')).toBeVisible();await expect.poll(()=>fixture.connected()).toBe(true)
 fixture.emitNodes();await expect(page.locator('.connection-status')).toHaveCount(0)
 const box=(await page.locator('main').boundingBox())!,nav=(await page.locator('.navbar').boundingBox())!
 expect(box.y).toBeGreaterThanOrEqual(nav.y+nav.height)
})

for(const path of ['/','/stats/1/']) test(`safe area ${path} clears navigation including mobile detail tabs`,async({page})=>{
 await page.setViewportSize({width:390,height:844})
 // Exercise the real CSS and inline safe-area styles with a 20px inset.
 await page.route('**/assets/*',async route=>{
  if(!/\.(js|css)$/.test(new URL(route.request().url()).pathname))return route.continue()
  const response=await route.fetch()
  const body=(await response.text()).replace(/env\(safe-area-inset-top(?:,\s*0px)?\)/g,'20px')
  await route.fulfill({response,body})
 })
 const fixture=await installFixture(page);await page.goto(path)
 await expect(page.locator('main')).toBeVisible();await expect.poll(()=>fixture.connected()).toBe(true)
 fixture.emitNodes();await expect(page.locator('.connection-status')).toHaveCount(0)
 const nav=(await page.locator('.navbar').boundingBox())!,content=(await page.locator('main > :first-child').boundingBox())!
 expect(content.y).toBeGreaterThanOrEqual(nav.y+nav.height)
})

for(const path of ['/','/stats/1/']) test(`mobile ${path} navigation links have touch targets`,async({page})=>{
 await page.setViewportSize({width:360,height:844})
 await installFixture(page);await page.goto(path)
 await expect(page.locator('main')).toBeVisible()
 const links=page.locator('.navbar a[href="/"]')
 expect(await links.count()).toBeGreaterThan(0)
 for(const link of await links.all()) {
  const box=(await link.boundingBox())!
  expect(box.height).toBeGreaterThanOrEqual(44)
  expect(box.width).toBeGreaterThanOrEqual(44)
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false)
})
