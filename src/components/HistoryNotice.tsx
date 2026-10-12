import type { HistoryProgress } from '@/lib/history-batch'
import { historyMessage, type HistoryStatus } from '@/lib/history-status'

export function HistoryNotice({ status, onRefresh, progress }: { status: HistoryStatus; progress?: HistoryProgress; onRefresh: () => void }) {
  const message = historyMessage(status)
  if (!message && !progress?.pending) return null
  return <div role={status.failed ? 'alert' : 'status'} className="flex flex-wrap items-center gap-2 text-xs text-secondary">
    <span>{message}</span>
    {!!progress?.pending && <span>历史已完成 {progress.settled}/{progress.total}</span>}
    {(status.failed || status.stale) && <button type="button" className="toolbar-chip min-h-11 min-w-11" onClick={onRefresh} disabled={status.loading}>重试历史</button>}
  </div>
}
