import {test,expect} from '@playwright/test'
import {openHarness} from './page'
// @ts-ignore Shared fixture with the production benchmark.
import {makeNodes} from '../performance/synthetic-data.mjs'

const source = (nodes: unknown[]) => `
 import React from '/node_modules/.vite/deps/react.js';
 import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
 import {Dashboard} from '/src/pages/Dashboard.tsx';
 import {DEFAULT_DASHBOARD} from '/src/lib/dashboard-state.ts';
 import '/src/index.css';
 const nodes=${JSON.stringify(nodes)};
 const observer=new MutationObserver(()=>{const n=document.querySelectorAll('[data-testid="node-card"]').length;if(n){window.firstBatch=n;observer.disconnect()}});
 observer.observe(document.getElementById('root'),{childList:true,subtree:true});
 function Probe(){const [state,setState]=React.useState(DEFAULT_DASHBOARD);return React.createElement(Dashboard,{nodes,error:null,config:{show_region:false,show_network:false,show_expiring:false},state,onChange:setState})}
 ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Probe));
`

test('large dashboards yield after the first cards and eventually show every node',async({page})=>{
 let histories=0
 await page.route('**/api/nodes/*/metrics?*',r=>{histories++;return r.fulfill({json:{ping:[],probes:{}}})})
 await openHarness(page,source(makeNodes(100,{now:1790800000})))
 // Source-module compilation is separate from the batching completion check.
 await expect(page.getByTestId('node-card').first()).toBeAttached()
 await expect(page.getByTestId('node-card')).toHaveCount(100)
 await expect.poll(()=>histories).toBe(100)
 const first=await page.evaluate(()=>(window as any).firstBatch)
 expect(first).toBeGreaterThan(0);expect(first).toBeLessThan(100)
 expect(await page.getByTestId('node-card').evaluateAll(es=>new Set(es.map(e=>e.getAttribute('data-node-id'))).size)).toBe(100)
 await page.getByPlaceholder('搜索节点名称').fill('Synthetic 100')
 await expect(page.getByTestId('node-card')).toHaveCount(1)
 await page.getByPlaceholder('搜索节点名称').fill('')
 await expect(page.getByTestId('node-card')).toHaveCount(100)
})

test('offscreen mini charts keep their height and activate on approach, once',async({page})=>{
 await page.setViewportSize({width:390,height:844})
 await page.route('**/api/nodes/*/metrics?*',r=>r.fulfill({json:{ping:[{task_id:1,ts:1790800000,latency:42,loss:1}],probes:{1:'Target'}}}))
 await openHarness(page,source(makeNodes(100,{now:1790800000})))
 await expect(page.getByTestId('node-card')).toHaveCount(100)
 const last=page.getByTestId('node-card').last();const graph=last.locator('.mini-chart').first()
 await expect(graph.locator(':scope > div')).toHaveCount(0)
 const before=await graph.evaluate(e=>e.getBoundingClientRect().height)
 await last.scrollIntoViewIfNeeded();await expect(graph.locator(':scope > div')).toHaveCount(24)
 expect(await graph.evaluate(e=>e.getBoundingClientRect().height)).toBe(before)
 await page.evaluate(()=>scrollTo(0,0));await expect(graph.locator(':scope > div')).toHaveCount(24)
})

test('scroll persistence does not rerender the app or lose position on a live update',async({page})=>{
 const nodes=makeNodes(40,{now:1790800000});let socket:any
 await page.route('**/api/me',r=>r.fulfill({json:{authed:false,public_page:true}}))
 await page.route('**/api/nodes',r=>r.fulfill({json:{nodes}}))
 await page.route('**/api/nodes/*/metrics?*',r=>r.fulfill({json:{ping:[],probes:{}}}))
 await page.routeWebSocket('**/api/ws',s=>{socket=s})
 await page.route('**/src/App.tsx*',async route=>{
 const res=await route.fetch();let body=await res.text();const pattern=/function App\(\) \{/;
 expect(body).toMatch(pattern);body=body.replace(pattern,h=>h+'\nwindow.appRenders=(window.appRenders??0)+1;');await route.fulfill({response:res,body})
 })
 await openHarness(page,`
 import React from '/node_modules/.vite/deps/react.js';import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
 import App from '/src/App.tsx';import '/src/index.css';
 history.replaceState(null,'','/');ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));`)
 await expect(page.getByTestId('node-card')).toHaveCount(40)
 // Start in a stable healthy layout; the first WS sample hides the polling notice.
 socket.send(JSON.stringify({nodes}));await expect(page.locator('.connection-status')).toHaveCount(0)
 await page.waitForTimeout(400)
 const before=await page.evaluate(()=>(window as any).appRenders)
 for(const y of [500,900,1300]){await page.evaluate(y=>scrollTo(0,y),y);await page.waitForTimeout(150)}
 expect(await page.evaluate(()=>(window as any).appRenders)).toBe(before)
 const y=await page.evaluate(()=>scrollY)
 expect(y).toBeGreaterThan(100)
 expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('dstatus-dashboard-v1')!).scrollY)).toBe(y)
 nodes[0].metrics.cpu=99;socket.send(JSON.stringify({nodes}));await expect.poll(()=>page.evaluate(()=>(window as any).appRenders)).toBeGreaterThan(before)
 await page.evaluate(()=>dispatchEvent(new Event('pagehide')))
 expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('dstatus-dashboard-v1')!).scrollY)).toBe(y)
})


