import {test,expect} from '@playwright/test'
import {openHarness} from './page'
// @ts-ignore synthetic fixtures are deliberately shared with the production benchmark.
import {makeNodes} from '../performance/synthetic-data.mjs'
for(const view of ['card','row'])test(`100 ${view}s receive real WS frames with isolated render boundaries`,async({page})=>{
 const nodes=makeNodes(100,{now:1790800000,admin:true})
 const names=view==='card'?['NodeCard','MiniChart']:['NodeListView']
 const injected:string[]=[]
 for(const file of names)await page.route(`**/src/components/${file}.tsx*`,async route=>{
  const response=await route.fetch();let body=await response.text()
  const name=file==='NodeListView'?'NodeRow':file
  const pattern=new RegExp(`function (${name}View|${name})\\(([^]*?)\\) \\{`,'g')
  const matches=[...body.matchAll(pattern)];expect(matches).toHaveLength(1)
  body=body.replace(pattern,(header)=>header+`\n globalThis.__renders ??= {}; const probeKey=${file==='MiniChart'?"kind+':'+(points[0]?.ts??'empty')":"'node:'+node.id"};globalThis.__renders[probeKey]=(globalThis.__renders[probeKey]??0)+1;`)
  injected.push(name);await route.fulfill({response,body})
 })
 let socket:any
 await page.routeWebSocket('**/api/ws',ws=>{socket=ws})
 await page.route('**/api/nodes',route=>route.fulfill({json:{nodes}}))
 await page.clock.install();await page.clock.pauseAt(new Date())
 await openHarness(page,`
 import React from '/node_modules/.vite/deps/react.js';
 import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
 import {useNodes} from '/src/lib/api.ts';
 import {NodeCard} from '/src/components/NodeCard.tsx';
 import {NodeListView} from '/src/components/NodeListView.tsx';
 import {ConnectionStatus} from '/src/components/ConnectionStatus.tsx';
 const {createRoot}=ReactDOM;
 const initial=new Map(Array.from({length:100},(_,i)=>[i+1,{bars:[{ts:i+1,v:20}],barsLoss:[{ts:i+1,v:0}],latency:20,loss:0,targets:1}]));
 function Probe(){const live=useNodes(0,true,false);window.live=live;
 const [ping,setPing]=React.useState(initial);window.clearPing=()=>setPing(new Map());window.latency=()=>setPing(old=>{const next=new Map(old);next.set(1,{...old.get(1),bars:[{ts:1,v:90}],latency:90});return next});
 return React.createElement(React.Fragment,null,React.createElement(ConnectionStatus,live),
 ${view==='card'?"live.nodes?.map(node=>React.createElement(NodeCard,{key:node.id,node,ping:ping.get(node.id)}))":"React.createElement(NodeListView,{nodes:live.nodes??[],ping})"});}
 createRoot(document.getElementById('root')).render(React.createElement(Probe));`)
 await expect.poll(()=>!!socket).toBe(true)
 await expect.poll(()=>page.evaluate(()=>Object.keys((window as any).__renders??{}).filter(k=>k.startsWith('node:')).length)).toBe(100)
 socket.send(JSON.stringify({nodes}));await expect.poll(()=>page.evaluate(()=>(window as any).live.transport)).toBe('websocket')
 const counts=()=>page.evaluate(()=>(window as any).__renders)
 const baseline=await counts();expect(injected).toEqual(expect.arrayContaining(names.map(n=>n==='NodeListView'?'NodeRow':n)))
 await page.clock.runFor(5000);expect(await counts()).toEqual(baseline)
 await page.evaluate(()=>{(window as any).before=(window as any).live.nodes})
 socket.send(JSON.stringify({nodes}));await expect.poll(()=>page.evaluate(()=>Date.now()-(window as any).live.lastSuccessAt)).toBe(0)
 expect(await counts()).toEqual(baseline)
 expect(await page.evaluate(()=>(window as any).before===(window as any).live.nodes)).toBe(true)
 expect(await page.evaluate(()=>(window as any).live.nodes.some((n:any)=>n.addresses||n.ip))).toBe(false)
 nodes[0].metrics.cpu=99;socket.send(JSON.stringify({nodes}))
 await expect.poll(async()=>(await counts())['node:1']).toBe(baseline['node:1']+1)
 const cpu=await counts();for(let id=2;id<=100;id++)expect(cpu['node:'+id]).toBe(baseline['node:'+id])
 await expect(page.locator('[data-node-id="1"]').first()).toContainText('99')
 if(view==='card'){
  expect(cpu['latency:1']).toBe(baseline['latency:1'])
  await page.evaluate(()=>(window as any).latency());await expect.poll(async()=>(await counts())['latency:1']).toBe(baseline['latency:1']+1)
  const latency=await counts();for(let id=2;id<=100;id++)expect(latency['latency:'+id]).toBe(baseline['latency:'+id])
  expect(latency['loss:1']).toBe(baseline['loss:1'])
  await page.evaluate(()=>(window as any).clearPing());await expect.poll(async()=>(await counts())['latency:empty']).toBe(100)
  const empty=await counts();nodes[0].metrics.cpu=98;socket.send(JSON.stringify({nodes}));await expect.poll(async()=>(await counts())['node:1']).toBe(empty['node:1']+1)
  expect((await counts())['latency:empty']).toBe(empty['latency:empty'])
 }
 console.log(JSON.stringify({view,mountNodeRenders:Object.entries(baseline).filter(([k])=>k.startsWith('node:')).reduce((n,[,v])=>n+Number(v),0),idleAdded:0,equalFrameAdded:0,cpuAdded:1,unaffectedAdded:0}))
})

