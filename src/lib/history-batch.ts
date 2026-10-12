import type { MetricsHistory } from './api'
import type { HistoryQuery } from './history-client'
export type HistorySnapshot = {data: MetricsHistory; ts: number}
export type HistoryProgress = {total:number;pending:number;settled:number;succeeded:number;failed:number}
export type BatchSnapshot = {histories:Map<number,MetricsHistory>;timestamps:Map<number,number>;errors:Map<number,string>;pendingIds:Set<number>;progress:HistoryProgress;loading:boolean}
export const PUBLISH_DELAY_MS = 32
const copy = (state: BatchSnapshot): BatchSnapshot => ({...state, histories:new Map(state.histories), timestamps:new Map(state.timestamps), errors:new Map(state.errors), pendingIds:new Set(state.pendingIds), progress:{...state.progress}})
export function createHistoryBatchRunner(options:{getSnapshot:(q:HistoryQuery,force:boolean)=>Promise<HistorySnapshot>;seed:()=>BatchSnapshot;publish:(snapshot:BatchSnapshot)=>void}) {
 let live=true, generation=0
 let running:Promise<void>|undefined, timer:ReturnType<typeof setTimeout>|undefined
 function run(queries:HistoryQuery[],force=false):Promise<void> {
  if(running)return running
  if(!live)return Promise.resolve()
  const epoch=generation, state=copy(options.seed())
  state.pendingIds=new Set(queries.map(q=>q.id))
  state.progress={total:queries.length,pending:state.pendingIds.size,settled:0,succeeded:0,failed:0}
  state.loading=state.pendingIds.size>0
  const valid=()=>live&&epoch===generation
  const flush=()=>{if(timer!==undefined)clearTimeout(timer);timer=undefined;if(valid())options.publish(copy(state))}
  const later=()=>{if(timer===undefined)timer=setTimeout(flush,PUBLISH_DELAY_MS)}
  flush()
  const results=queries.map(query=>{
   let result:Promise<HistorySnapshot>
   try{result=options.getSnapshot(query,force)}catch(error){result=Promise.reject(error)}
   return result.then(snapshot=>{
    if(!valid())return
    state.histories.set(query.id,snapshot.data);state.timestamps.set(query.id,snapshot.ts)
    state.errors.delete(query.id);state.progress.succeeded++
   },error=>{
    if(!valid())return
    if(!(error instanceof Error && error.name==='AbortError')){
     state.errors.set(query.id,error instanceof Error?error.message:'历史数据获取失败');state.progress.failed++
    }
   }).finally(()=>{
    if(!valid())return
    state.pendingIds.delete(query.id);state.progress.settled++
    state.progress.pending=state.pendingIds.size;state.loading=state.pendingIds.size>0;later()
   })
  })
  running=Promise.all(results).then(()=>{flush()}).finally(()=>{running=undefined})
  return running
 }
 return {run,dispose:()=>{live=false;generation++;if(timer!==undefined)clearTimeout(timer);timer=undefined}}
}
