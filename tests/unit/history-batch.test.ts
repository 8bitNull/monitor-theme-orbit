import {it,expect,vi,afterEach} from 'vitest'
import {createHistoryBatchRunner,type BatchSnapshot,type HistorySnapshot} from '../../src/lib/history-batch'
const empty=():BatchSnapshot=>({histories:new Map(),timestamps:new Map(),errors:new Map(),pendingIds:new Set(),progress:{total:0,pending:0,settled:0,succeeded:0,failed:0},loading:false})
const q=(id:number)=>({id,hours:24,points:288,series:'ping' as const})
const data={metrics:[],probes:{1:'Synthetic'},ping:[{task_id:1,ts:120,latency:40}]}
function setup(seed=empty()) {
 vi.useFakeTimers()
 const resolves=new Map<number,(s:HistorySnapshot)=>void>(), rejects=new Map<number,(e:Error)=>void>()
 const updates:BatchSnapshot[]=[]
 const getSnapshot=vi.fn((query:ReturnType<typeof q>)=>new Promise<HistorySnapshot>((resolve,reject)=>{resolves.set(query.id,resolve);rejects.set(query.id,reject)}))
 const runner=createHistoryBatchRunner({seed:()=>seed,publish:s=>updates.push(s),getSnapshot})
 return {runner,updates,getSnapshot,resolves,rejects}
}
afterEach(()=>vi.useRealTimers())
it('publishes a first result with its timestamp before slow peers',async()=>{
 const {runner,updates,resolves}=setup();const done=runner.run([q(1),q(2)])
 expect(updates.at(-1)?.pendingIds).toEqual(new Set([1,2]))
 resolves.get(1)!({data,ts:1000});await vi.advanceTimersByTimeAsync(32)
 expect(updates.at(-1)?.histories.get(1)).toBe(data)
 expect(updates.at(-1)?.timestamps.get(1)).toBe(1000)
 expect(updates.at(-1)?.pendingIds).toEqual(new Set([2]))
 expect(updates.at(-1)?.progress).toEqual({total:2,pending:1,settled:1,succeeded:1,failed:0})
 resolves.get(2)!({data,ts:2000});await done
 expect(updates.at(-1)?.loading).toBe(false);runner.dispose()
})
it('coalesces responses, preserves published snapshots and shares a running promise',async()=>{
 const {runner,updates,resolves,getSnapshot}=setup();const done=runner.run([q(1),q(2),q(3)])
 expect(runner.run([q(1)],true)).toBe(done);expect(getSnapshot).toHaveBeenCalledTimes(3)
 const initial=updates[0];resolves.get(1)!({data,ts:1});resolves.get(2)!({data,ts:2});await vi.advanceTimersByTimeAsync(32)
 expect(updates).toHaveLength(2);expect(initial.pendingIds.size).toBe(3);expect(initial.histories.size).toBe(0)
 resolves.get(3)!({data,ts:3});await done;expect(updates).toHaveLength(3)
 await vi.advanceTimersByTimeAsync(32);expect(updates).toHaveLength(3)
})
it('invalidates late results and scheduled publication on dispose',async()=>{
 const {runner,updates,resolves}=setup();const done=runner.run([q(1),q(2)])
 resolves.get(1)!({data,ts:1});await Promise.resolve();await Promise.resolve();expect(vi.getTimerCount()).toBe(1);runner.dispose();expect(vi.getTimerCount()).toBe(0);resolves.get(2)!({data,ts:2});await done
 await vi.advanceTimersByTimeAsync(32);expect(updates).toHaveLength(1)
})
it('retains successful values on refresh failure and settles aborts without ordinary errors',async()=>{
 const seed=empty();seed.histories.set(1,data);seed.timestamps.set(1,10)
 const {runner,updates,rejects}=setup(seed);const done=runner.run([q(1),q(2)],true)
 rejects.get(1)!(new Error('503'));rejects.get(2)!(new DOMException('clear','AbortError'));await done
 const last=updates.at(-1)!;expect(last.histories.get(1)).toBe(data);expect(last.timestamps.get(1)).toBe(10)
 expect(last.errors).toEqual(new Map([[1,'503']]));expect(last.pendingIds.size).toBe(0)
 expect(last.progress).toEqual({total:2,pending:0,settled:2,succeeded:0,failed:1})
})
it('publishes an idle empty batch',async()=>{const {runner,updates}=setup();await runner.run([]);expect(updates.at(-1)?.loading).toBe(false);expect(updates.at(-1)?.progress.total).toBe(0)})
