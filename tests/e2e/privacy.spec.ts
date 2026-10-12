import { test, expect } from '@playwright/test'
test('focus retains the confirmed view until downgrade removes administrator information', async ({ page }) => {
  let admin = true
  let release: (() => void) | undefined
  await page.route('**/api/me', async route => {
    if (!admin) await new Promise<void>(resolve => { release = resolve })
    await route.fulfill({ json: { authed: admin, public_page: true, site_name: 'Test', github: false } })
  })
  await page.route('**/api/nodes', async route => {
    const data = await (await route.fetch()).json()
    data.nodes = data.nodes.map((n: object, i: number) => ({ ...n, public: i !== 0, hostname: 'synthetic-private-host', addresses: [{ address: '203.0.113.11', source: 'manual' }] }))
    await route.fulfill({ json: data })
  })
  await page.goto('/stats/1/')
  await page.getByRole('tab', { name: /IP/ }).click()
  await expect(page.getByText('203.0.113.11', { exact: true })).toBeVisible()
  admin = false
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect.poll(() => !!release).toBe(true)
  await expect(page.getByText('203.0.113.11', { exact: true })).toBeVisible()
  await expect(page.getByText('正在确认身份…')).toHaveCount(0)
  release!()
  await expect(page.getByText('节点不存在或未公开。')).toBeVisible()
  await expect(page.getByText('synthetic-private-host')).toHaveCount(0)
})

test('initial checking blocks nodes; unavailable review is recoverable and visibility upgrades identity', async ({ page }) => {
  let mode: 'visitor' | 'admin' | 'failure' = 'visitor'
  let meCalls = 0, nodeCalls = 0
  let release: (() => void) | undefined
  await page.route('**/api/me', async route => {
    meCalls++
    if (meCalls === 1) await new Promise<void>(r => { release = r })
    await route.fulfill(mode === 'failure' ? { status: 503 } : { json: { authed: mode === 'admin', public_page: true } })
  })
  await page.route('**/api/nodes', async route => {
    nodeCalls++
    const data = await (await route.fetch()).json()
    data.nodes = data.nodes.map((n: object) => ({ ...n, public: true, ip: '203.0.113.21', ipv4: '203.0.113.21', ipv6: '2001:db8::21', hostname: 'synthetic-host' }))
    await route.fulfill({ json: data })
  })
  await page.goto('/stats/1/')
  await expect(page.getByText('正在确认身份…')).toBeVisible()
  expect(nodeCalls).toBe(0)
  release!()
  await page.getByRole('tab', { name: '归属地与节点信息' }).click()
  await expect(page.getByText('公开视图', { exact: false })).toBeVisible()
  await expect(page.getByText('203.0.113.21', { exact: true })).toHaveCount(0)
  mode = 'admin'
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect(page.getByText('203.0.113.21', { exact: true })).toHaveCount(1)
  await expect(page.getByText('2001:db8::21', { exact: true })).toBeVisible()
  await expect(page.getByText('来源未提供')).toHaveCount(2)
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) }, configurable: true }))
  await page.getByRole('button', { name: '复制地址' }).first().click()
  await expect(page.getByText('复制失败，请手动选择地址')).toBeVisible()
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: (text: string) => { (window as unknown as { copied: string }).copied = text; return Promise.resolve() } }, configurable: true }))
  await page.getByRole('button', { name: '复制地址' }).nth(1).click()
  await expect(page.getByText('已复制', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { copied: string }).copied)).toBe('2001:db8::21')
  mode = 'failure'
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByText('身份状态暂时无法确认')).toBeVisible()
  await expect(page.getByText('203.0.113.21', { exact: true })).toHaveCount(0)
  mode = 'visitor'
  await page.getByRole('button', { name: '重试', exact: true }).click()
  await expect(page.getByText('公开视图', { exact: false })).toBeVisible()
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain('203.0.113')
})

test('node 401 rechecks identity once and me 401 does not recurse', async ({ page }) => {
  let invalid = false, calls = 0
  await page.route('**/api/me', route => { calls++; return route.fulfill(invalid ? { status: 401 } : { json: { authed: true, public_page: true } }) })
  await page.route('**/api/nodes', async route => {
    if (invalid) return route.fulfill({ status: 401 })
    return route.continue()
  })
  await page.goto('/')
  await expect(page.getByText('Demo 北京 01', { exact: true })).toBeVisible()
  invalid = true
  await page.getByRole('button', { name: '重新连接' }).click()
  await expect(page.getByText('身份状态暂时无法确认')).toBeVisible()
  const final = calls
  await page.waitForTimeout(1100)
  expect(calls).toBe(final)
  expect(calls).toBe(2)
})

