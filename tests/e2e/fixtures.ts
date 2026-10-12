import type { Page, WebSocketRoute } from '@playwright/test'
type SyntheticNode = Record<string, any>
export async function installFixture(page: Page, options: {admin?: boolean} = {}) {
  let admin = options.admin ?? false
  const sockets = new Set<WebSocketRoute>()
  let latest: SyntheticNode[] = []
  const frame = () => JSON.stringify({nodes: latest, admin})
  await page.route('**/api/me', route => route.fulfill({json: {authed: admin, github: false, site_name: 'DStatus', public_page: true}}))
  await page.route('**/api/nodes', async route => {
    const data = await (await route.fetch()).json()
    latest = data.nodes.map((n: SyntheticNode) => admin
      ? {...n, addresses: [{address: '203.0.113.11', source: 'manual'}], hostname: 'synthetic-host'} : n)
    await route.fulfill({json: {nodes: latest, admin}})
  })
  await page.routeWebSocket('**/api/ws', socket => {
    sockets.add(socket)
    socket.onClose(() => sockets.delete(socket))
    if (latest.length) socket.send(frame())
  })
  return {
    connected: () => sockets.size > 0,
    // Keep the old payload intentionally: callers can emit stale private frames during auth review.
    setAdmin: (value: boolean) => {admin = value},
    emitNodes: (transform?: (nodes: SyntheticNode[]) => SyntheticNode[]) => {
      if (transform) latest = transform(latest)
      for (const socket of sockets) socket.send(frame())
    },
  }
}
