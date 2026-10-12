import {test,expect} from '@playwright/test'
import {openHarness} from './page'
const source=`import React from '/node_modules/.vite/deps/react.js';
import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
import {useVisibleNodes} from '/src/lib/use-visible-nodes.ts';
function Probe(){const [ids,setIds]=React.useState([8,7,6,5,4]);window.setIds=setIds;
const [layout,setLayout]=React.useState(false);window.setLayout=setLayout;
const {rootRef,priorityIds}=useVisibleNodes(ids);return React.createElement('div',{ref:rootRef},
React.createElement('output',null,priorityIds.join(',')),...ids.flatMap(id=>[
React.createElement(layout?'section':'div',{key:id,'data-node-id':id,style:{height:30}},id),
React.createElement('div',{key:'hidden'+id,'data-node-id':id,style:{display:'none'}},id)]))}
const root=ReactDOM.createRoot(document.getElementById('root'));window.unmount=()=>root.unmount();root.render(React.createElement(Probe));`
test('visibility handles duplicate hidden rows, mutations and cleanup',async({page})=>{
 await page.addInitScript(()=>{const w=window as any;w.observed=new Set();w.observeCalls=0;w.ioDisconnected=false;
 w.IntersectionObserver=class{constructor(callback:any,options:any){w.report=callback;w.margin=options.rootMargin}observe(e:any){w.observed.add(e);w.observeCalls++}unobserve(e:any){w.observed.delete(e)}disconnect(){w.observed.clear();w.ioDisconnected=true}}})
 await openHarness(page,source)
 await expect(page.locator('output')).toHaveText('8,7,6,5')
 await expect.poll(()=>page.evaluate(()=>(window as any).observed.size)).toBe(10)
 expect(await page.evaluate(()=>(window as any).margin)).toBe('200px 0px')
 await page.evaluate(()=>{const rows=document.querySelectorAll('[data-node-id="7"]');(window as any).report([{target:rows[0],isIntersecting:true,boundingClientRect:{width:100,height:30}},{target:rows[1],isIntersecting:true,boundingClientRect:{width:0,height:0}}])})
 await expect(page.locator('output')).toHaveText('7')
 expect(await page.evaluate(()=>(window as any).observeCalls)).toBe(10)
 await page.evaluate(()=>(window as any).setIds([9,8,7]))
 await expect.poll(()=>page.evaluate(()=>(window as any).observed.size)).toBe(6)
 await page.evaluate(()=>{const row=document.querySelector('[data-node-id="9"]');(window as any).report([{target:row,isIntersecting:true,boundingClientRect:{width:100,height:30}}])})
 await expect(page.locator('output')).toHaveText('9,7')
 await page.evaluate(()=>{(window as any).oldRow=document.querySelector('[data-node-id="9"]');(window as any).setLayout(true)})
 await expect.poll(()=>page.evaluate(()=>[...(window as any).observed].filter((e:any)=>e.style.display!=='none').every((e:any)=>e.tagName==='SECTION'))).toBe(true)
 await page.evaluate(()=>{const rows=document.querySelectorAll('[data-node-id="7"]');(rows[0] as HTMLElement).style.display='none';(rows[1] as HTMLElement).style.display='block';(window as any).report([{target:rows[0],isIntersecting:false,boundingClientRect:{width:0,height:0}},{target:rows[1],isIntersecting:true,boundingClientRect:{width:100,height:30}}])})
 await expect(page.locator('output')).toHaveText('7')
 await page.evaluate(()=>{(window as any).report([{target:(window as any).oldRow,isIntersecting:true,boundingClientRect:{width:100,height:30}}])})
 await expect(page.locator('output')).toHaveText('7')
 await page.evaluate(()=>{document.querySelectorAll<HTMLElement>('[data-node-id="7"]')[1].dataset.nodeId='8'})
 await expect(page.locator('output')).toHaveText('8')
 await page.evaluate(()=>{const e=document.querySelector('[data-node-id="9"]');(window as any).report([{target:e,isIntersecting:true,boundingClientRect:{width:100,height:30}}]);(window as any).setIds([7,8,9])})
 await expect(page.locator('output')).toHaveText('8,9')
 await page.evaluate(()=>(window as any).unmount());expect(await page.evaluate(()=>(window as any).ioDisconnected)).toBe(true)
})
test('without IntersectionObserver the first displayed four follow changes',async({page})=>{
 await page.addInitScript(()=>{delete (window as any).IntersectionObserver})
 await openHarness(page,source);await expect(page.locator('output')).toHaveText('8,7,6,5')
 await page.evaluate(()=>(window as any).setIds([9,3]));await expect(page.locator('output')).toHaveText('9,3')
})

test('real observer tracks responsive layout without synchronous geometry or descendant rebinding',async({page})=>{
 await page.addInitScript(()=>{
 const w=window as any;w.geometryReads=0;w.binds=0;
 for(const name of ['getClientRects','getBoundingClientRect'] as const){const original=Element.prototype[name];Element.prototype[name]=function(...args:any[]){if(this.hasAttribute('data-node-id'))w.geometryReads++;return original.apply(this,args as [])} as any}
 const Original=IntersectionObserver;w.IntersectionObserver=class extends Original{observe(e:Element){w.binds++;super.observe(e)}}
 })
 await openHarness(page,source)
 await expect(page.locator('output')).toHaveText('8,7,6,5,4')
 expect(await page.evaluate(()=>(window as any).geometryReads)).toBe(0)
 const binds=await page.evaluate(()=>(window as any).binds)
 await page.evaluate(()=>{const row=document.querySelector('[data-node-id="8"]')!;for(let i=0;i<20;i++){const text=document.createElement('span');text.textContent='chart '+i;row.append(text);text.style.color='red';text.remove()}})
 await page.waitForTimeout(100)
 expect(await page.evaluate(()=>(window as any).binds)).toBe(binds)
 expect(await page.evaluate(()=>(window as any).geometryReads)).toBe(0)
 await page.evaluate(()=>document.querySelectorAll<HTMLElement>('[data-node-id="8"]').forEach(e=>e.style.display='none'))
 await expect(page.locator('output')).toHaveText('7,6,5,4')
 await page.evaluate(()=>{document.querySelectorAll<HTMLElement>('[data-node-id="8"]')[1].style.display='block'})
 await expect(page.locator('output')).toHaveText('8,7,6,5,4')
 expect(await page.evaluate(()=>(window as any).geometryReads)).toBe(0)
})
