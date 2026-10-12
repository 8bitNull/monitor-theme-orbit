import { reconcileNodeSnapshots } from "./node-snapshot"
import { useDeadline } from "./use-deadline"
import { stripAdminFields } from "./auth-session"
import { historyClient } from "./history-client"
import { connectionState, type Transport } from "./connection"
import { useCallback, useEffect, useRef, useState } from "react"

export type Metrics = {
  uptime: number
  cpu: number
  load: [number, number, number]
  mem_total: number
  mem_used: number
  swap_total: number
  swap_used: number
  disk_total: number
  disk_used: number
  net_rx: number
  net_tx: number
  total_rx: number
  total_tx: number
  month_rx: number
  month_tx: number
  tcp: number
  udp: number
  procs: number
}

export type Node = {
  id: number
  name: string
  sort: number
  public: boolean
  online: boolean
  /** ISO 3166-1 alpha-2，定位失败时为空。 */
  country: string
  /** 面板里设置的分组；空为未分组。旧版 hub 缺失。 */
  group?: string
  last_seen: number
  metrics: Metrics | null
  os: string
  kernel: string
  arch: string
  virt: string
  cpu_name: string
  cpu_cores: number
  mem_total: number
  swap_total: number
  disk_total: number
  agent_version: string
  price: number
  currency: string
  billing_cycle: string
  expires_at: string | null
  expires_in?: number | null
  traffic_limit: number
  traffic_mode: string
  traffic_reset_day: number
  total_rx: number
  total_tx: number
  month_rx: number
  month_tx: number
  month_used?: number
  month_start: string
  day_rx: number
  day_tx: number
}

export type Me = { authed: boolean; github: boolean; site_name: string; public_page: boolean }

export type MetricsPoint = {
  ts: number
  cpu: number
  mem_used: number
  disk_used: number
  net_rx: number
  net_tx: number
  net_rx_max?: number
  net_tx_max?: number
}

export type PingPoint = {
  task_id: number
  ts: number
  latency: number | null
  band?: [number, number]
  loss?: number
}

export type MetricsHistory = {
  metrics: MetricsPoint[]
  ping: PingPoint[]
  probes: Record<string, string>
  loss?: Record<string, number>
}

export function groupsOf(nodes: Pick<Node, "group">[]): string[] {
  return [...new Set(nodes.map((n) => n.group ?? "").filter(Boolean))]
}

export { api, ApiError } from "./http"
import { api, ApiError } from "./http"

/**
 * 速率序列，每次推送采一个样，既存全网 (null) 也存每个分组 ("" 为未分组)，
 * 分组标签上的汇总线取自这里。列表页与详情页共享，详情页卸载后不丢历史。
 */
const KEEP = 60
export const speedHistory = new Map<string | null, { rx: number; tx: number }[]>()

export function sample(nodes: Node[]) {
  const totals = new Map<string | null, { rx: number; tx: number }>()
  for (const n of nodes) {
    for (const key of [null, n.group ?? ""]) {
      const total = totals.get(key) ?? { rx: 0, tx: 0 }
      if (n.online && n.metrics) {
        total.rx += n.metrics.net_rx
        total.tx += n.metrics.net_tx
      }
      totals.set(key, total)
    }
  }
  for (const key of speedHistory.keys()) if (!totals.has(key)) speedHistory.delete(key)
  for (const [key, total] of totals) {
    const series = speedHistory.get(key) ?? []
    series.push(total)
    if (series.length > KEEP) series.shift()
    speedHistory.set(key, series)
  }
}

/** 单个节点报告畸形时不能把整页拖垮。 */
export function safeNodes(nodes: Node[]): Node[] {
  const number = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0
  const fields = ["uptime", "cpu", "mem_total", "mem_used", "swap_total", "swap_used", "disk_total", "disk_used",
    "net_rx", "net_tx", "total_rx", "total_tx", "month_rx", "month_tx", "tcp", "udp", "procs"] as const
  return nodes.map((node) => {
    const m = node.metrics
    return !m || (fields.every((key) => number(m[key])) && Array.isArray(m.load) && m.load.length === 3 && m.load.every(number))
      ? node : { ...node, metrics: null }
  })
}

/**
 * 实时节点列表：走 hub 的 WebSocket（每两秒一帧），失败退回轮询。
 */
