import {test,expect} from '@playwright/test'
test('first four histories render while the last twelve remain pending',async({page})=>{
 let release!:()=>void;const gate=new Promise<void>(r=>release=r)
 const seen:number[]=[]
 await page.route('**/api/nodes/*/metrics?*',async route=>{const id=Number(new URL(route.request().url()).pathname.split('/')[3]);seen.push(id);if(id>4)await gate;await route.fulfill({json:{metrics:[],probes:{1:'Synthetic'},ping:[{task_id:1,ts:120,latency:42,loss:0}]}})})
 try{await page.goto('/');for(let i=0;i<4;i++)await expect(page.getByTestId('node-card').nth(i).getByRole('img',{name:/延迟最近 1 个/})).toBeVisible();await expect(page.getByText('历史已完成 4/16',{exact:true})).toBeVisible();expect(new Set(seen).size).toBe(8);release();await expect(page.getByText(/历史已完成/)).toHaveCount(0);expect(new Set(seen).size).toBe(16)}finally{release()}
})
for(const width of [360,390,430])for(const mode of ['light','dark'])for(const layout of ['经典卡片','探索视图'])test(`network pending/error geometry ${width} ${mode} ${layout}`,async({page})=>{
 await page.setViewportSize({width,height:844});await page.addInitScript(mode=>localStorage.setItem('theme',mode),mode)
 let release!:()=>void;const gate=new Promise<void>(r=>release=r)
 await page.route('**/api/nodes/*/metrics?*',async route=>{await gate;await route.fulfill({status:503,body:'Synthetic failure'})})
 try{await page.goto('/network-quality');await page.locator('summary').filter({hasText:'更多筛选'}).click();await page.getByRole('button').filter({hasText:layout}).click();await expect(page.getByText('历史仍在加载，统计暂不完整',{exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);release();await expect(page.getByText('部分历史获取失败',{exact:false})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)}finally{release()}
})
