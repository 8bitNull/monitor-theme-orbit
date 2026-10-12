import type { DetailTab } from '@/components/Navbar'
import { matchThemeRoute, type ThemeRoute } from './navigation'
import { readDetailParams } from './dashboard-state'

// A single promise per module shares speculative and rendered loads. Failures
// remain visible to RouteBoundary on entry; its reload starts a fresh document.
function once<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined
  return () => pending ??= load()
}
export const loadDetailPage = once(() => import('@/pages/DetailPage'))
export const loadNetworkQuality = once(() => import('@/pages/NetworkQualityPage'))
export const loadOverview = once(() => import('@/pages/DetailOverview'))
export const loadNodeQuality = once(() => import('@/pages/NodeQuality'))
export const loadIpInfo = once(() => import('@/pages/IpInfo'))

export function preloadThemeRoute(route: ThemeRoute, tab: DetailTab): void {
  // Only static code is fetched: authorization still controls data and mounting.
  if (route.page === 'quality') void loadNetworkQuality().catch(() => {})
  if (route.page === 'stats') {
    void loadDetailPage().catch(() => {})
    const loadTab = tab === 'ip' ? loadIpInfo : tab === 'quality' ? loadNodeQuality : loadOverview
    void loadTab().catch(() => {})
  }
}
export function preloadRouteUrl(url: URL): void {
  const route = matchThemeRoute(url.pathname)
  if (route) preloadThemeRoute(route, readDetailParams(url.search).tab)
}
