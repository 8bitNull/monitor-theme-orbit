import { useEffect, useState } from 'react'
import type { Node } from '@/lib/api'
import type { HistoryStatus } from '@/lib/history-status'
import { NodeCard, type PingSummary } from './NodeCard'
import { NodeListView } from './NodeListView'

/** Yield between small mounts; filtering and history still use the full set. */
export function DashboardNodes({ nodes, view, ping, historyMessages, historyStatuses }: {
  nodes: Node[]
  view: 'card' | 'list'
  ping: Map<number, PingSummary>
  historyMessages: Map<number, string>
  historyStatuses: ReadonlyMap<number, HistoryStatus>
}) {
  const [budget, setBudget] = useState(() => nodes.length <= 24 ? nodes.length : 12)
  const pending = budget < nodes.length
  useEffect(() => {
    if (!pending) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule = () => {
      if (timer) clearTimeout(timer)
      if (!document.hidden) timer = setTimeout(() => setBudget(n => n + 12), 32)
    }
    schedule()
    document.addEventListener('visibilitychange', schedule)
    return () => { if (timer) clearTimeout(timer); document.removeEventListener('visibilitychange', schedule) }
  }, [pending, budget, nodes.length])
  const displayed = pending ? nodes.slice(0, budget) : nodes
  return (
    <div data-dashboard-nodes aria-busy={pending}>
      {view === 'card' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-4">
          {displayed.map(node => <NodeCard key={node.id} node={node} ping={ping.get(node.id) ?? null}
            historyMessage={historyMessages.get(node.id)} historyLoading={historyStatuses.get(node.id)?.loading ?? false}
            historyRetained={historyStatuses.get(node.id)?.retained ?? false} deferCharts />)}
        </div>
      ) : <NodeListView nodes={displayed} ping={ping} historyMessages={historyMessages} historyStatuses={historyStatuses} />}
      {pending && <p role="status" className="py-3 text-center text-xs text-secondary">正在显示节点… {displayed.length}/{nodes.length}</p>}
    </div>
  )
}
