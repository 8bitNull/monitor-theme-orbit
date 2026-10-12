import { stripAdminFields, useAuthSession } from "@/lib/auth-session"
import { ConnectionStatus } from "@/components/ConnectionStatus"
import { Footer } from "@/components/Footer"
import { Navbar } from "@/components/Navbar"
import { useNodes, type Node } from "@/lib/api"
import { applyAppearance, asConfig, loadConfig, readAppearancePreference, resetAppearance, saveAppearancePreference, savedMode, validAccent, watchSystem, type Config, type Mode } from "@/lib/appearance"
import { Dashboard } from "@/pages/Dashboard"
import { installNavigation, matchThemeRoute, type ThemeRoute } from "@/lib/navigation"
import { RouteBoundary, SafeRouteLoading } from "@/components/RouteBoundary"
import { flushSync } from "react-dom"
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react"
import { readDashboardState, saveDashboardState, readDetailParams, writeDetailParams, restoreScroll } from "@/lib/dashboard-state"

import { loadDetailPage, loadNetworkQuality, preloadThemeRoute, preloadRouteUrl } from "@/lib/route-loader"

const DetailPage = lazy(() => loadDetailPage().then(m => ({ default: m.DetailPage })))
const NetworkQualityPage = lazy(() => loadNetworkQuality().then(m => ({ default: m.NetworkQualityPage })))

const DEFAULT_CONFIG: Config = { show_region: true, show_network: true, show_expiring: true, capacity_mbps: 1000, footer_text: "", footer_url: "" }

function readRoute(): ThemeRoute {
  return matchThemeRoute(location.pathname) ?? { page: "home", id: null }
}

/**
 * 应用外壳：路由（/、/network-quality、/stats/{id}）、外观状态与实时节点流。
 * hub 对未知路径都会回 index.html，所以这些地址刷新后仍然可用。
 */
