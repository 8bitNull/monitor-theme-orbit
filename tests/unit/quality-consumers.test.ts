import { expect, it } from 'vitest'
import { summarize } from '../../src/lib/ping'
import { trendOption } from '../../src/pages/NodeQuality'
it('card adapter aggregates the latest timestamp rather than last row', () => {
 expect(summarize({metrics:[],probes:{},loss:{},ping:[{task_id:1,ts:120,latency:60},{task_id:2,ts:120,latency:null,loss:100},{task_id:1,ts:60,latency:10}]})).toMatchObject({latency:60,loss:50,targets:2})
})
it('chart retains chronological null gaps instead of connecting successful buckets', () => {
 const option=trendOption([{task_id:1,ts:120,latency:40},{task_id:1,ts:0,latency:10},{task_id:1,ts:60,latency:null,loss:100}],{'1':'A'},[1],[])
 expect(option.series[0].data).toEqual([[0,10],[60000,null],[120000,40]])
 expect(option.series[0].connectNulls).toBe(false)
})

it('caches quality and card summaries by history and target identity', async () => {
 const {cachedQuality,summarize}=await import('../../src/lib/ping')
 const history={metrics:[],probes:{1:'Synthetic',2:'Other'},ping:[{task_id:1,ts:120,latency:40},{task_id:2,ts:120,latency:80}]}
 const first=cachedQuality(history,1)
 expect(cachedQuality(history,1)).toBe(first)
 expect(cachedQuality(history,2).latestLatency).toBe(80)
 expect(cachedQuality(history,2)).not.toBe(first)
 expect(summarize(history)).toBe(summarize(history))
 const replacement={...history,ping:[{task_id:1,ts:120,latency:90}]}
 expect(cachedQuality(replacement,1).latestLatency).toBe(90)
 expect(cachedQuality(history,1)).toBe(first)
})