test('deadline hook crosses strict threshold once, cancels refresh deadline and has no empty/past loop',async({page})=>{
 await page.clock.install({time:new Date('2026-10-01T00:00:00Z')});await page.clock.pauseAt(new Date('2026-10-01T00:00:00Z'))
 await openHarness(page,`
 import React from '/node_modules/.vite/deps/react.js';
 import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
 import {useDeadline} from '/src/lib/use-deadline.ts';
 window.evaluations=0;window.timers=0;
 const original=window.setTimeout;window.setTimeout=(...args)=>{window.timers++;return original(...args)};
 function Probe(){const [success,setSuccess]=React.useState(Date.now());window.refresh=()=>setSuccess(Date.now());
 const [enabled,setEnabled]=React.useState(true);window.disable=()=>setEnabled(false);
 const now=useDeadline(enabled?[success+15001]:[]);window.evaluations++;
 return React.createElement('output',null,String(now-success>15000));}
 ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Probe));`)
 await expect(page.locator('output')).toHaveText('false')
 const initial=await page.evaluate(()=>(window as any).evaluations)
 await page.clock.runFor(15000);await expect(page.locator('output')).toHaveText('false')
 expect(await page.evaluate(()=>(window as any).evaluations)).toBe(initial)
 await page.clock.runFor(1);await expect(page.locator('output')).toHaveText('true')
 const expired=await page.evaluate(()=>(window as any).evaluations)
 await page.clock.runFor(10000);expect(await page.evaluate(()=>(window as any).evaluations)).toBe(expired)
 await page.evaluate(()=>(window as any).refresh());await expect(page.locator('output')).toHaveText('false')
 await page.clock.runFor(10000);await page.evaluate(()=>(window as any).refresh())
 await page.clock.runFor(5001);await expect(page.locator('output')).toHaveText('false')
 await page.clock.runFor(10000);await expect(page.locator('output')).toHaveText('true')
 await page.evaluate(()=>(window as any).disable());const timers=await page.evaluate(()=>(window as any).timers)
 await page.clock.runFor(60000);expect(await page.evaluate(()=>(window as any).timers)).toBe(timers)
})

