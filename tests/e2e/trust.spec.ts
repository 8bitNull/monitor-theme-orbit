import { test, expect } from '@playwright/test'
test('aggregate resources and unlimited quota are honest', async ({ page }) => {
  await page.goto('/stats/1/')
  await expect(page.getByText('全部网络接口汇总', { exact: true })).toBeVisible()
  await expect(page.getByText('eth0', { exact: true })).toHaveCount(0)
  await expect(page.getByText('ext4', { exact: true })).toHaveCount(0)
  await expect(page.getByText('区间流量估算', { exact: true })).toBeVisible()
  await expect(page.getByText('依据桶平均速率估算，缺失区间未计入')).toBeVisible()
  await expect(page.getByText('IPv4', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('progressbar', { name: '周期流量用量' })).toHaveCount(0)
  await expect(page.getByText('近10分钟', { exact: true })).toHaveCount(0)
})
for (const used of [0,80,100,120]) test(`finite quota ${used}% is accessible and colored`, async ({ page }) => {
  await page.route('**/api/nodes', async route => {
    const response = await route.fetch(); const body = await response.json()
    body.nodes[0].traffic_limit = 100000000; body.nodes[0].month_used = used * 1000000
    await route.fulfill({ json: body })
  })
  await page.goto('/stats/1/')
  const bar = page.getByRole('progressbar', {name:'周期流量用量'})
  await expect(bar).toHaveAttribute('aria-valuenow', String(Math.min(used,100)))
  await expect(bar.locator('div')).toHaveClass(new RegExp(`quota-${used>=100?'danger':used>=80?'warning':'normal'}`))
})
test('card distinguishes unknown disk capacity from valid zero usage', async ({ page }) => {
  await page.route('**/api/nodes', async route => {
    const response = await route.fetch(); const body = await response.json()
    body.nodes[0].disk_total = 0
    body.nodes[0].metrics.disk_used = 0
    await route.fulfill({json:body})
  })
  await page.goto('/')
  const card = page.locator('article').filter({has:page.locator('a[href="/stats/1/"]')}).first()
  await expect(card).toBeVisible()
  await expect(card.getByText('--', {exact:true})).toHaveCount(1)
})
test('card displays valid zero resource usage', async ({ page }) => {
  await page.route('**/api/nodes', async route => {
    const response = await route.fetch(); const body = await response.json()
    body.nodes[0].metrics.cpu = 0; body.nodes[0].metrics.mem_used = 0; body.nodes[0].metrics.disk_used = 0
    await route.fulfill({json:body})
  })
  await page.goto('/')
  const card = page.locator('article').filter({has:page.locator('a[href="/stats/1/"]')}).first()
  await expect(card.getByText('0%', {exact:true})).toHaveCount(1)
  await expect(card.getByText('0.0%', {exact:true})).toHaveCount(2)
})
