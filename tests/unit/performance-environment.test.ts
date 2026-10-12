import {afterAll,beforeAll,expect,it} from 'vitest'
import {spawn,type ChildProcess} from 'node:child_process'
import {request} from 'node:http'
import {gunzipSync} from 'node:zlib'
// @ts-expect-error Pure shared fixture is deliberately JavaScript for the Node mock.
import {makeNodes} from '../performance/synthetic-data.mjs'
let child:ChildProcess
const base='http://127.0.0.1:8919'
beforeAll(async()=>{
 child=spawn(process.execPath,['mock-server.mjs'],{env:{...process.env,MOCK_PORT:'8919',MOCK_FIXED_TS:'1790800000',MOCK_NODE_COUNT:'100',MOCK_GZIP:'1',MOCK_WS:'1'},stdio:['ignore','pipe','pipe']})
 await new Promise<void>((resolve,reject)=>{child.once('error',reject);child.once('exit',()=>reject(new Error('Mock exited before readiness')));child.stdout!.once('data',()=>resolve())})
})
afterAll(async()=>{if(child.exitCode===null){const exited=new Promise(resolve=>child.once('exit',resolve));child.kill();await exited}})
it('fixture preserves default names, public fields and deterministic extensions',()=>{
 const a=makeNodes(16,{now:1790800000}), b=makeNodes(100,{now:1790800000})
 expect(b.slice(0,16)).toEqual(a);expect(b).toHaveLength(100)
 expect(a[0].name).toBe('Demo 北京 01');expect(a[14].online).toBe(false)
 expect(a.every((n:Record<string,unknown>)=>!('ip' in n))).toBe(true)
 expect(makeNodes(100,{now:1790800000})).toEqual(b)
 expect(makeNodes(16,{admin:true,now:1790800000})[0].ip).toBe('203.0.113.11')
})
it('optional gzip is actual compressed bytes with no-store and a frozen 100-node body',async()=>{
 const result=await new Promise<{headers:Record<string,unknown>,body:Buffer}>((resolve,reject)=>{
  const req=request(base+'/api/nodes',{headers:{'accept-encoding':'gzip'}},res=>{const chunks:Buffer[]=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({headers:res.headers,body:Buffer.concat(chunks)}))});req.on('error',reject);req.end()
 })
 expect(result.headers['content-encoding']).toBe('gzip');expect(result.headers['cache-control']).toBe('no-store')
 expect(JSON.parse(gunzipSync(result.body).toString()).nodes).toEqual(makeNodes(100,{now:1790800000}))
})
it('both history series use fixed bucket timestamps and enforce node/range semantics',async()=>{
 for(const series of ['metrics','ping']){
  const url=base+`/api/nodes/100/metrics?series=${series}&hours=24&points=288`
  const a=await (await fetch(url)).json(),b=await (await fetch(url)).json()
  expect(a).toEqual(b)
  const rows=a[series];expect(rows.at(-1).ts).toBe(Math.floor(1790800000/300)*300)
  expect(rows[0].ts).toBe(rows.at(-1).ts-86400)
 }
 const missing=await fetch(base+'/api/nodes/101/metrics');expect(missing.status).toBe(404);expect(missing.headers.get('content-type')).toContain('text/plain')
})
it('real WebSocket handshake immediately publishes a complete synthetic frame',async()=>{
 const ws=new WebSocket(base.replace('http:','ws:')+'/api/ws')
 try {const frame=await new Promise<MessageEvent>((resolve,reject)=>{ws.addEventListener('message',resolve,{once:true});ws.addEventListener('error',reject,{once:true})});const data=JSON.parse(frame.data);expect(data.admin).toBe(false);expect(data.nodes).toEqual(makeNodes(100,{now:1790800000}))} finally {ws.close()}
})