test('real live hook expires at 15001 and a new WS success cancels the old boundary',async({page})=>{
 const nodes=makeNodes(1,{now:1790800000});let socket:any
 await page.clock.install();await page.clock.pauseAt(new Date())
 await page.routeWebSocket('**/api/ws',ws=>{socket=ws})
 await page.route('**/api/nodes',route=>route.fulfill({json:{nodes}}))
 await openHarness(page,`
 import React from '/node_modules/.vite/deps/react.js';import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
 import {useNodes} from '/src/lib/api.ts';import {ConnectionStatus} from '/src/components/ConnectionStatus.tsx';
 function Probe(){const live=useNodes(0,true,false);window.live=live;window.renders=(window.renders??0)+1;return React.createElement(React.Fragment,null,React.createElement('output',null,String(live.stale)),React.createElement(ConnectionStatus,{...live,onRetry:live.refresh}));}
 ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Probe));`)
 await expect.poll(()=>!!socket).toBe(true);socket.send(JSON.stringify({nodes}));await expect.poll(()=>page.evaluate(()=>(window as any).live.transport)).toBe('websocket')
 const renders=await page.evaluate(()=>(window as any).renders)
 await page.clock.runFor(15000);await expect(page.locator('output')).toHaveText('false');expect(await page.evaluate(()=>(window as any).renders)).toBe(renders)
 await page.clock.runFor(1);await expect(page.locator('output')).toHaveText('true');await expect(page.locator('[role=status]')).toHaveText('数据已过期')
 socket.send(JSON.stringify({nodes}));await expect(page.locator('output')).toHaveText('false')
 await page.clock.runFor(10000);socket.send(JSON.stringify({nodes}));await expect.poll(()=>page.evaluate(()=>Date.now()-(window as any).live.lastSuccessAt)).toBe(0)
 await page.clock.runFor(5001);await expect(page.locator('output')).toHaveText('false')
 await page.clock.runFor(10000);await expect(page.locator('output')).toHaveText('true')
})

test('history deadlines update per node at 120001 without rebuilding status maps each second',async({page})=>{
 let release!:()=>void;const held=new Promise<void>(resolve=>release=resolve)
 await page.clock.install();await page.clock.pauseAt(new Date())
 await page.route('**/api/nodes/*/metrics?*',async route=>{if(route.request().url().includes('/2/'))await held;await route.fulfill({json:{metrics:[],probes:{1:'Synthetic'},ping:[{task_id:1,ts:120,latency:40,loss:10}]}})})
 try{
 await openHarness(page,`
 import React from '/node_modules/.vite/deps/react.js';import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
 import {useQualitySummaries} from '/src/lib/ping.ts';
 function Probe(){const value=useQualitySummaries([1,2],24);window.value=value;window.renders=(window.renders??0)+1;return React.createElement('output',null,[1,2].map(id=>String(value.statuses.get(id).stale)).join('/'));}
 ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Probe));`)
 await expect.poll(async()=>{await page.clock.runFor(32);return page.evaluate(()=>(window as any).value?.histories.size)}).toBe(1)
 const first=await page.evaluate(()=>(window as any).value.timestamps.get(1))
 await page.clock.runFor(1000);release();await expect.poll(()=>page.evaluate(()=>(window as any).value?.histories.size)).toBe(2)
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));(window as any).statuses=(window as any).value.statuses})
 const settled=await page.evaluate(()=>(window as any).renders)
 await page.clock.runFor(5000);expect(await page.evaluate(()=>(window as any).renders)).toBe(settled)
 expect(await page.evaluate(()=>(window as any).statuses===(window as any).value.statuses)).toBe(true)
 await page.clock.runFor(await page.evaluate(t=>t+120000-Date.now(),first));await expect(page.locator('output')).toHaveText('false/false')
 await page.clock.runFor(1);await expect(page.locator('output')).toHaveText('true/false')
 const second=await page.evaluate(()=>(window as any).value.timestamps.get(2))
 await page.clock.runFor(await page.evaluate(t=>t+120001-Date.now(),second));await expect(page.locator('output')).toHaveText('true/true')
 }finally{release()}
})