test('hidden dashboards pause mounting and resume all nodes when visible',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(document,'hidden',{configurable:true,value:true}))
 await openHarness(page,source(makeNodes(100,{now:1790800000})))
 await expect(page.getByTestId('node-card').first()).toBeAttached()
 const count=await page.getByTestId('node-card').count();expect(count).toBeLessThan(100)
 await page.waitForTimeout(200);expect(await page.getByTestId('node-card').count()).toBe(count)
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'))})
 await expect(page.getByTestId('node-card')).toHaveCount(100)
})

test('without IntersectionObserver every mounted chart remains available',async({page})=>{
 await page.addInitScript(()=>{delete (window as any).IntersectionObserver})
 await page.route('**/api/nodes/*/metrics?*',r=>r.fulfill({json:{ping:[],probes:{}}}))
 await openHarness(page,source(makeNodes(16,{now:1790800000})))
 await expect(page.getByTestId('node-card')).toHaveCount(16)
 await expect(page.getByTestId('node-card').last().locator('.mini-chart').first().locator(':scope > div')).toHaveCount(24)
})

for (const canceled of [false,true]) test(`App ${canceled ? 'keeps a user-canceled position' : 'restores a deep saved position'} after hidden mounting and identity review`,async({page})=>{
 await page.setViewportSize({width:390,height:844})
 await page.addInitScript(()=>{
  Object.defineProperty(document,'hidden',{configurable:true,value:true})
  sessionStorage.setItem('dstatus-dashboard-v1',JSON.stringify({v:1,scrollY:8000}))
 })
 const nodes=makeNodes(100,{now:1790800000})
 await page.route('**/api/me',r=>r.fulfill({json:{authed:false,public_page:true}}))
 await page.route('**/api/nodes',r=>r.fulfill({json:{nodes}}))
 await page.route('**/api/nodes/*/metrics?*',r=>r.fulfill({json:{ping:[],probes:{}}}))
 await page.routeWebSocket('**/api/ws',()=>{})
 await openHarness(page,`
 import React from '/node_modules/.vite/deps/react.js';import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
 import App from '/src/App.tsx';import '/src/index.css';
 history.replaceState(null,'','/');ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));`)
 await expect(page.getByTestId('node-card').first()).toBeAttached()
 await page.waitForTimeout(4000)
 expect(await page.evaluate(()=>scrollY)).toBe(0)
 if(canceled) await page.evaluate(()=>dispatchEvent(new PointerEvent('pointerdown')))
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'))})
 await expect(page.getByTestId('node-card')).toHaveCount(100)
 if(canceled) {
  await page.waitForTimeout(500)
  expect(await page.evaluate(()=>scrollY)).toBe(0)
 } else await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(8000)
})

test('scroll restoration waits for delayed mounting beyond its usual deadline',async({page})=>{
 await openHarness(page,`
 import {restoreScroll} from '/src/lib/dashboard-state.ts';
 const content=document.createElement('div');content.style.height='1200px';document.body.append(content);
 let ready=false;window.complete=()=>{content.style.height='6500px';ready=true};
 restoreScroll(5000,()=>ready);`)
 await expect.poll(()=>page.evaluate(()=>typeof (window as any).complete)).toBe('function')
 await page.waitForTimeout(4000)
 expect(await page.evaluate(()=>scrollY)).toBe(0)
 await page.evaluate(()=>(window as any).complete());await page.waitForTimeout(100)
 expect(await page.evaluate(()=>scrollY)).toBe(5000)
})

test('a completed shorter list still clamps a missing saved scroll destination',async({page})=>{
 await openHarness(page,`
 import {restoreScroll} from '/src/lib/dashboard-state.ts';
 const content=document.createElement('div');content.id='scroll-content';content.style.height='1200px';document.body.append(content);
 restoreScroll(5000,()=>true);`)
 await expect(page.locator('#scroll-content')).toBeAttached()
 await page.waitForTimeout(4000)
 const actual=await page.evaluate(()=>({y:scrollY,max:document.documentElement.scrollHeight-innerHeight}))
 expect(actual.y).toBe(actual.max);expect(actual.y).toBeGreaterThan(0)
})
