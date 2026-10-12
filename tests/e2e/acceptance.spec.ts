import { test, expect } from '@playwright/test'
import { installFixture } from './fixtures'

test('2-second WebSocket frames reuse one history batch', async ({page}) => {
  const fixture = await installFixture(page)
  let count = 0, active = 0, peak = 0
  await page.route('**/api/nodes/*/metrics?*', async route => {
    count++; active++; peak = Math.max(peak, active)
    await new Promise(resolve => setTimeout(resolve, 100))
    await route.fulfill({response: await route.fetch()}); active--
  })
  await page.goto('/network-quality')
  await expect.poll(() => count).toBe(16)
  await expect.poll(() => active).toBe(0)
  for (let i = 0; i < 4; i++) {fixture.emitNodes(); await page.waitForTimeout(2000)}
  expect(count).toBe(16); expect(peak).toBeLessThanOrEqual(4)
})

test('navigation removes dashboard consumer and late history cannot restore its DOM', async ({page}) => {
  await installFixture(page)
  let pingStarted = 0, release!: () => void
  const gate = new Promise<void>(resolve => {release = resolve})
  await page.route('**/api/nodes/*/metrics?*', async route => {
    if (new URL(route.request().url()).searchParams.get('series') === 'ping') { pingStarted++; await gate }
    await route.fulfill({json:{metrics:[],ping:[],probes:{}}})
  })
  try {
    await page.goto('/')
    await expect.poll(() => pingStarted).toBe(4)
    await page.locator('a[href="/stats/1/"]').first().click()
    await expect(page.getByRole('tab', {name:'概况', exact:true})).toHaveAttribute('aria-selected','true')
    release()
    await expect(page.getByTestId('node-card')).toHaveCount(0)
    await expect(page.getByText(/历史已完成/)).toHaveCount(0)
  } finally { release() }
})

test('503 retains old target then recovers at next periodic cycle', async ({page}) => {
  await page.clock.install(); await page.clock.pauseAt(new Date())
  await installFixture(page)
  let fail = false, count = 0
  await page.route('**/api/nodes/*/metrics?*', route => {
    count++
    return fail ? route.fulfill({status:503, contentType:'text/plain', body:'Synthetic cycle outage'}) : route.fulfill({json:{metrics:[], probes:{1:'Synthetic target'}, ping:[{task_id:1,ts:120,latency:40}],loss:{}}})
  })
  await page.goto('/stats/1/?tab=quality')
  const target = page.getByRole('button').filter({hasText:'Synthetic target'})
  await expect.poll(async () => {await page.clock.runFor(100); return target.count()}).toBe(1)
  await expect(target).toBeVisible()
  const initial = count; fail = true
  await page.clock.runFor(60001)
  await expect(page.getByText('Synthetic cycle outage',{exact:false})).toBeVisible()
  await expect(target).toBeVisible(); expect(count).toBe(initial+1)
  fail = false; await page.clock.runFor(60001)
  await expect(page.getByText('Synthetic cycle outage',{exact:false})).toHaveCount(0)
  await expect(target).toBeVisible(); expect(count).toBe(initial+2)
})

test('fixture auth transition clears synthetic addresses and stale WS cannot refill', async ({page}) => {
  const fixture = await installFixture(page,{admin:true})
  await page.goto('/stats/1/?tab=ip')
  await expect(page.getByText('203.0.113.11',{exact:true})).toBeVisible()
  fixture.setAdmin(false)
  await page.evaluate(() => dispatchEvent(new Event('focus')))
  fixture.emitNodes()
  await expect(page.getByText('203.0.113.11',{exact:true})).toHaveCount(0)
  await expect(page.getByText('公开视图',{exact:false})).toBeVisible()
  expect(await page.evaluate(() => JSON.stringify({...localStorage,...sessionStorage}))).not.toContain('synthetic-host')
})

test('mock history respects ranges, series and missing nodes', async ({request}) => {
  for (const hours of [1,6,24,168]) {
    const response = await request.get(`/api/nodes/1/metrics?hours=${hours}&points=180&series=metrics`)
    const data = await response.json()
    expect(Object.keys(data)).toEqual(['metrics'])
    const step = 60 * Math.max(1,Math.ceil(hours*60/180))
    expect(data.metrics.at(-1).ts-data.metrics[0].ts).toBe(Math.floor(hours*3600/step)*step)
    expect(data.metrics[1].ts-data.metrics[0].ts).toBe(step)
    const ping = await (await request.get(`/api/nodes/1/metrics?hours=${hours}&points=180&series=ping`)).json()
    expect(ping.metrics).toBeUndefined(); expect(ping.ping.length).toBe(data.metrics.length*3)
  }
  expect((await request.get('/api/nodes/999999/metrics?hours=24')).status()).toBe(404)
})

test('live metrics update while frozen order stays stable', async ({page}) => {
  const fixture = await installFixture(page)
  await page.goto('/')
  await page.getByRole('button',{name:'排序：默认排序，降序',exact:true}).click()
  await page.getByRole('button',{name:'CPU使用率',exact:true}).click()
  const cards = page.locator('a[href^="/stats/"]')
  const before = await cards.evaluateAll(elements => elements.map(el => el.getAttribute('href')))
  const first = Number(before[0]!.match(/\d+/)![0])
  fixture.emitNodes(nodes => nodes.map(n => ({...n,metrics:n.metrics ? {...n.metrics,cpu:n.id===first?0:99} : null})))
  await expect(cards.first().locator('xpath=ancestor::article')).toContainText('0%')
  expect(await cards.evaluateAll(elements => elements.map(el => el.getAttribute('href')))).toEqual(before)
})

for (const cancel of [false,true]) {
  test(`delayed layout scroll restoration ${cancel ? 'respects user cancellation' : 'waits for available height'}`, async ({page}) => {
    await page.addInitScript(() => {
      sessionStorage.setItem('dstatus-dashboard-v1',JSON.stringify({v:1,scrollY:800}))
      ;(window as any).syntheticLayoutReady = false
      const getter = Object.getOwnPropertyDescriptor(Element.prototype,'scrollHeight')!.get!
      Object.defineProperty(Element.prototype,'scrollHeight',{configurable:true,get(){return (window as any).syntheticLayoutReady ? getter.call(this) : innerHeight}})
    })
    await page.goto('/')
    await expect(page.locator('a[href^="/stats/"]').first()).toBeVisible()
    await page.waitForTimeout(200)
    expect(await page.evaluate(() => scrollY)).toBe(0)
    if (cancel) await page.evaluate(() => dispatchEvent(new WheelEvent('wheel')))
    await page.evaluate(() => {(window as any).syntheticLayoutReady = true})
    if (cancel) {await page.waitForTimeout(300); expect(await page.evaluate(() => scrollY)).toBe(0)}
    else await expect.poll(() => page.evaluate(() => scrollY)).toBe(800)
  })
}
