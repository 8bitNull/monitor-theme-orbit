import { test, expect } from '@playwright/test'
import { installFixture } from './fixtures'

const sampled = {metrics:[], probes:{1:'Synthetic target'}, ping:[{task_id:1,ts:120,latency:42,loss:0}],loss:{1:0}}

for (const layout of ['card', 'list']) test(`dashboard ${layout} labels retained history independently of healthy live nodes and retries`, async ({page}) => {
  await page.clock.install()
  const fixture = await installFixture(page)
  let fail = false
  await page.route('**/api/nodes/*/metrics?*', route => fail ? route.fulfill({status:503,body:'Synthetic outage'}) : route.fulfill({json:sampled}))
  await page.goto('/')
  await expect(page.getByTestId('node-card').first()).toContainText('42')
  await expect(page.getByText(/历史已完成/)).toHaveCount(0)
  await expect.poll(() => fixture.connected()).toBe(true)
  fixture.emitNodes()
  await expect(page.locator('.connection-status')).toHaveCount(0)
  if (layout === 'list') await page.getByRole('button',{name:'列表视图',exact:true}).click()
  fail = true
  await page.clock.fastForward(61000)
  fixture.emitNodes(nodes => nodes.map(n=>({...n,metrics:{...n.metrics,cpu:37}})))
  await expect(page.getByRole('button',{name:'重试历史',exact:true})).toBeVisible()
  const row = layout === 'card' ? page.getByTestId('node-card').first() : page.locator('main a[href="/stats/1/"]').filter({visible:true}).first()
  await expect(row).toContainText('历史获取失败')
  await expect(row).toContainText('数据已过期')
  await expect(row).toContainText('42')
  await expect(row).toContainText('37')
  await expect(page.locator('.connection-status')).toHaveCount(0)
  fail = false
  await page.getByRole('button',{name:'重试历史',exact:true}).click()
  await expect(row).not.toContainText('历史获取失败')
  await expect(page.getByRole('button',{name:'重试历史',exact:true})).toHaveCount(0)
})

test('resource initial history failure is distinct from empty data and retry recovers', async ({page}) => {
  await installFixture(page)
  let fail = true
  await page.route('**/api/nodes/*/metrics?*', async route => fail ? route.fulfill({status:503,body:'Synthetic outage'}) : route.fulfill({response:await route.fetch()}))
  await page.goto('/stats/1/')
  await expect(page.getByRole('alert')).toContainText('历史获取失败')
  await expect(page.getByText('处理器',{exact:true})).toBeVisible()
  fail = false
  await page.getByRole('button',{name:'重试历史',exact:true}).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('img',{name:/带宽/}).first()).toBeVisible()
})

test('resource retained histories are marked stale while live metrics stay current', async ({page}) => {
  await page.clock.install()
  const fixture = await installFixture(page)
  let fail = false
  await page.route('**/api/nodes/*/metrics?*', async route => fail ? route.fulfill({status:503,body:'Synthetic outage'}) : route.fulfill({response:await route.fetch()}))
  await page.goto('/stats/1/')
  await expect(page.getByRole('img',{name:/带宽/}).first()).toBeVisible()
  fail = true
  await page.clock.fastForward(61000)
  fixture.emitNodes(nodes=>nodes.map(n=>({...n,metrics:{...n.metrics,cpu:37}})))
  await expect(page.getByRole('alert')).toContainText('数据已过期')
  await expect(page.getByRole('alert')).toContainText('保留上次历史')
  await expect(page.locator('.connection-status')).toHaveCount(0)
  await expect(page.getByRole('img',{name:/带宽/}).first()).toBeVisible()
})

for (const layout of ['经典卡片','探索视图']) test(`network ${layout} distinguishes each node configuration, empty, loading, failure and timeout`, async ({page}) => {
  await installFixture(page)
  let release!:()=>void
  const gate = new Promise<void>(resolve=>{release=resolve})
  await page.route('**/api/nodes/*/metrics?*', async route => {
    await gate
    const id = Number(new URL(route.request().url()).pathname.split('/')[3])
    if(id===3) return route.fulfill({status:503,body:'Synthetic outage'})
    const data = id===1 ? {metrics:[],probes:{},ping:[]} : id===2 ? {...sampled,ping:[],loss:{}} : {...sampled,ping:[{task_id:1,ts:120,latency:null,loss:100}],loss:{1:100}}
    return route.fulfill({json:data})
  })
  try {
    await page.goto('/network-quality')
    await page.locator('summary').filter({hasText:'更多筛选'}).click()
    await page.getByRole('button').filter({hasText:layout}).click()
    const row=(id:number)=>page.locator(`main a[href^="/stats/${id}/?tab=quality"]`)
    await expect(row(1)).toContainText('正在加载历史')
    release()
    await expect(row(1)).toContainText('未配置监控目标')
    await expect(row(2)).toContainText('当前时间范围没有探测样本')
    await expect(row(3)).toContainText('历史获取失败')
    await expect(row(4)).toContainText('100.0')
    await expect(row(4)).not.toContainText('没有探测样本')
    await page.getByLabel('监控目标',{exact:true}).selectOption('1')
    await expect(row(1)).toContainText('未配置监控目标')
    await expect(row(2)).toContainText('当前时间范围没有探测样本')
  } finally {release()}
})

test('NodeQuality distinguishes no configuration from a configured empty window', async ({page}) => {
  await installFixture(page)
  await page.route('**/api/nodes/*/metrics?*', route=>route.fulfill({json:{metrics:[],probes:{},ping:[]}}))
  await page.goto('/stats/1/?tab=quality')
  await expect(page.getByText('未配置监控目标').first()).toBeVisible()
  await page.route('**/api/nodes/*/metrics?*', route=>route.fulfill({json:{...sampled,ping:[],loss:{}}}))
  await page.getByRole('button',{name:'刷新网络质量',exact:true}).click()
  await expect(page.getByText('当前时间范围没有探测样本').first()).toBeVisible()
  await expect(page.getByText('未配置监控目标')).toHaveCount(0)
})
