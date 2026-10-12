import {test,expect} from '@playwright/test'
import {openHarness} from './page'
const imports=`import React from '/node_modules/.vite/deps/react.js';
import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
import {useHistoryBatch} from '/src/lib/use-history.ts';
const {createRoot}=ReactDOM;`
const body={metrics:[],ping:[],probes:{}}
test('simultaneous ping and metrics consumers share four slots',async({page})=>{
 const releases=new Map<number,()=>void>();let pingActive=0,metricsActive=0,peak=0
 await page.route('**/api/nodes/*/metrics?*',async route=>{
  const url=new URL(route.request().url()),id=Number(url.pathname.split('/')[3]),ping=url.searchParams.get('series')==='ping'
  if(ping)pingActive++;else metricsActive++;peak=Math.max(peak,pingActive+metricsActive)
  await new Promise<void>(resolve=>releases.set(id,resolve))
  if(ping)pingActive--;else metricsActive--;await route.fulfill({json:body})
 })
 try{
 await openHarness(page,imports+`
 function Consumer({ids,series}){useHistoryBatch(ids.map(id=>({id,hours:24,points:288,series})),0,{priorityIds:ids.slice(0,4)});return null}
 createRoot(document.getElementById('root')).render(React.createElement(React.Fragment,null,
 React.createElement(Consumer,{ids:[1,2,3,4,5,6,7,8],series:'ping'}),
 React.createElement(Consumer,{ids:[101,102,103,104],series:'metrics'})));`)
 await expect.poll(()=>releases.size).toBeGreaterThanOrEqual(4)
 expect(peak).toBeLessThanOrEqual(4)
 // Newly mounted metrics priority takes the released slots while one ping stays held.
 for(const id of [1,2,3]){await expect.poll(()=>releases.has(id)).toBe(true);releases.get(id)!()}
 await expect.poll(()=>metricsActive).toBeGreaterThan(0)
 expect(pingActive).toBeGreaterThan(0);expect(peak).toBeLessThanOrEqual(4)
 }finally{await page.close();releases.forEach(release=>release())}
})
test('initial priority orders starts and changes never restart query ownership',async({page})=>{
 const started:number[]=[],releases=new Map<number,()=>void>();let free=false
 await page.route('**/api/nodes/*/metrics?*',async route=>{const id=Number(new URL(route.request().url()).pathname.split('/')[3]);started.push(id);if(!free)await new Promise<void>(r=>releases.set(id,r));await route.fulfill({json:body})})
 try{
 await openHarness(page,imports+`
 function Probe(){const [priority,setPriority]=React.useState([8,7,6,5]);window.prioritize=setPriority;
 const v=useHistoryBatch([1,2,3,4,5,6,7,8].map(id=>({id,hours:24,points:288,series:'ping'})),0,{priorityIds:priority});
 return React.createElement('output',null,v.progress.settled+'/'+v.progress.total)}
 createRoot(document.getElementById('root')).render(React.createElement(Probe));`)
 await expect.poll(()=>started.length).toBe(4);expect(started).toEqual([8,7,6,5])
 await page.evaluate(()=>(window as any).prioritize([4]));releases.get(8)!()
 await expect.poll(()=>started.length).toBe(5);expect(started[4]).toBe(4)
 free=true;releases.forEach(r=>r());await expect(page.locator('output')).toHaveText('8/8');expect(new Set(started).size).toBe(8);expect(started.length).toBe(8)
 }finally{free=true;releases.forEach(r=>r())}
})
