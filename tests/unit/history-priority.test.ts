import {it,expect} from 'vitest'
import {createHistoryClient,historyKey} from '../../src/lib/history-client'
const q=(id:number)=>({id,hours:24,points:288,series:'ping' as const})
const keys=(ids:number[])=>ids.map(id=>historyKey(q(id)))
const data={metrics:[],ping:[],probes:{}}
const drain=async()=>{for(let i=0;i<12;i++)await Promise.resolve()}
function setup(){
 let now=0
 const started:number[]=[],release=new Map<number,(x:typeof data)=>void>()
 const client=createHistoryClient(query=>{started.push(query.id);return new Promise(resolve=>release.set(query.id,resolve))},()=>now)
 const promises:Promise<unknown>[]=[]
 const enqueue=(ids:number[])=>ids.forEach(id=>promises.push(client.get(q(id))))
 const finish=async()=>{client.clear();release.forEach(r=>r(data));await Promise.allSettled(promises);await drain()}
 return {client,started,release,enqueue,finish,time:(n:number)=>{now=n}}
}
it('initial hints keep cap and aged FIFO background beats new visible work',async()=>{
 const s=setup(),owner=s.client.createPriority(keys([5,6,7,8]))
 s.enqueue([5,6,7,8,1,2,3,4,9,10]);await drain();expect(s.started).toEqual([5,6,7,8])
 s.time(5001);owner.update(keys([9,10]));s.release.get(5)!(data);await drain();expect(s.started[4]).toBe(1)
 await s.finish();owner.dispose()
})
it('new visible work wins before aging; equal ranks retain FIFO',async()=>{
 const s=setup(),owner=s.client.createPriority([]);s.enqueue([1,2,3,4,5,6,9,10]);await drain()
 owner.update(keys([10,9]));s.release.get(1)!(data);await drain();expect(s.started[4]).toBe(9)
 s.release.get(2)!(data);await drain();expect(s.started[5]).toBe(10);await s.finish()
})
it('unions owners, revokes disposed hints and preserves inflight identity',async()=>{
 const s=setup(),a=s.client.createPriority(keys([7,9])),b=s.client.createPriority(keys([8]))
 s.enqueue([1,2,3,4,5,6,7,8,9]);await drain()
 const promise=s.client.get(q(8)),late=s.client.createPriority(keys([8]))
 expect(s.client.get(q(8))).toBe(promise);late.dispose()
 s.release.get(1)!(data);await drain();expect(s.started[4]).toBe(7)
 a.dispose();a.dispose();a.update(keys([9]));s.release.get(2)!(data);await drain();expect(s.started[5]).toBe(8)
 b.dispose();s.release.get(3)!(data);await drain();expect(s.started[6]).toBe(5);await s.finish()
})
it('clear makes old priority handles inert',async()=>{
 const s=setup(),old=s.client.createPriority(keys([8]));s.client.clear();old.update(keys([8]))
 s.enqueue([1,2,3,4,5,8]);await drain();s.release.get(1)!(data);await drain();expect(s.started[4]).toBe(5);await s.finish()
})
