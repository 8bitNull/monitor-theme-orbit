import { expect, it } from 'vitest'
import { filterNodes, matchesAttention, reconcileOrder } from '../../src/lib/node-query'
import { DEFAULT_DASHBOARD } from '../../src/lib/dashboard-state'
import { summarizeQuality } from '../../src/lib/quality'
import type { Node } from '../../src/lib/api'
const node=(id:number,cpu?:number,online=true)=>({id,name:`N${id}`,sort:id,online,country:'CN',group:'A',expires_in:0,metrics:cpu===undefined?null:{cpu}} as Node)
it('high loss excludes unknown offline and stale data',()=>{
 const s=summarizeQuality({metrics:[],probes:{},ping:[{task_id:1,ts:100,latency:20,loss:5}],loss:{'1':5}})
 expect(matchesAttention(node(1,10),'loss',s,1000,2000)).toBe(true)
 expect(matchesAttention(node(1,10,false),'loss',s,1000,2000)).toBe(false)
 expect(matchesAttention(node(1,10),'loss',s,1000,122000)).toBe(false)
 expect(matchesAttention(node(1,10),'loss',undefined,null,2000)).toBe(false)
})
it('freezes order but adds default ordered IDs and removes absent IDs',()=>{
 const order=reconcileOrder([node(1,10),node(2,90)],[],'cpu',false,false,true)
 expect(order).toEqual([2,1])
 const next=[node(1,99),node(2,1),node(4,80),node(3,70)]
 expect(reconcileOrder(next,order,'cpu',false,false,false)).toEqual([2,1,3,4])
 expect(reconcileOrder(next,order,'cpu',false,true,false)).toEqual([1,4,3,2])
 expect(reconcileOrder([node(1,10)],order,'cpu',false,false,false)).toEqual([1])
})
it('puts missing values last in both directions and stabilizes equal values',()=>{
 const rows=[node(3),node(2,50),node(1,50)]
 expect(reconcileOrder(rows,[],'cpu',true,false,true)).toEqual([1,2,3])
 expect(reconcileOrder(rows,[],'cpu',false,false,true)).toEqual([1,2,3])
})
it('combines name region group status and expiry including zero days',()=>{
 const rows=[node(1,10),node(2,10,false)]
 expect(filterNodes(rows,{...DEFAULT_DASHBOARD,query:' n1 ',region:'CN',group:'A',status:'online',expiry:'d7'},new Map(),null,0).map(n=>n.id)).toEqual([1])
 expect(filterNodes(rows,{...DEFAULT_DASHBOARD,expiry:'expired'},new Map(),null,0)).toEqual([])
})
it('does not let a fresh node timestamp refresh another node loss',()=>{
 const s=summarizeQuality({metrics:[],probes:{},ping:[{task_id:1,ts:100,latency:20,loss:5}]})
 const rows=[node(1,10),node(2,10)]
 expect(filterNodes(rows,{...DEFAULT_DASHBOARD,attention:'loss'},new Map([[1,s],[2,s]]),200000,201000,new Map([[1,1000],[2,200000]])).map(n=>n.id)).toEqual([2])
})
