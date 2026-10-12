export type Transport = 'connecting' | 'websocket' | 'polling' | 'disconnected'
export function connectionState(transport: Transport, lastSuccessAt: number | null, now: number) {
 const stale = lastSuccessAt !== null && now - lastSuccessAt > 15000
 const label = stale ? '数据已过期' : lastSuccessAt === null
  ? transport === 'connecting' ? '正在连接' : '尚未获取状态数据'
  : transport === 'websocket' ? '实时连接正常' : transport === 'polling' ? '轮询更新中' : '连接中断'
 return { label, stale }
}
