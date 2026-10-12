import { connectionState, type Transport } from '@/lib/connection'
export function ConnectionStatus({ transport, lastSuccessAt, stale, onRetry }: {
 transport: Transport; lastSuccessAt: number | null; stale: boolean; onRetry: () => void
}) {
 if (!stale && (transport === 'websocket' || transport === 'connecting' && lastSuccessAt === null)) return null
 // The live hook publishes the stale deadline; this notice needs no ticking clock.
 const label = stale ? '数据已过期' : transport === 'connecting' ? '正在重新连接' : connectionState(transport,lastSuccessAt,Date.now()).label
 return <div className="connection-status mx-auto flex w-full max-w-screen-2xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1 text-xs text-muted-foreground sm:px-6 lg:px-8">
  <span role="status" aria-live="polite">{label}</span>
  {stale && <span>当前显示最近一次成功数据</span>}
  <button type="button" className="scroll-mt-20 min-h-11 min-w-11 rounded px-3 hover:bg-muted focus-visible:outline" onClick={onRetry}>重新连接</button>
 </div>
}