export default function App() {
  const [route, setRoute] = useState<ThemeRoute>(readRoute)
  const [mode, setMode] = useState<Mode>(savedMode)
  const [accent, setAccent] = useState<string>(() => validAccent(readAppearancePreference("dstatus-accent")))
  const [glass, setGlass] = useState<boolean>(() => readAppearancePreference("dstatus-glass") === "on")
  const resetRef = useRef<() => void>(() => {})
  const { me, state: authState, refresh: refreshAuth, reviewNavigation, authEpoch } = useAuthSession(() => resetRef.current())
  const authorized = authState === "admin" || (authState === "visitor" && me?.public_page !== false)
  const [config, setConfig] = useState<Config | null>(null)
  const { nodes: rawNodes, error, transport, lastSuccessAt, stale, refresh, reset } = useNodes(authEpoch, authorized, authState === "admin")
  resetRef.current = reset
  const nodes = useMemo(() => authState === "admin" ? rawNodes : authState === "visitor" ? rawNodes?.filter(n => n.public === true).map(stripAdminFields) ?? null : null, [authState, rawNodes])

  const [detail, setDetail] = useState(() => readDetailParams(location.search))
  useEffect(() => { preloadThemeRoute(route, detail.tab) }, [route.page, detail.tab])
  const [dashboard, setDashboard] = useState(readDashboardState)
  const [qualityQuery, setQualityQuery] = useState("")
  const dashboardRef = useRef(dashboard)
  dashboardRef.current = { ...dashboard, scrollY: dashboardRef.current.scrollY }
  const publicGroupsRef = useRef<string[]>([])
  publicGroupsRef.current = nodes?.filter(n => n.public).map(n => n.group ?? "") ?? []

  // Validate selections against the full authorized list, not the filtered display.
  useEffect(() => {
    if (!authorized || nodes === null) return
    setDashboard(s => {
      const group = s.group !== null && !nodes.some(n => (n.group ?? "") === s.group) ? null : s.group
      const region = s.region && !nodes.some(n => n.country === s.region) ? null : s.region
      return group === s.group && region === s.region ? s : { ...s, group, region }
    })
  }, [authorized, rawNodes, authState])

  useEffect(() => {
    if (authorized && nodes !== null) saveDashboardState(dashboardRef.current, publicGroupsRef.current)
  }, [dashboard, authorized, rawNodes])

  useEffect(() => {
    if (route.page !== "home") return
    let last = 0
    const save = () => {
      const next = { ...dashboardRef.current, scrollY: window.scrollY }
      dashboardRef.current = next
      saveDashboardState(next, publicGroupsRef.current)
    }
    const onScroll = () => {
      if (performance.now() - last < 100) return
      last = performance.now(); save()
    }
    addEventListener("scroll", onScroll, { passive: true })
    addEventListener("pagehide", save)
    return () => { removeEventListener("scroll", onScroll); removeEventListener("pagehide", save) }
  }, [route.page])

  const restored = useRef(false)
  useEffect(() => {
    if (route.page !== "home") { restored.current = false; return }
    if (!authorized || nodes === null || restored.current) return
    restored.current = true
    const cancel = restoreScroll(dashboardRef.current.scrollY, () => !document.querySelector('[data-dashboard-nodes][aria-busy="true"]'))
    let inputCanceled = false
    const cancelByInput = () => {
      if (inputCanceled) return
      inputCanceled = true
      cancel()
      dashboardRef.current = { ...dashboardRef.current, scrollY: window.scrollY }
      saveDashboardState(dashboardRef.current, publicGroupsRef.current)
    }
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(e.key)) cancelByInput()
    }
    addEventListener("wheel", cancelByInput, { passive: true })
    addEventListener("touchstart", cancelByInput, { passive: true })
    addEventListener("pointerdown", cancelByInput, { passive: true })
    addEventListener("keydown", onKey)
    return () => {
      // Identity review can interrupt a pending restore before all batches mount.
      restored.current = false
      cancel(); removeEventListener("wheel", cancelByInput); removeEventListener("touchstart", cancelByInput)
      removeEventListener("pointerdown", cancelByInput); removeEventListener("keydown", onKey)
    }
  }, [route.page, authorized, rawNodes !== null])

  useEffect(() => {
    applyAppearance(mode, accent, glass)
  }, [mode, accent, glass])

  useEffect(() => watchSystem(() => applyAppearance(mode, accent, glass)), [mode, accent, glass])

  useEffect(() => { loadConfig().then(c => setConfig(asConfig(c))) }, [])

  // 状态页整体关闭时，匿名访客交给内置面板。
  useEffect(() => {
    if (me && !me.public_page && !me.authed) location.href = "/admin/"
  }, [me])

  const navigationRef = useRef({
    beforePathChange: () => {}, beforeLeaveHome: () => {}, onRouteChange: (_route: ThemeRoute) => {},
  })
  navigationRef.current = {
    beforePathChange: () => { flushSync(() => { void reviewNavigation() }) },
    beforeLeaveHome: () => {
      const next = { ...dashboardRef.current, scrollY: window.scrollY }
      dashboardRef.current = next
      saveDashboardState(next, publicGroupsRef.current)
    },
    onRouteChange: next => { setRoute(next); setDetail(readDetailParams(location.search)) },
  }
  useEffect(() => installNavigation({
    onIntent: preloadRouteUrl,
    beforePathChange: () => navigationRef.current.beforePathChange(),
    beforeLeaveHome: () => navigationRef.current.beforeLeaveHome(),
    onRouteChange: next => navigationRef.current.onRouteChange(next),
  }), [])

  const liveNode: Node | null =
    route.page === "stats" && nodes ? nodes.find((n) => n.id === route.id) ?? null : null

  return (
    <div className="flex min-h-svh flex-col">
      <Navbar route={route} me={me} mode={mode} accent={accent} glass={glass}
        onMode={(m) => { setMode(m); saveAppearancePreference("theme", m) }}
        onAccent={(a) => { setAccent(a); saveAppearancePreference("dstatus-accent", a) }}
        onGlass={(g) => { setGlass(g); saveAppearancePreference("dstatus-glass", g ? "on" : "off") }}
        onResetAppearance={() => {
          const defaults = resetAppearance()
          setMode(defaults.mode); setAccent(defaults.accent); setGlass(defaults.glass)
          applyAppearance(defaults.mode, defaults.accent, defaults.glass)
        }}
        tab={detail.tab} onTab={tab => writeDetailParams(tab, detail.hours)} nodeName={route.page === "stats" ? liveNode?.name : undefined} />

      <div className={`theme-content flex-1${route.page === "stats" ? " detail-content" : ""}`}>
      <ConnectionStatus transport={transport} lastSuccessAt={lastSuccessAt} stale={stale} onRetry={refresh} />

      {!authorized && <SafeRouteLoading message={authState === "checking" ? "正在确认身份…" : <>身份状态暂时无法确认 <button className="min-h-11 min-w-11 px-4 underline" onClick={() => void refreshAuth()}>重试</button></>} />}

      {authorized && <RouteBoundary key={`${route.page}:${route.id}:${authEpoch}`}><Suspense fallback={<SafeRouteLoading />}>

      {authorized && route.page === "home" && (
        <Dashboard key={authEpoch} nodes={nodes} error={error ?? ""} config={config ?? DEFAULT_CONFIG} state={dashboard} onChange={setDashboard} />
      )}

      {authorized && route.page === "quality" && <NetworkQualityPage key={authEpoch} query={qualityQuery} onQuery={setQualityQuery} nodes={nodes} dark={document.documentElement.classList.contains("dark")} />}

      {authorized && route.page === "stats" && route.id !== null && (
        <DetailPage key={authEpoch} loaded={nodes !== null} id={route.id} tab={detail.tab} hours={detail.hours} onHours={hours => writeDetailParams(detail.tab, hours)} dark={document.documentElement.classList.contains("dark")}
          live={liveNode} authed={authState === "admin"} />
      )}

      </Suspense></RouteBoundary>}
      </div>

      <Footer siteName={me?.site_name ?? "Monitor"} text={config?.footer_text || undefined} url={config?.footer_url || undefined} />

    </div>
  )
}
