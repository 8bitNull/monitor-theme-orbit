import type { MetricsHistory } from './api'

export type HistoryStatus = { loading: boolean; failed: boolean; stale: boolean; retained: boolean }

/** History freshness is independent of the live-node transport. */
export function historyMessage({ loading, failed, stale, retained }: HistoryStatus): string {
  const messages: string[] = []
  if (failed) messages.push('历史获取失败')
  if (retained && (failed || stale)) messages.push('保留上次历史，数据已过期')
  if (loading) messages.push(retained ? '正在刷新历史…' : '正在加载历史…')
  return messages.join(' · ')
}

/** A timeout is a sample; configuration also survives windows with no samples. */
export function qualityEmptyMessage(history: MetricsHistory | null | undefined, targetId?: number): string {
  if (!history) return '尚无历史数据'
  const configured = Object.keys(history.probes).length > 0 || history.ping.length > 0
  if (!configured) return '未配置监控目标'
  if (targetId !== undefined && !(String(targetId) in history.probes) && !history.ping.some(p => p.task_id === targetId)) return '该节点未配置所选目标'
  return history.ping.some(p => targetId === undefined || p.task_id === targetId) ? '' : '当前时间范围没有探测样本'
}
