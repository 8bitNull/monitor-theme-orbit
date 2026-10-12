import {readFile,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
export const median=values=>{const sorted=[...values].sort((a,b)=>a-b),mid=Math.floor(sorted.length/2);return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2}
export function compareMetric(before,after){if(before.length!==5||after.length!==5||[...before,...after].some(x=>!Number.isFinite(x)))throw Error('Need five finite samples per side');const baseline=median(before),final=median(after);return {baseline,final,reduction:baseline===0?null:(baseline-final)/baseline,beforeRange:[Math.min(...before),Math.max(...before)],afterRange:[Math.min(...after),Math.max(...after)],before,after}}
export function compareRuns(before,after){
 for(const key of ['nodeCount','pairs','gzip','protocol'])if(JSON.stringify(before[key])!==JSON.stringify(after[key]))throw Error(`Configuration mismatch: ${key}`)
 for(const key of ['browser','node','platform','release','architecture','cpu','cpuCount','memoryBytes','dataVersion','fixedTimestamp','viewport','cpuThrottle','network'])if(JSON.stringify(before.environment[key])!==JSON.stringify(after.environment[key]))throw Error(`Environment mismatch: ${key}`)
 if(before.pairs!==5||before.samples.length!==10||after.samples.length!==10)throw Error('Exactly five pairs required')
 const result={nodeCount:before.nodeCount,gzip:before.gzip,modes:{},gates:[]}
 for(const mode of ['cold','warm']){
  const b=before.samples.filter(s=>s.mode===mode),a=after.samples.filter(s=>s.mode===mode)
  for(const rows of [b,a])if(rows.length!==5||rows.some(s=>!s.ok)||[...rows.map(s=>s.index)].sort().join()!=='1,2,3,4,5')throw Error('Need five successful distinct paired samples')
  const metrics={};for(const key of ['firstNode','firstHistory','allHistoryMs','transferBytes','decodedBytes','jsTransferBytes','longTaskMs'])metrics[key]=compareMetric(b.map(s=>s[key]??s.marks?.[key]),a.map(s=>s[key]??s.marks?.[key]))
  result.modes[mode]=metrics;result.gates.push({name:`${mode} firstHistory >=20%`,pass:metrics.firstHistory.reduction>=.2},{name:`${mode} firstNode no regression`,pass:metrics.firstNode.final<=metrics.firstNode.baseline})
  if(mode==='warm'&&before.nodeCount===100){
   const actions=rows=>rows.map(s=>{if(s.interactions?.length!==8)throw Error('Eight interactions required');return s.interactions})
   const br=actions(b),ar=actions(a)
   metrics.interactionLatency=compareMetric(br.map(r=>r.reduce((n,i)=>n+(i.nextFrameMs??i.durationMs),0)),ar.map(r=>r.reduce((n,i)=>n+(i.nextFrameMs??i.durationMs),0)))
   metrics.interactionLongTaskMs=compareMetric(br.map(r=>r.reduce((n,i)=>n+(i.longTasks??i.document?.longTasks??[]).filter(t=>i.kind!=='same-document'||t.start>=i.startMs).reduce((sum,t)=>sum+t.duration,0),0)),ar.map(r=>r.reduce((n,i)=>n+(i.longTasks??i.document?.longTasks??[]).filter(t=>i.kind!=='same-document'||t.start>=i.startMs).reduce((sum,t)=>sum+t.duration,0),0)))
   for(const key of ['interactionLatency','interactionLongTaskMs'])result.gates.push({name:key+' improves',pass:metrics[key].final<metrics[key].baseline})
  }
 }
 result.pass=result.gates.every(g=>g.pass);return result
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const args=process.argv.slice(2),get=k=>args[args.indexOf(k)+1];if(!['--baseline','--final','--output'].every(k=>args.includes(k)&&get(k)))throw Error('Required --baseline --final --output');const result=compareRuns(JSON.parse(await readFile(get('--baseline'),'utf8')),JSON.parse(await readFile(get('--final'),'utf8')));await writeFile(get('--output'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result.gates));if(!result.pass)process.exitCode=2}
