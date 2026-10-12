import { test, expect } from '@playwright/test'
import { openHarness } from './page'
// @ts-ignore Shared synthetic node fixtures.
import { makeNodes } from '../performance/synthetic-data.mjs'

const source = `
 import React from '/node_modules/.vite/deps/react.js';
 import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
 import App from '/src/App.tsx';
 import '/src/index.css';
 ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
 history.replaceState(null, '', '/');
`

test('public navigation keeps nodes, completed history and websocket while identity review is pending', async ({ page }) => {
  let meCalls = 0, nodeCalls = 0, histories = 0, sockets = 0, release!: () => void
  const held = new Promise<void>(r => release = r)
  await page.routeWebSocket('**/api/ws', socket => { sockets++; socket.send(JSON.stringify({ nodes: makeNodes(16, { now: 1790800000 }) })) })
  await page.route('**/api/me', async route => {
    meCalls++
    if (meCalls > 1) await held
    await route.fulfill({ json: { authed: false, public_page: true, site_name: 'Test' } })
  })
  await page.route('**/api/nodes', route => { nodeCalls++; return route.continue() })
  await page.route('**/api/nodes/*/metrics?*', route => {
    histories++
    return route.fulfill({ json: { metrics: [], ping: [{ task_id: 1, ts: 120, latency: 42 }], probes: { 1: 'Cached public target' } } })
  })
  try {
    await openHarness(page, source)
    await expect(page.getByTestId('node-card').first()).toBeVisible()
    await expect.poll(() => histories).toBe(16)
    await expect(page.getByText(/历史已完成/)).toHaveCount(0)
    const initial = { nodeCalls, histories, sockets }
    await page.getByRole('link', { name: '网络质量', exact: true }).click()
    await expect.poll(() => meCalls).toBe(2)
    await expect(page.getByRole('heading', { name: '网络质量监控', exact: true })).toBeVisible()
    await expect(page.getByText('正在确认身份…')).toHaveCount(0)
    expect({ nodeCalls, histories, sockets }).toEqual(initial)
    release()
    await page.waitForTimeout(100)
    expect({ nodeCalls, histories, sockets }).toEqual(initial)
    await page.getByRole('link', { name: '首页', exact: true }).click()
    await expect(page.getByTestId('node-card').first()).toBeVisible()
    await expect.poll(() => meCalls).toBe(3)
    expect({ nodeCalls, histories, sockets }).toEqual(initial)
  } finally { release() }
})

test('failed background identity review removes the public page and requires retry', async ({ page }) => {
  let calls = 0
  await page.route('**/api/me', route => {
    calls++
    return route.fulfill(calls === 2 ? { status: 503 } : { json: { authed: false, public_page: true } })
  })
  await openHarness(page, source)
  await expect(page.getByTestId('node-card').first()).toBeVisible()
  await page.getByRole('link', { name: '网络质量', exact: true }).click()
  await expect(page.getByText('身份状态暂时无法确认')).toBeVisible()
  await expect(page.getByRole('heading', { name: '网络质量监控', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '重试', exact: true }).click()
  await expect(page.getByRole('heading', { name: '网络质量监控', exact: true })).toBeVisible()
})

test('focus shares a pending public review without blocking or another identity request', async ({ page }) => {
  let calls = 0, release!: () => void
  const held = new Promise<void>(r => release = r)
  await page.route('**/api/me', async route => {
    calls++
    if (calls === 2) await held
    await route.fulfill({ json: { authed: false, public_page: true } })
  })
  try {
    await openHarness(page, source)
    await expect(page.getByTestId('node-card').first()).toBeVisible()
    await page.getByRole('link', { name: '网络质量', exact: true }).click()
    await expect(page.getByRole('heading', { name: '网络质量监控', exact: true })).toBeVisible()
    await page.evaluate(() => dispatchEvent(new Event('focus')))
    await expect(page.getByText('正在确认身份…')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: '网络质量监控', exact: true })).toBeVisible()
    expect(calls).toBe(2)
    release()
    await expect(page.getByRole('heading', { name: '网络质量监控', exact: true })).toBeVisible()
  } finally { release() }
})

test('a public-to-admin review clears public history and refetches under the new identity', async ({ page }) => {
  let admin = false, nodes = 0, histories = 0
  await page.route('**/api/me', route => route.fulfill({ json: { authed: admin, public_page: true } }))
  await page.route('**/api/nodes', route => { nodes++; return route.continue() })
  await page.route('**/api/nodes/*/metrics?*', route => {
    histories++
    return route.fulfill({ json: { metrics: [], ping: [{ task_id: 1, ts: 120, latency: 42 }], probes: { 1: admin ? 'Admin target' : 'Visitor target' } } })
  })
  await openHarness(page, source)
  await expect.poll(() => histories).toBe(16)
  await expect(page.getByText(/历史已完成/)).toHaveCount(0)
  const before = { nodes, histories }
  admin = true
  await page.getByRole('link', { name: '网络质量', exact: true }).click()
  await expect(page.getByRole('option', { name: 'Admin target', exact: true })).toHaveCount(1)
  await expect(page.getByRole('option', { name: 'Visitor target', exact: true })).toHaveCount(0)
  await expect.poll(() => nodes).toBe(before.nodes + 1)
  await expect.poll(() => histories).toBe(before.histories + 16)
})

test('401 cancels a pending public review and a late answer cannot restore the page', async ({ page }) => {
  let calls = 0, release!: () => void
  const held = new Promise<void>(r => release = r)
  await page.route('**/api/me', async route => {
    calls++
    const call = calls
    if (call === 2) await held
    await route.fulfill(call >= 3 ? { status: 401 } : { json: { authed: false, public_page: true } })
  })
  try {
    await openHarness(page, source)
    await expect(page.getByTestId('node-card').first()).toBeVisible()
    await page.getByRole('link', { name: '网络质量', exact: true }).click()
    await expect(page.getByRole('heading', { name: '网络质量监控', exact: true })).toBeVisible()
    await page.evaluate(() => dispatchEvent(new Event('dstatus-auth-invalidated')))
    await expect(page.getByText('身份状态暂时无法确认')).toBeVisible()
    expect(calls).toBe(3)
    release()
    await page.waitForTimeout(100)
    await expect(page.getByRole('heading', { name: '网络质量监控', exact: true })).toHaveCount(0)
    await expect(page.getByText('身份状态暂时无法确认')).toBeVisible()
  } finally { release() }
})

test('closing the public page during background review clears data before redirecting to admin', async ({ page }) => {
  let calls = 0, nodes = 0
  await page.route('**/api/me', route => {
    calls++
    return route.fulfill({ json: { authed: false, public_page: calls === 1 } })
  })
  await page.route('**/api/nodes', route => { nodes++; return route.continue() })
  await page.route('**/admin/', route => route.fulfill({ contentType: 'text/html', body: '<h1>Status page closed</h1>' }))
  await openHarness(page, source)
  await expect(page.getByTestId('node-card').first()).toBeVisible()
  const before = nodes
  await page.getByRole('link', { name: '网络质量', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Status page closed', exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/admin\/$/)
  expect(nodes).toBe(before)
})
