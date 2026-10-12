import { DEFAULT_DASHBOARD, type DashboardState } from '@/lib/dashboard-state'
import { countryName } from '@/lib/country'
export function clearFilters(state:DashboardState):DashboardState {
 return {...state,query:'',region:null,group:null,status:'all',expiry:'all',attention:'all'}
}
export function ActiveFilters({state,count,onChange}:{state:DashboardState;count:number;onChange:(next:DashboardState)=>void}) {
 const entries:[keyof DashboardState,string][]=[]
 if(state.query)entries.push(['query',`名称：${state.query}`])
 if(state.region)entries.push(['region',`地区：${countryName(state.region)}`])
 if(state.group!==null)entries.push(['group',`分组：${state.group || '未分组'}`])
 if(state.status!=='all')entries.push(['status',`状态：${state.status==='online'?'在线':'离线'}`])
 if(state.expiry!=='all')entries.push(['expiry',`到期：${{expired:'已到期',d7:'7天内',d30:'30天内'}[state.expiry]}`])
 if(state.attention!=='all')entries.push(['attention',`异常：${{offline:'离线',expiring:'即将到期',loss:'高丢包'}[state.attention]}`])
 return <div className="flex flex-wrap items-center gap-2 text-sm" aria-label="当前筛选">
  <span>匹配数量：{count}</span>
  {entries.map(([key,label])=><button key={key} className="toolbar-chip min-h-11" aria-label={`清除${label}`} onClick={()=>onChange({...state,[key]:DEFAULT_DASHBOARD[key]})}>{label} ×</button>)}
  {!!entries.length && <button className="toolbar-chip min-h-11" onClick={()=>onChange(clearFilters(state))}>清除全部筛选</button>}
 </div>
}