test('old HTTP and websocket frames cannot restore data after review; concurrent review events deduplicate', async ({ page }) => {
  let admin = true, meCalls = 0, holdNodes = false
  let releaseNodes: (() => void) | undefined, releaseMe: (() => void) | undefined
  const sockets: import('@playwright/test').WebSocketRoute[] = []
  let oldFrame: unknown
  let markOldResponseSent!: () => void
  const oldResponseSent = new Promise<void>(r => { markOldResponseSent = r })
  await page.routeWebSocket('**/api/ws', socket => { sockets.push(socket) })
  await page.route('**/api/me', async route => {
    meCalls++
    if (!admin) await new Promise<void>(r => { releaseMe = r })
    await route.fulfill({ json: { authed: admin, public_page: true } })
  })
  await page.route('**/api/nodes', async route => {
    const data = await (await route.fetch()).json()
    data.nodes = data.nodes.map((n: object) => ({ ...n, public: true, addresses: [{ address: '203.0.113.31', source: 'manual' }] }))
    oldFrame = data
    const held = holdNodes && admin
    if (held) await new Promise<void>(r => { releaseNodes = r })
    await route.fulfill({ json: data })
    if (held) markOldResponseSent()
  })
  await page.goto('/stats/1/')
  await page.getByRole('tab', { name: /IP/ }).click()
  await expect(page.getByText('203.0.113.31', { exact: true })).toBeVisible()
  holdNodes = true
  await page.getByRole('button', { name: '重新连接' }).click()
  await expect.poll(() => !!releaseNodes).toBe(true)
  const oldSocket = sockets.at(-1)!
  admin = false
  await page.evaluate(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')) })
  await expect.poll(() => !!releaseMe).toBe(true)
  await expect(page.getByText('203.0.113.31', { exact: true })).toBeVisible()
  expect(meCalls).toBe(2)
  releaseMe!()
  await expect(page.getByText('公开视图', { exact: false })).toBeVisible()
  // Deliver the old HTTP response only after the downgrade barrier has committed.
  releaseNodes!()
  await oldResponseSent
  oldSocket.send(JSON.stringify(oldFrame))
  await page.waitForTimeout(100)
  await expect(page.getByText('203.0.113.31', { exact: true })).toHaveCount(0)
})

test('contradictory successful identity and repeated node 401 stop automatic recovery', async ({ page }) => {
  let nodes = 0, identities = 0
  await page.route('**/api/me', route => { identities++; return route.fulfill({ json: { authed: false, public_page: true } }) })
  await page.route('**/api/nodes', route => { nodes++; return route.fulfill({ status: 401 }) })
  await page.goto('/')
  await expect(page.getByText('身份状态暂时无法确认')).toBeVisible()
  await page.waitForTimeout(1100)
  expect(nodes).toBe(2)
  expect(identities).toBe(2)
})

test('identity review clears mounted history and starts a fresh authorized history owner', async ({ page }) => {
  let admin = true, histories = 0
  let release: (() => void) | undefined
  await page.route('**/api/me', async route => {
    if (!admin) await new Promise<void>(r => { release = r })
    await route.fulfill({ json: { authed: admin, public_page: true } })
  })
  await page.route('**/api/nodes/*/metrics?*', route => {
    histories++
    return route.fulfill({ json: { metrics: [], ping: [{ task_id: 1, ts: 120, latency: 42 }], probes: { '1': admin ? 'Synthetic administrator history' : 'Synthetic visitor history' } } })
  })
  await page.goto('/stats/1/')
  await page.getByRole('tab', { name: '网络质量', exact: true }).click()
  await expect(page.getByRole('button').filter({ hasText: 'Synthetic administrator history' })).toBeVisible()
  admin = false
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByRole('button').filter({ hasText: 'Synthetic administrator history' })).toBeVisible()
  const before = histories
  await expect.poll(() => !!release).toBe(true)
  release!()
  await expect(page.getByRole('button').filter({ hasText: 'Synthetic visitor history' })).toBeVisible()
  await expect(page.getByRole('button').filter({ hasText: 'Synthetic administrator history' })).toHaveCount(0)
  expect(histories).toBeGreaterThan(before)
})
