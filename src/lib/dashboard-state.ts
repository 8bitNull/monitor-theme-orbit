import type { SortKey } from '../components/Toolbar'
import type { DetailTab } from '../components/Navbar'
export type DashboardState = {
  v:1; region:string|null; status:'all'|'online'|'offline'; expiry:'all'|'expired'|'d7'|'d30';
  sort:SortKey; asc:boolean; live:boolean; group:string|null; view:'card'|'list'; query:string;
  attention:'all'|'offline'|'expiring'|'loss'; scrollY:number;
}
const KEY='dstatus-dashboard-v1'
export const DEFAULT_DASHBOARD:DashboardState={v:1,region:null,status:'all',expiry:'all',sort:'default',asc:false,live:false,group:null,view:'card',query:'',attention:'all',scrollY:0}
function pick<T extends string>(value:unknown,allowed:readonly T[],fallback:T):T {
  return allowed.includes(value as T)?value as T:fallback
}
function normalize(value:unknown):DashboardState {
  if(!value || typeof value!=='object' || !('v' in value) || value.v!==1) return {...DEFAULT_DASHBOARD}
  const o=value as Record<string,unknown>
  return {v:1,region:typeof o.region==='string' && /^[A-Z]{2}$/.test(o.region)?o.region:null,
    status:pick(o.status,['all','online','offline'],'all'),expiry:pick(o.expiry,['all','expired','d7','d30'],'all'),
    sort:pick(o.sort,['default','name','total','expiry','uptime','cpu','mem','disk','down','up'],'default'),
    asc:o.asc===true,live:o.live===true,group:typeof o.group==='string'?o.group.slice(0,128):null,
    view:pick(o.view,['card','list'],'card'),query:'',attention:pick(o.attention,['all','offline','expiring','loss'],'all'),
    scrollY:typeof o.scrollY==='number' && Number.isFinite(o.scrollY) && o.scrollY>=0?Math.min(o.scrollY,100000):0}
}
export function parseDashboardState(raw:string|null):DashboardState {
  try { return normalize(JSON.parse(raw??'null')) } catch { return {...DEFAULT_DASHBOARD} }
}
export function readDashboardState():DashboardState {
  try { return parseDashboardState(sessionStorage.getItem(KEY)) } catch { return {...DEFAULT_DASHBOARD} }
}
/** The caller supplies public group labels; node objects and arbitrary queries never enter storage. */
export function saveDashboardState(state:DashboardState,safePublicGroups:readonly string[]=[]):void {
  try {
    const safe=normalize(state)
    if(safe.group!==null && !safePublicGroups.includes(safe.group)) safe.group=null
    sessionStorage.setItem(KEY,JSON.stringify(safe))
  } catch { /* Storage may be disabled or full. */ }
}
export function readDetailParams(search:string):{tab:DetailTab;hours:1|6|24|168} {
  const p=new URLSearchParams(search)
  const hours=p.get('hours')
  return {tab:pick(p.get('tab'),['status','ip','quality'],'status'),hours:hours==='1'?1:hours==='24'?24:hours==='168'?168:6}
}
export function writeDetailParams(tab:DetailTab,hours:number):void {
  const url=new URL(location.href)
  const valid=readDetailParams(`?tab=${tab}&hours=${hours}`)
  url.searchParams.set('tab',valid.tab); url.searchParams.set('hours',String(valid.hours))
  history.replaceState(history.state,'',url); dispatchEvent(new PopStateEvent('popstate'))
}
export function restoreScroll(y:number, layoutReady:()=>boolean=()=>true):()=>void {
  const target=Number.isFinite(y)?Math.max(0,Math.min(y,100000)):0
  const deadline=performance.now()+3000
  let frame=0,stopped=false
  const attempt=()=>{
    if(stopped) return
    if(document.documentElement.scrollHeight>=target+innerHeight || performance.now()>=deadline && layoutReady()) {
      stopped=true; scrollTo(0,target); return
    }
    frame=requestAnimationFrame(attempt)
  }
  frame=requestAnimationFrame(attempt)
  return ()=>{stopped=true;cancelAnimationFrame(frame)}
}
