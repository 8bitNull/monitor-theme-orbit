import {test,expect} from '@playwright/test'
import {openHarness} from './page'
const source=`
 import React from '/node_modules/.vite/deps/react.js';
 import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
 import {useHistoryBatch} from '/src/lib/use-history.ts';
 import {historyClient} from '/src/lib/history-client.ts';
 window.clearHistory=()=>historyClient.clear();
 function Probe(){const [ids,setIds]=React.useState([1,2]);window.changeIds=setIds;
 const [nonce,setNonce]=React.useState(0);window.refresh=()=>setNonce(x=>x+1);
 const [hours,setHours]=React.useState(24);window.changeHours=setHours;
 const value=useHistoryBatch(ids.map(id=>({id,hours,points:288,series:'ping'})),nonce);
 return React.createElement('div',null,
 React.createElement('output',{'data-testid':'first'},value.histories.get(ids[0])?.ping?.[0]?.latency??'pending'),
 React.createElement('output',{'data-testid':'progress'},(value.progress?.settled??0)+'/'+(value.progress?.total??0)),
 React.createElement('output',{'data-testid':'errors'},value.errors.size));}
 window.harnessRoot=ReactDOM.createRoot(document.getElementById('root'));
 window.harnessRoot.render(React.createElement(Probe));`
