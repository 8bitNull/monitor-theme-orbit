import {test,expect} from '@playwright/test'
const history={metrics:[],probes:{1:'Synthetic'},ping:[{task_id:1,ts:120,latency:42,loss:0}]}
for(const empty of [false,true]) for(const mode of ['card','mobile-list','desktop-row']) test(`${mode} ${empty?'empty':'sampled'} loading and refresh retain stable geometry and values`,async({page})=>{
 await page.clock.install()
 await page.setViewportSize({width:mode==='desktop-row'?1440:390,height:900})
 if(mode!=='card')await page.addInitScript(()=>sessionStorage.setItem('dstatus-dashboard-v1',JSON.stringify({v:1,view:'list'})))
 let release!:()=>void;let gate=new Promise<void>(r=>release=r)
 await page.route('**/api/nodes/*/metrics?*',async route=>{await gate;await route.fulfill({json:empty?{metrics:[],probes:{},ping:[]}:history})})
 try{
 await page.goto('/')
 const node=page.locator('[data-node-id="1"]:visible').first()
 await expect(node).toBeVisible()
 await expect(node.getByRole('status',{name:'正在加载历史…'})).toBeVisible()
 const pending=await node.boundingBox()
 release()
 await expect(page.getByText(/历史已完成/)).toHaveCount(0)
 if(!empty)await expect(node).toContainText('42')
 const loaded=await node.boundingBox();expect(loaded!.height).toBe(pending!.height)
 gate=new Promise<void>(r=>release=r)
 await page.clock.fastForward(61000)
 await expect(node.getByRole('status',{name:'正在刷新历史…'})).toBeVisible()
 if(!empty)await expect(node).toContainText('42')
 expect((await node.boundingBox())!.height).toBe(loaded!.height)
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 }finally{release()}
})
