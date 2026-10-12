import { focusRouteMain } from "@/lib/navigation"
import { useDeadline } from "@/lib/use-deadline"
import { useVisibleNodes } from '@/lib/use-visible-nodes'
import { HistoryNotice } from '@/components/HistoryNotice'
import { historyMessage } from '@/lib/history-status'
import { type PingSummary } from "@/components/NodeCard"
import { DashboardNodes } from "@/components/DashboardNodes"
import { RegionCard } from "@/components/RegionCard"
import { SummaryCards, ExpiryDropdown } from "@/components/SummaryCards"
import { Toolbar } from "@/components/Toolbar"
import { Skeleton } from "@/components/ui"
import type { Node } from "@/lib/api"
import { useQualitySummaries, summarize } from "@/lib/ping"
import { filterNodes, reconcileOrder } from "@/lib/node-query"
import type { DashboardState } from "@/lib/dashboard-state"
import { ActiveFilters, clearFilters } from "@/components/ActiveFilters"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

export type StatusFilter = "all" | "online" | "offline"

/** 首页：统计卡、地区卡、工具栏与节点列表（卡片/列表两种视图）。 */
export function Dashboard({nodes,error,config,state,onChange}: {
 nodes:Node[]|null; error:string|null; config:import("@/lib/appearance").Config;
 state:DashboardState; onChange:(next:DashboardState)=>void
}) {
 const {region,status,expiry,sort,asc,live,group,view}=state
 const update=useCallback(<K extends keyof DashboardState>(key:K,value:DashboardState[K])=>onChange({...state,[key]:value}),[state,onChange])
 const [order,setOrder]=useState<number[]>([])
 const previous=useRef({sort,asc,live})
 useEffect(()=>{
  const old=previous.current
  const changed=sort!==old.sort || asc!==old.asc || live && !old.live
  previous.current={sort,asc,live}
  setOrder(ids=>{const next=reconcileOrder(nodes??[],ids,sort,asc,live,changed);return next.length===ids.length && next.every((id,i)=>id===ids[i])?ids:next})
 },[nodes,sort,asc,live])
 const current=useMemo(()=>new Map((nodes??[]).map(n=>[n.id,n])),[nodes])
 const sortChanged=sort!==previous.current.sort || asc!==previous.current.asc || live && !previous.current.live
 const displayOrder=useMemo(()=>reconcileOrder(nodes??[],order,sort,asc,live,sortChanged),[nodes,order,sort,asc,live,sortChanged])
 const sorted=useMemo(()=>displayOrder.map(id=>current.get(id)).filter((n):n is Node=>!!n),[displayOrder,current])
 // Loss needs history; until it arrives the other active filters still supply useful hints.
 const candidates=useMemo(()=>filterNodes(sorted,state.attention==='loss'?{...state,attention:'all'}:state,new Map(),null,0),[sorted,state])
 const {rootRef,priorityIds}=useVisibleNodes(candidates.map(n=>n.id))
 const quality=useQualitySummaries((nodes??[]).map(n=>n.id),24,undefined,priorityIds)
 const evaluatedAt=useDeadline(state.attention==='loss'?[...quality.timestamps.values()].map(time=>time+120001):[])
 const ping=useMemo(()=>new Map([...quality.histories].map(([id,h])=>[id,summarize(h)])),[quality.histories])
 const historyMessages = useMemo(()=>new Map([...quality.statuses].map(([id,status])=>[id,historyMessage({...status,loading:false})])),[quality.statuses])
 const filter=useCallback((rows:Node[],next:DashboardState)=>filterNodes(rows,next,quality.summaries,quality.updatedAt,Math.max(evaluatedAt,Date.now()),quality.timestamps),[quality.summaries,quality.updatedAt,quality.timestamps,evaluatedAt])
 const filtered=useMemo(()=>filter(sorted,state),[filter,sorted,state])
 const summaryNodes=useMemo(()=>filter(sorted,{...state,status:'all'}),[filter,sorted,state])
 const regionScope=useMemo(()=>filter(sorted,{...state,status:'all',region:null}),[filter,sorted,state])
  const byRegion = useMemo(() => {
    const counts = new Map<string, number>()
    for (const n of regionScope) {
      if (!n.country) continue
      counts.set(n.country, (counts.get(n.country) ?? 0) + 1)
    }
    return [...counts.entries()]
      .map(([code, count]) => ({ code, count, names: [code] }))
      .sort((a, b) => b.count - a.count)
  }, [regionScope])

  return (
    <main ref={focusRouteMain} tabIndex={-1} className="dashboard w-full mx-auto max-w-screen-2xl space-y-4 px-4 pb-8 pt-20 sm:px-6 lg:px-8">
      {error && <p className="rounded-lg border border-error/40 bg-error/10 px-3 py-2 text-sm text-error">{error}</p>}

      {!nodes ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Skeleton className="h-36" />
            <Skeleton className="h-36" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-72" />
            ))}
          </div>
        </div>
      ) : (
        <>
          <SummaryCards compactMobile regionContent={config.show_region && byRegion.length > 0 ? <RegionCard countries={byRegion} active={region} onPick={v=>update("region",v)} /> : null} nodes={summaryNodes} config={config}
            status={status} onStatus={v=>update("status",v)} />


          <section className="dashboard-filters flex flex-col gap-2">
            <label className="dashboard-search flex flex-col gap-1 text-sm"><span className="sr-only">搜索节点名称</span>
              <input className="min-h-11 rounded-lg border border-line bg-inner px-3" placeholder="搜索节点名称" value={state.query} onChange={e=>update("query",e.target.value)} />
            </label>
            <Toolbar nodes={sorted} sort={sort} asc={asc} live={live} group={group} view={view}
              onSort={v=>update("sort",v)} onAsc={v=>update("asc",v)} onLive={v=>update("live",v)} onGroup={v=>update("group",v)} onView={v=>update("view",v)} filters={<>
            <div className="attention-row flex flex-wrap gap-2" role="group" aria-label="异常快捷筛选">
              {([['all','全部'],['expiring','即将到期'],['loss','高丢包']] as const).map(([value,label])=><button key={value} className="toolbar-chip min-h-11" title={value==="loss" ? "最新可用摘要≥5%，非当前窗口均值" : undefined} aria-pressed={state.attention===value} onClick={()=>onChange({...state,attention:value,...(value==='expiring'?{expiry:'all' as const}:{})})}>{label}</button>)}
              {config.show_expiring && <div><ExpiryDropdown value={expiry} onChange={v=>update("expiry",v)} nodes={summaryNodes} /></div>}
            </div>
            </>} />
            {(state.query || state.region || state.group!==null || state.status!=="all" || state.expiry!=="all" || state.attention!=="all") && <ActiveFilters state={state} count={filtered.length} onChange={onChange} />}
          </section>


          <HistoryNotice status={{loading:quality.loading, failed:quality.errorIds.length>0, stale:quality.stale, retained:quality.histories.size>0}} onRefresh={quality.refresh} progress={quality.progress} />
          <div ref={rootRef}>
          <DashboardNodes key={view} nodes={filtered} view={view} ping={ping}
            historyMessages={historyMessages} historyStatuses={quality.statuses} />

          </div>
          {filtered.length === 0 && (
            <p className="py-16 text-center text-sm text-secondary">
              <span>{nodes.length===0 ? "尚无公开节点" : "没有符合筛选条件的节点。"}</span>
              {nodes.length>0 && <button className="toolbar-chip min-h-11 ml-2" onClick={()=>onChange(clearFilters(state))}>清除筛选</button>}
            </p>
          )}
        </>
      )}
    </main>
  )
}

export type { PingSummary }
