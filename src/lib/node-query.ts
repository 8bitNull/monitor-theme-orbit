import type { Node } from './api'
import type { DashboardState } from './dashboard-state'
import type { QualitySummary } from './quality'
import type { SortKey } from '../components/Toolbar'
export function matchesAttention(n:Node,a:DashboardState['attention'],s:QualitySummary|undefined,updatedAt:number|null,now:number):boolean {
 if(a==='offline') return !n.online
 if(a==='expiring') return n.expires_in!=null && n.expires_in>=0 && n.expires_in<=7
 if(a==='loss') return n.online && updatedAt!==null && now-updatedAt<=120000 && s?.latestLoss!=null && s.latestLoss>=5
 return true
}
export function filterNodes(nodes:Node[],state:DashboardState,summaries:Map<number,QualitySummary>,updatedAt:number|null,now:number,timestamps?:Map<number,number>):Node[] {
 const q=state.query.trim().toLocaleLowerCase()
 return nodes.filter(n=>{
  if(q && !n.name.toLocaleLowerCase().includes(q))return false
  if(state.region && n.country!==state.region)return false
  if(state.group!==null && (n.group??'')!==state.group)return false
  if(state.status==='online' && !n.online || state.status==='offline' && n.online)return false
  if(state.expiry!=='all') {
   const days=n.expires_in
   if(days==null)return false
   if(state.expiry==='expired' && days>=0)return false
   if(state.expiry==='d7' && (days<0 || days>7))return false
   if(state.expiry==='d30' && (days<0 || days>30))return false
  }
  return matchesAttention(n,state.attention,summaries.get(n.id),timestamps ? timestamps.get(n.id)??null : updatedAt,now)
 })
}
function sortValue(n:Node,key:SortKey):number|string|null {
 switch(key) {
 case 'default':return n.sort
 case 'name':return n.name
 case 'total':return n.total_rx+n.total_tx
 case 'expiry':return n.expires_in??null
 case 'uptime':return n.metrics?.uptime??null
 case 'cpu':return n.metrics?.cpu??null
 case 'mem':return n.metrics && n.mem_total>0?n.metrics.mem_used/n.mem_total:null
 case 'disk':return n.metrics && n.disk_total>0?n.metrics.disk_used/n.disk_total:null
 case 'down':return n.metrics?.net_rx??null
 case 'up':return n.metrics?.net_tx??null
 }
}
export function compareNodes(a:Node,b:Node,key:SortKey):number {
 const av=sortValue(a,key),bv=sortValue(b,key)
 if(av===null || bv===null)return av===bv?0:av===null?1:-1
 return typeof av==='string' && typeof bv==='string'?av.localeCompare(bv,'zh-CN'):Number(av)-Number(bv)
}
export function reconcileOrder(nodes:Node[],previousIds:number[],sort:SortKey,asc:boolean,live:boolean,sortChanged:boolean):number[] {
 if(live || sortChanged || !previousIds.length) return [...nodes].sort((a,b)=>{
  const av=sortValue(a,sort),bv=sortValue(b,sort),difference=compareNodes(a,b,sort)
  return ((av===null || bv===null)?difference:(sort==='default'?1:asc?1:-1)*difference) || a.sort-b.sort || a.id-b.id
 }).map(n=>n.id)
 const available=new Set(nodes.map(n=>n.id)),retained=previousIds.filter(id=>available.has(id)),existing=new Set(retained)
 return [...retained,...nodes.filter(n=>!existing.has(n.id)).sort((a,b)=>a.sort-b.sort || a.id-b.id).map(n=>n.id)]
}