const body=(latency=40)=>({metrics:[],probes:{1:'Synthetic'},ping:[{task_id:1,ts:120,latency}]})
test('mounted hook publishes first node while peer is pending',async({page})=>{
 let release!:()=>void;const held=new Promise<void>(r=>release=r)
 await page.route('**/api/nodes/*/metrics?*',async route=>{if(route.request().url().includes('/2/'))await held;await route.fulfill({json:body()})})
 try {await openHarness(page,source);await expect(page.getByTestId('first')).toHaveText('40');await expect(page.getByTestId('progress')).toHaveText('1/2')}
 finally{release()}
})
for(const action of ['switch','clear','unmount'])test(`late response cannot repopulate after ${action}`,async({page})=>{
 let release!:()=>void;const held=new Promise<void>(r=>release=r);let started=0
 await page.route('**/api/nodes/*/metrics?*',async route=>{started++;if(!route.request().url().includes('/3/'))await held;await route.fulfill({json:body(route.request().url().includes('/3/')?70:40)})})
 try{await openHarness(page,source);await expect.poll(()=>started).toBe(2)
 await page.evaluate(action=>{const w=window as any;if(action==='switch')w.changeIds([3]);else if(action==='clear')w.clearHistory();else w.harnessRoot.unmount()},action)
 release();if(action==='switch')await expect(page.getByTestId('first')).toHaveText('70')
 await page.waitForTimeout(100)
 if(action==='clear')await expect(page.getByTestId('first')).toHaveText('pending')
 if(action==='unmount')await expect(page.locator('#root')).toBeEmpty()
 if(action==='switch')await expect(page.getByTestId('progress')).toHaveText('1/1')
 }finally{release()}
})
test('refresh shares inflight work, retains failures, and recovers',async({page})=>{
 let requests=0,fail=false,hold=false,release!:()=>void;const held=new Promise<void>(r=>release=r)
 await page.route('**/api/nodes/*/metrics?*',async route=>{requests++;if(hold)await held;await route.fulfill(fail?{status:503,body:'Synthetic outage'}:{json:body()})})
 try{await openHarness(page,source);await expect(page.getByTestId('progress')).toHaveText('2/2');expect(requests).toBe(2)
 hold=true;await page.evaluate(()=>(window as any).refresh());await expect.poll(()=>requests).toBe(4)
 await page.evaluate(()=>(window as any).refresh());await page.waitForTimeout(100);expect(requests).toBe(4)
 fail=true;release();await expect(page.getByTestId('errors')).toHaveText('2');await expect(page.getByTestId('first')).toHaveText('40')
 fail=false;await page.evaluate(()=>(window as any).refresh());await expect(page.getByTestId('errors')).toHaveText('0');expect(requests).toBe(6)
 }finally{release()}
})
test('hidden page accepts owned results and pauses its 60 second cycle',async({page})=>{
 let requests=0,release!:()=>void;const held=new Promise<void>(r=>release=r)
 await page.clock.install();await page.clock.pauseAt(new Date())
 await page.route('**/api/nodes/*/metrics?*',async route=>{requests++;await held;await route.fulfill({json:body()})})
 try{await openHarness(page,source);await expect.poll(()=>requests).toBe(2)
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))})
 release();await expect(page.getByTestId('progress')).toHaveText('2/2');await expect(page.getByTestId('first')).toHaveText('40')
 await page.clock.runFor(61000);expect(requests).toBe(2)
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});for(let i=0;i<3;i++)document.dispatchEvent(new Event('visibilitychange'))})
 await expect.poll(()=>requests).toBe(4);await expect(page.getByTestId('progress')).toHaveText('2/2');expect(requests).toBe(4)
 }finally{release()}
})
test('401 auth invalidation clears owner before another late response',async({page})=>{
 let release!:()=>void;const held=new Promise<void>(r=>release=r)
 await page.route('**/api/nodes/*/metrics?*',async route=>{if(route.request().url().includes('/2/'))await held;await route.fulfill(route.request().url().includes('/1/')?{status:401,body:'Synthetic unauthorized'}:{json:body()})})
 try{await openHarness(page,source.replace('window.clearHistory=()=>historyClient.clear();',"window.clearHistory=()=>historyClient.clear(); window.addEventListener('dstatus-auth-invalidated',()=>{window.invalidated=true;historyClient.clear()});"))
 await expect.poll(()=>page.evaluate(()=>(window as any).invalidated)).toBe(true);release();await page.waitForTimeout(100)
 await expect(page.getByTestId('first')).toHaveText('pending');await expect(page.getByTestId('progress')).toHaveText('0/0');await expect(page.getByTestId('errors')).toHaveText('0')
 }finally{release()}
})
test('order is identity neutral and range changes immediately mask prior values',async({page})=>{
 let requests=0,release!:()=>void;const held=new Promise<void>(r=>release=r)
 await page.route('**/api/nodes/*/metrics?*',async route=>{requests++;const next=new URL(route.request().url()).searchParams.get('hours')==='1';if(next)await held;await route.fulfill({json:body(next?90:40)})})
 try{await openHarness(page,source);await expect(page.getByTestId('progress')).toHaveText('2/2')
 await page.evaluate(()=>(window as any).changeIds([2,1]));await page.waitForTimeout(100);expect(requests).toBe(2)
 await page.evaluate(()=>(window as any).changeHours(1));await expect(page.getByTestId('first')).toHaveText('pending');await expect.poll(()=>requests).toBe(4)
 release();await expect(page.getByTestId('first')).toHaveText('90');await expect(page.getByTestId('progress')).toHaveText('2/2')
 }finally{release()}
})
test('quality status is per node and settled peer summary keeps its reference',async({page})=>{
 let release!:()=>void;const held=new Promise<void>(r=>release=r)
 await page.route('**/api/nodes/*/metrics?*',async route=>{if(route.request().url().includes('/2/'))await held;await route.fulfill({json:body()})})
 try{await openHarness(page,`
 import React from '/node_modules/.vite/deps/react.js';
 import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
 import {useQualitySummaries} from '/src/lib/ping.ts';
 function Probe(){const value=useQualitySummaries([1,2],24);const first=value.summaries.get(1);
 if(first&&!window.firstSummary)window.firstSummary=first;
 return React.createElement('output',{'data-testid':'status'},String(value.statuses.get(1).loading)+'/'+String(value.statuses.get(2).loading)+'/'+String(!first||first===window.firstSummary));}
 ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Probe));`)
 await expect(page.getByTestId('status')).toHaveText('false/true/true');release();await expect(page.getByTestId('status')).toHaveText('false/false/true')
 }finally{release()}
})