test('Dashboard removes expired high-loss matches while retaining history and frozen/live sorting behavior',async({page})=>{
 const nodes=makeNodes(2,{now:1790800000});nodes[0].expires_in=0
 let socket:any
 await page.clock.install();await page.clock.pauseAt(new Date())
 await page.routeWebSocket('**/api/ws',ws=>{socket=ws})
 await page.route('**/api/nodes',route=>route.fulfill({json:{nodes}}))
 await page.route('**/api/nodes/*/metrics?*',route=>route.fulfill({json:{metrics:[],probes:{1:'Synthetic'},ping:[{task_id:1,ts:120,latency:40,loss:10}]}}))
 await openHarness(page,`
 import React from '/node_modules/.vite/deps/react.js';import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
 import {useNodes} from '/src/lib/api.ts';import {Dashboard} from '/src/pages/Dashboard.tsx';import {readDashboardState} from '/src/lib/dashboard-state.ts';
 const config={show_region:false,show_network:true,show_expiring:true,capacity_mbps:1000,footer_text:'',footer_url:''};
 function Probe(){const value=useNodes(0,true,false);window.value=value;const [state,setState]=React.useState(()=>({...readDashboardState(),sort:'cpu',asc:true,live:false}));window.patch=next=>setState(old=>({...old,...next}));
 return React.createElement(Dashboard,{nodes:value.nodes,error:null,state,onChange:setState,config});}
 ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Probe));`)
 await expect.poll(()=>!!socket).toBe(true);socket.send(JSON.stringify({nodes}));await expect.poll(()=>page.evaluate(()=>(window as any).value.transport)).toBe('websocket')
 await expect(page.getByTestId('node-card')).toHaveCount(2)
 await expect(page.getByText('正在加载历史',{exact:false})).toHaveCount(0)
 const ids=()=>page.getByTestId('node-card').evaluateAll(elements=>elements.map(e=>e.getAttribute('data-node-id')))
 expect(await ids()).toEqual(['1','2'])
 nodes[0].metrics.cpu=99;socket.send(JSON.stringify({nodes}));await expect(page.locator('[data-node-id="1"]')).toContainText('99');expect(await ids()).toEqual(['1','2'])
 await page.evaluate(()=>(window as any).patch({live:true}));await expect.poll(ids).toEqual(['2','1'])
 await page.evaluate(()=>(window as any).patch({attention:'expiring'}));await expect(page.locator('[data-node-id="1"]')).toBeVisible()
 await page.evaluate(()=>(window as any).patch({attention:'loss'}));await expect(page.getByTestId('node-card')).toHaveCount(2)
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))})
 await page.clock.runFor(120001);await expect(page.getByTestId('node-card')).toHaveCount(0)
 await page.evaluate(()=>(window as any).patch({attention:'all'}));await expect(page.getByTestId('node-card')).toHaveCount(2)
 await expect(page.getByText('数据已过期',{exact:false}).first()).toBeVisible()
 nodes[0].online=false;socket.send(JSON.stringify({nodes}));await expect(page.locator('[data-node-id="1"]')).toHaveClass(/is-offline/)
})

test('empty and already evaluated deadline sets create no timeout',async({page})=>{
 await page.clock.install();await page.clock.pauseAt(new Date())
 await openHarness(page,`
 import React from '/node_modules/.vite/deps/react.js';import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
 import {useDeadline} from '/src/lib/use-deadline.ts';
 window.timers=0;const original=window.setTimeout;window.setTimeout=(...args)=>{window.timers++;return original(...args)};
 function Probe(){useDeadline([]);useDeadline([Date.now()-1,NaN,Infinity]);return React.createElement('output',null,'ready');}
 ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Probe));`)
 await expect(page.locator('output')).toHaveText('ready');await page.clock.runFor(60000)
 expect(await page.evaluate(()=>(window as any).timers)).toBe(0)
})
