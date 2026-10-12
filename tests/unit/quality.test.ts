import { expect, it } from 'vitest'
import { probeJitter, summarizeQuality } from '../../src/lib/quality'
import type { MetricsHistory } from '../../src/lib/api'
const history: MetricsHistory = {metrics: [], probes: {'1':'A','2':'B'}, loss:{'1':0.25,'2':100}, ping:[{task_id:2,ts:120,latency:null,loss:100},{task_id:1,ts:60,latency:40},{task_id:1,ts:120,latency:60}]}
it('aggregates all targets at the newest timestamp, independent of array order', () => {
 const s = summarizeQuality(history)
 expect(s.latestLatency).toBe(60); expect(s.latestLoss).toBe(50); expect(s.latestTs).toBe(120); expect(s.targets).toBe(2)
 expect(s.bars).toEqual([{ts:60,v:40},{ts:120,v:60}])
})
it('uses actual window loss instead of sparse bucket estimates', () => {
 const s=summarizeQuality(history); expect(s.windowLoss).toBe(50.125); expect(s.success).toBe(49.875); expect(s.estimatedLoss).toBe(false)
})
it('treats omitted loss as zero and retains all-timeout targets', () => {
 expect(summarizeQuality({metrics:[],probes:{},loss:{},ping:[{task_id:1,ts:60,latency:30}]}).windowLoss).toBe(0)
 const s=summarizeQuality(history,2); expect(s.avgLatency).toBeNull(); expect(s.windowLoss).toBe(100); expect(s.targets).toBe(1); expect(s.bars).toEqual([{ts:120,v:null}])
})
it('marks old response bucket loss as an estimate', () => {
 const {loss:_,...old}=history; const s=summarizeQuality(old); expect(s.estimatedLoss).toBe(true); expect(s.windowLoss).toBe(50)
})
it('does not invent samples for configured targets', () => {
 const s=summarizeQuality({metrics:[],probes:{'3':'No samples'},loss:{},ping:[]},3)
 expect(s.targets).toBe(0); expect(s.windowLoss).toBeNull(); expect(s.latestTs).toBeNull()
})
it('rejects invalid latency and loss without turning null into zero', () => {
 const s=summarizeQuality({metrics:[],probes:{},loss:{'1':NaN},ping:[{task_id:1,ts:1,latency:-2,loss:101},{task_id:1,ts:2,latency:null,loss:100},{task_id:1,ts:NaN,latency:20}]})
 expect(s.avgLatency).toBeNull(); expect(s.windowLoss).toBeNull(); expect(s.latestLoss).toBe(100)
})
it('does not bridge a timeout when computing jitter', () => {
 expect(probeJitter([{task_id:1,ts:0,latency:10},{task_id:1,ts:60,latency:null,loss:100},{task_id:1,ts:120,latency:100},{task_id:1,ts:180,latency:120}])).toBe(20)
})
it('computes adjacent changes within each target despite interleaved ordering', () => {
 expect(probeJitter([{task_id:2,ts:60,latency:110},{task_id:1,ts:0,latency:10},{task_id:2,ts:0,latency:100},{task_id:1,ts:60,latency:30}])).toBe(15)
 expect(probeJitter([{task_id:1,ts:0,latency:10},{task_id:2,ts:60,latency:100}])).toBeNull()
})
