import { test, expect } from '@playwright/test'
import { openHarness } from './page'
// @ts-ignore Shared synthetic node fixtures.
import { makeNodes } from '../performance/synthetic-data.mjs'

test('live detail numbers update without resetting history charts; history and capacity changes still redraw', async ({ page }) => {
  const node = makeNodes(1, { now: 1790800000 })[0]
  node.mem_total = 1000; node.disk_total = 2000
  node.metrics.cpu = 12; node.metrics.mem_used = 250; node.metrics.disk_used = 500
  const metrics = [
    { ts: 1790799700, cpu: 10, mem_used: 100, disk_used: 200, net_rx: 125000, net_tx: 250000 },
    { ts: 1790800000, cpu: 20, mem_used: 200, disk_used: 400, net_rx: 250000, net_tx: 125000 },
  ]
  await page.route('**/src/components/Echart.tsx*', async route => {
    const response = await route.fetch()
    let body = await response.text()
    const assignment = 'chartRef.current = init(ref.current);'
    expect(body).toContain(assignment)
    // Observe actual ECharts calls and rendered options; no replacement renderer.
    body = body.replace(assignment, assignment + `
      globalThis.__charts ??= []; globalThis.__charts.push(chartRef.current);
      const originalSetOption = chartRef.current.setOption.bind(chartRef.current);
      chartRef.current.setOption = (...args) => { globalThis.__chartUpdates = (globalThis.__chartUpdates ?? 0) + 1; return originalSetOption(...args); };
    `)
    await route.fulfill({ response, body })
  })
  await openHarness(page, `
    import React from '/node_modules/.vite/deps/react.js';
    import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
    import { Overview } from '/src/pages/DetailOverview.tsx';
    import '/src/index.css';
    function Probe() {
      const [node, setNode] = React.useState(${JSON.stringify(node)});
      const [metrics, setMetrics] = React.useState(${JSON.stringify(metrics)});
      const [dark, setDark] = React.useState(false);
      const [hours, setHours] = React.useState(6);
      const [points, setPoints] = React.useState(180);
      window.liveUpdate = () => setNode(n => ({...n, metrics: {...n.metrics, cpu: 77, mem_used: 750, disk_used: 1500, tcp: 321, net_rx: 1250000, net_tx: 2500000}}));
      window.historyUpdate = () => setMetrics(rows => rows.map((p,i) => ({...p, cpu: i === 1 ? 80 : p.cpu})));
      window.capacityUpdate = () => setNode(n => ({...n, mem_total: 2000, disk_total: 4000}));
      window.themeUpdate = () => setDark(true);
      window.rangeUpdate = () => setHours(24);
      window.pointsUpdate = () => setPoints(1440);
      return React.createElement(Overview, {node, history: {metrics, loading: false, error: null, stale: false, retained: true}, dark, hours, points, onRefresh: () => {}});
    }
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Probe));
  `)
  await expect.poll(() => page.evaluate(() => (window as any).__charts?.length)).toBe(7)
  await expect(page.getByRole('img', { name: '负载详情，最近 6 小时' }).locator('canvas')).toBeVisible()
  const count = () => page.evaluate(() => (window as any).__chartUpdates)
  const series = (label: string, index = 0) => page.evaluate(({ label, index }) => {
    const chart = (window as any).__charts.find((c: any) => c.getDom().getAttribute('aria-label') === label)
    return chart.getOption().series[index].data
  }, { label, index })
  const before = await count()
  await page.evaluate(() => (window as any).liveUpdate())
  await expect(page.locator('.text-3xl').filter({ hasText: '77' })).toBeVisible()
  await expect(page.getByText('321', { exact: true })).toBeVisible()
  await expect(page.locator('.text-3xl').filter({ hasText: '75' })).toHaveCount(2)
  await expect(page.getByText(/^10\.00Mbps$/)).toBeVisible()
  await expect(page.getByText(/^20\.00Mbps$/)).toBeVisible()
  expect(await count()).toBe(before)
  expect(await series('负载详情，最近 6 小时')).toEqual([10, 20])
  await page.evaluate(() => (window as any).historyUpdate())
  await expect.poll(() => series('负载详情，最近 6 小时')).toEqual([10, 80])
  expect(await count()).toBeGreaterThan(before)
  await page.evaluate(() => (window as any).capacityUpdate())
  await expect.poll(() => series('负载详情，最近 6 小时', 1)).toEqual([5, 10])
  await expect.poll(() => series('磁盘使用率历史，最近 6 小时')).toEqual([5, 10])
  const beforeTheme = await count()
  await page.evaluate(() => (window as any).themeUpdate())
  await expect.poll(count).toBeGreaterThan(beforeTheme)
  expect(await page.evaluate(() => (window as any).__charts.find((c: any) => c.getDom().getAttribute('aria-label') === '负载详情，最近 6 小时').getOption().xAxis[0].axisLabel.color)).toBe('#a0a0a0')
  expect(await series('区间流量估算，最近 6 小时，缺失区间未计入')).toEqual([[1790800000000, null]])
  const beforeRange = await count()
  await page.evaluate(() => (window as any).rangeUpdate())
  await expect(page.getByRole('img', { name: '区间流量估算，最近 24 小时，缺失区间未计入' })).toBeVisible()
  await expect.poll(count).toBeGreaterThan(beforeRange)
  await expect.poll(() => series('区间流量估算，最近 24 小时，缺失区间未计入')).toEqual([[1790800000000, 37500000]])
  await page.evaluate(() => (window as any).pointsUpdate())
  await expect.poll(() => series('区间流量估算，最近 24 小时，缺失区间未计入')).toEqual([[1790800000000, null]])
})
