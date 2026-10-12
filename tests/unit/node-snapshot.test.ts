import {expect,it} from 'vitest'
import {reconcileNodeSnapshots,sameJson} from '../../src/lib/node-snapshot'
import {stripAdminFields} from '../../src/lib/auth-session'
const make=(id:number):any=>({id,name:`Synthetic ${id}`,public:true,online:true,sort:id,metrics:{cpu:10,net_rx:125000},expires_in:0,addresses:[{address:'203.0.113.11',source:'manual'}]})
it('reuses complete equal snapshots and never hides JSON field changes',()=>{
 const first=[make(1),make(2)]
 expect(reconcileNodeSnapshots(first,structuredClone(first))).toBe(first)
 for(const change of [(n:any)=>n.name='Changed',(n:any)=>n.online=false,(n:any)=>n.sort=9,(n:any)=>n.metrics.cpu=99,(n:any)=>n.metrics.net_rx=250000,(n:any)=>n.expires_in=7,(n:any)=>n.addresses[0].address='203.0.113.12',(n:any)=>n.unknown={nested:[null,[1,2]]},(n:any)=>n.metrics=null]){
  const incoming=structuredClone(first);change(incoming[0]);const next=reconcileNodeSnapshots(first,incoming)
  expect(next).not.toBe(first);expect(next[0]).not.toBe(first[0]);expect(next[1]).toBe(first[1])
 }
})
it('preserves incoming membership and order with reused objects',()=>{
 const first=[make(1),make(2)]
 const reordered=reconcileNodeSnapshots(first,[make(2),make(1)])
 expect(reordered[0]).toBe(first[1]);expect(reordered[1]).toBe(first[0])
 expect(reconcileNodeSnapshots(first,[make(2)])[0]).toBe(first[1])
 expect(reconcileNodeSnapshots(first,[make(2),make(3)])[1].id).toBe(3)
 expect(reconcileNodeSnapshots(first,[])).toEqual([])
})
it('compares nested arrays null and all own keys independent of key order',()=>{
 expect(sameJson({a:null,b:[1,[2]]},{b:[1,[2]],a:null})).toBe(true)
 for(const value of [{a:null,b:[1,[3]]},{a:null,b:[1]},{a:null,b:{0:1,1:[2]}},{b:[1,[2]]}])expect(sameJson({a:null,b:[1,[2]]},value)).toBe(false)
 expect(sameJson(null,{})).toBe(false)
})
it('reuses visitor snapshots only after private fields are stripped',()=>{
 const first=[stripAdminFields(make(1))];const changed=make(1);changed.addresses[0].address='203.0.113.12'
 expect(reconcileNodeSnapshots(first,[stripAdminFields(changed)])).toBe(first)
 expect(first[0]).not.toHaveProperty('addresses')
 expect(stripAdminFields(first[0])).toBe(first[0])
})