export function useNodes(authEpoch = 0, enabled = true, admin = true) {
  const [nodes, setNodes] = useState<Node[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [closed, setClosed] = useState(false)
  const [transport, setTransport] = useState<Transport>("connecting")
  const [lastSuccessAt, setLastSuccessAt] = useState<number | null>(null)
  const now = useDeadline(lastSuccessAt === null ? [] : [lastSuccessAt + 15001])
  const controls = useRef({ reset: () => {}, refresh: () => {} })
  const reset = useCallback(() => controls.current.reset(), [])
  const refresh = useCallback(() => controls.current.refresh(), [])

  useEffect(() => {
    if (!enabled) {
      controls.current = { reset: () => {}, refresh: () => {} }
      return
    }
    let socket: WebSocket | null = null
    let poll: ReturnType<typeof setInterval> | null = null
    let retry: ReturnType<typeof setTimeout> | null = null
    let request: AbortController | null = null
    let disposed = false
    let stopped = false
    let generation = 0
    let validSocket = false
    let malformedAt = -Infinity
    const active = (epoch: number) => !disposed && !stopped && epoch === generation
    const clearTimers = () => {
      if (poll) clearInterval(poll)
      if (retry) clearTimeout(retry)
      poll = retry = null
    }
    const stop = () => {
      generation++
      stopped = true
      clearTimers()
      request?.abort()
      request = null
      if (socket) { socket.onclose = null; socket.close(); socket = null }
      validSocket = false
    }
    const clearData = () => {
      setNodes(null); setError(null); setLastSuccessAt(null)
      speedHistory.clear(); historyClient.clear()
      setTransport("disconnected")
    }
    const receive = (value: unknown) => {
      if (!value || typeof value !== "object" || !("nodes" in value) || !Array.isArray(value.nodes)
        || !value.nodes.every(n => n && typeof n === "object" && typeof n.id === "number" && Number.isFinite(n.id)
          && Number.isInteger(n.id) && n.id >= 0 && typeof n.name === "string" && typeof n.online === "boolean"))
        throw new Error("状态数据格式异常")
      const safe = safeNodes(admin ? value.nodes : value.nodes.filter(n => n.public === true).map(stripAdminFields))
      sample(safe); setNodes(old => reconcileNodeSnapshots(old ?? [], safe)); setError(null); setClosed(false); setLastSuccessAt(Date.now())
    }
    const fetchOnce = async () => {
      if (disposed || stopped || request) return
      const epoch = generation
      const controller = new AbortController()
      request = controller
      try {
        const data = await api<unknown>("/nodes", { signal: controller.signal })
        if (!active(epoch)) return
        receive(data)
        if (!validSocket) setTransport("polling")
      } catch (e) {
        if (!active(epoch) || (e instanceof Error && e.name === "AbortError")) return
        if (e instanceof ApiError && e.status === 401) {
          stop(); clearData(); setClosed(true)
        } else setError(e instanceof Error ? e.message : "状态数据格式异常")
      } finally {
        if (request === controller) request = null
      }
    }
    const fallback = (markPolling = true) => {
      if (disposed || stopped) return
      if (markPolling) setTransport("polling")
      if (document.hidden) return
      poll ??= setInterval(() => { void fetchOnce() }, 5000)
      retry ??= setTimeout(() => { retry = null; connect() }, 5000)
    }
    const connect = () => {
      if (disposed || stopped || document.hidden || socket) return
      const epoch = generation
      const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws`
      let current: WebSocket
      try { current = new WebSocket(url); socket = current } catch { fallback(); return }
      current.onmessage = event => {
        if (!active(epoch) || socket !== current) return
        try {
          receive(JSON.parse(event.data))
          validSocket = true; setTransport("websocket"); clearTimers()
        } catch {
          setError("收到的状态数据格式异常，正在重新获取")
          if (Date.now() - malformedAt >= 5000) { malformedAt = Date.now(); void fetchOnce() }
          if (!validSocket) fallback()
        }
      }
      current.onerror = () => current.close()
      current.onclose = () => {
        if (!active(epoch) || socket !== current) return
        socket = null; validSocket = false; fallback()
      }
    }
    controls.current = {
      reset: () => { stop(); clearData(); setClosed(false) },
      refresh: () => {
        // A reset is an authorization barrier; only a new lifecycle may resume it.
        if (stopped || disposed) return
        clearTimers()
        void fetchOnce()
        if (socket) { socket.onclose = null; socket.close(); socket = null }
        validSocket = false; setTransport("connecting"); connect(); fallback(false)
      },
    }
    const visibility = () => {
      if (document.hidden) clearTimers()
      else if (!stopped) { void fetchOnce(); connect(); if (!validSocket) fallback() }
    }
    document.addEventListener("visibilitychange", visibility)
    void fetchOnce(); connect(); fallback(false)
    return () => {
      disposed = true; stop()
      document.removeEventListener("visibilitychange", visibility)
    }
  }, [authEpoch, enabled, admin])

  return { nodes, error, closed, transport, lastSuccessAt, stale: connectionState(transport, lastSuccessAt, now).stale, reset, refresh }
}

/** Compatibility delegate: history always uses the shared scheduler. */
export async function fetchHistory(id: number, hours: number, points: number, series: "metrics" | "ping") {
  return historyClient.get({ id, hours, points, series })
}
