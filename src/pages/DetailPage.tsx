import { focusRouteMain } from "@/lib/navigation"
import { useHistory } from "@/lib/use-history"
import { loadOverview, loadNodeQuality, loadIpInfo } from "@/lib/route-loader"
import { lazy, Suspense } from "react"
import { Skeleton } from "@/components/ui"
import { type MetricsPoint, type Node } from "@/lib/api"
import type { DetailTab } from "@/components/Navbar"
import { useState } from "react"

/** 详情页外壳：负责取节点、取历史并分发到三个标签。 */
// 三个标签组件随详情页异步加载，不进首屏入口包。
const Overview = lazy(() => loadOverview().then((m) => ({ default: m.Overview })))
const NodeQuality = lazy(() => loadNodeQuality().then((m) => ({ default: m.NodeQuality })))
const IpInfo = lazy(() => loadIpInfo().then((m) => ({ default: m.IpInfo })))

const EMPTY_METRICS: MetricsPoint[] = []

export function DetailPage({ id, tab, dark, live, authed, loaded, hours, onHours }: {
  hours: number
  onHours: (hours: number) => void
  id: number
  tab: DetailTab
  dark: boolean
  live: Node | null
  loaded: boolean
  authed: boolean
}) {
  const node = live
  const missing = loaded && !node
  const [refreshKey, setRefreshKey] = useState(0)
  const points = tab === "quality" ? 288 : hours <= 6 ? 180 : 288
  const { data: history, error: historyError, loading: historyLoading, stale } = useHistory(
    node && tab !== "ip" ? { id, hours, points, series: tab === "quality" ? "ping" : "metrics" } : null, refreshKey)

  if (missing) {
    return (
      <main ref={focusRouteMain} tabIndex={-1} className="w-full mx-auto max-w-screen-2xl px-4 pb-8 pt-24 sm:px-6 lg:px-8">
        <p className="py-16 text-center text-sm text-secondary">
          节点不存在或未公开。<a href="/" className="underline">返回列表</a>
        </p>
      </main>
    )
  }

  if (!node) {
    return (
      <main ref={focusRouteMain} tabIndex={-1} className="w-full mx-auto max-w-screen-2xl space-y-4 px-4 pb-8 pt-24 sm:px-6 lg:px-8">
        <Skeleton className="h-24" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-56" />)}
        </div>
        <Skeleton className="h-72" />
      </main>
    )
  }

  return (
    <main ref={focusRouteMain} tabIndex={-1} className="w-full mx-auto max-w-screen-2xl px-4 pb-8 pt-20 sm:px-6 lg:px-8 md:pt-24">
      <div role="tabpanel" id={`detail-panel-${tab}`} aria-label={tab === "status" ? "概况" : tab === "quality" ? "网络质量" : authed ? "IP 与节点信息" : "归属地与节点信息"}>
      <Suspense fallback={<Skeleton className="h-96" />}>
        {tab === "status" && (
          <Overview hours={hours} points={points} node={node} history={{ metrics: history?.metrics ?? EMPTY_METRICS, loading: historyLoading, error: historyError, stale, retained: history !== null }} onRefresh={() => setRefreshKey(n => n + 1)} dark={dark} />
        )}
        {tab === "ip" && <IpInfo node={node} authed={authed} />}
        {tab === "quality" && (
          <NodeQuality history={history} hours={hours} onHours={onHours} loading={historyLoading} error={historyError} stale={stale} onRefresh={() => setRefreshKey(n => n + 1)} />
        )}
      </Suspense>
      </div>
    </main>
  )
}
