import { expect, it } from 'vitest'
import { connectionState } from '../../src/lib/connection'
it('distinguishes transport fallback from stale samples', () => {
 expect(connectionState('polling',1000,5000)).toEqual({label:'轮询更新中',stale:false})
 expect(connectionState('websocket',1000,16001)).toEqual({label:'数据已过期',stale:true})
 expect(connectionState('connecting',null,0)).toEqual({label:'正在连接',stale:false})
 expect(connectionState('disconnected',null,0)).toEqual({label:'尚未获取状态数据',stale:false})
 expect(connectionState('websocket',1000,16000).stale).toBe(false)
})
