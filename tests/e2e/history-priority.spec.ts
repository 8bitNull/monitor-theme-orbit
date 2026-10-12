import {test,expect} from '@playwright/test'
const history={metrics:[],probes:{1:'Synthetic'},ping:[{task_id:1,ts:120,latency:0,loss:0}]}
test('displayed reverse order starts first; scrolling reprioritizes without losing the full set',async({page})=>{
 await page.setViewportSize({width:390,height:844})
 await page.route('**/api/nodes',async route=>{const response=await route.fetch(),body=await response.json();body.nodes.forEach((n:any)=>n.sort=-n.id);await route.fulfill({json:body})})
 const started:number[]=[],release=new Map<number,()=>void>();let free=false
 await page.route('**/api/nodes/*/metrics?*',async route=>{const id=Number(new URL(route.request().url()).pathname.split('/')[3]);started.push(id);if(!free)await new Promise<void>(r=>release.set(id,r));await route.fulfill({json:history})})
 try{
 await page.goto('/');await expect.poll(()=>started.length).toBe(4);expect(started).toEqual([16,15,14,13])
 await expect(page.getByText('历史已完成 0/16',{exact:true})).toBeVisible()
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 await page.locator('[data-node-id="1"]').scrollIntoViewIfNeeded();await page.waitForTimeout(100)
 expect(started).toEqual([16,15,14,13]);release.get(16)!()
 await expect.poll(()=>started.length).toBe(5);expect([1,2]).toContain(started[4])
 free=true;release.forEach(r=>r());await expect.poll(()=>started.length).toBe(16)
 await expect(page.getByText(/历史已完成/)).toHaveCount(0);expect(new Set(started).size).toBe(16)
 }finally{free=true;release.forEach(r=>r())}
})
test('filtered network retains full-set progress and genuine zero-valued partial statistics',async({page})=>{
 let release!:()=>void;const gate=new Promise<void>(r=>release=r)
 const started:number[]=[]
 await page.route('**/api/nodes/*/metrics?*',async route=>{const id=Number(new URL(route.request().url()).pathname.split('/')[3]);started.push(id);if(id!==1)await gate;await route.fulfill(id===2?{status:503,body:'Synthetic failure'}:{json:history})})
 try{
 await page.goto('/network-quality');await expect(page.getByText('历史已完成 1/16',{exact:true})).toBeVisible()
 await expect(page.getByText('历史仍在加载，统计暂不完整',{exact:true})).toBeVisible()
 await expect(page.locator('main').getByText('有效桶延迟均值',{exact:true}).first().locator('..')).toContainText('0ms')
 await page.getByPlaceholder('搜索节点名称').fill('no-matching-synthetic-node')
 release();await expect(page.getByText('历史已完成 16/16',{exact:true})).toBeVisible();expect(new Set(started).size).toBe(16)
 await expect(page.getByText('历史仍在加载，统计暂不完整',{exact:true})).toHaveCount(0)
 await expect(page.getByText('部分历史获取失败',{exact:false})).toBeVisible()
 }finally{release()}
})
test('initial high-loss filter with no summaries still queries every authorized node',async({page})=>{
 await page.addInitScript(()=>sessionStorage.setItem('dstatus-dashboard-v1',JSON.stringify({v:1,attention:'loss'})))
 const ids:number[]=[]
 await page.route('**/api/nodes/*/metrics?*',route=>{ids.push(Number(new URL(route.request().url()).pathname.split('/')[3]));return route.fulfill({json:history})})
 await page.goto('/');await expect.poll(()=>ids.length).toBe(16)
 await expect(page.getByText(/历史已完成/)).toHaveCount(0)
 await expect(page.getByTestId('node-card')).toHaveCount(0)
 expect(new Set(ids).size).toBe(16)
})
