import {test,expect} from '@playwright/test'

for (const name of ['分组：全部','排序：默认排序，降序','主题','到期：全部节点']) {
 test(`${name} opens with keyboard and Escape restores focus`,async({page})=>{
  await page.goto('/')
  if(name==='到期：全部节点') await page.getByRole('button',{name:'更多筛选',exact:true}).click()
  const trigger=page.getByRole('button',{name,exact:true})
  await trigger.focus(); await page.keyboard.press('Enter')
  await expect(trigger).toHaveAttribute('aria-expanded','true')
  await page.keyboard.press('Tab')
  await expect(trigger).not.toBeFocused()
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await expect(trigger).toHaveAttribute('aria-expanded','false')
  await page.keyboard.press('Space')
  await expect(trigger).toHaveAttribute('aria-expanded','true')
 })
}
test('group selection restores focus and realtime switch works with Space',async({page})=>{
 await page.goto('/')
 const group=page.getByRole('button',{name:'分组：全部',exact:true})
 await group.focus(); await page.keyboard.press('Enter')
 const edge=page.getByRole('button',{name:'edge',exact:true})
 for(let step=0;step<10 && !await edge.evaluate(el=>el===document.activeElement);step++) await page.keyboard.press('Tab')
 await expect(edge).toBeFocused(); await page.keyboard.press('Enter')
 await expect(page.getByRole('button',{name:'分组：edge',exact:true})).toBeFocused()
 await page.getByRole('button',{name:'更多排序',exact:true}).click()
 const toggle=page.getByRole('switch',{name:'实时排序',exact:true})
 await toggle.focus(); await page.keyboard.press('Space')
 await expect(toggle).toHaveAttribute('aria-checked','true')
})
test('detail tabs name their panel and keyboard selection retains URL state',async({page})=>{
 await page.goto('/stats/1/?tab=quality&hours=6')
 const tab=page.getByRole('tab',{name:'归属地与节点信息',exact:true})
 await tab.focus(); await page.keyboard.press('Space')
 await expect(tab).toHaveAttribute('aria-selected','true')
 await expect(page).toHaveURL(/tab=ip&hours=6/)
 await expect(page.getByRole('tabpanel')).toHaveAttribute('id','detail-panel-ip')
 expect(await page.locator('[id]').evaluateAll(nodes=>new Set(nodes.map(n=>n.id)).size===nodes.length)).toBe(true)
})
for(const width of [360,390,430]) test(`touch targets at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:800}); await page.goto('/')
 await page.getByRole('textbox',{name:'搜索节点名称',exact:true}).fill('Demo')
 for(const name of ['主题','卡片视图','列表视图','清除名称：Demo']){
  const box=await page.getByRole('button',{name,exact:true}).boundingBox()
  expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44)
 }
 for(const name of ['分组：全部','排序：默认排序，降序','到期：全部节点','主题']){
  if(name==='到期：全部节点') await page.getByRole('button',{name:'更多筛选',exact:true}).click()
  const trigger=page.getByRole('button',{name,exact:true})
  await trigger.click()
  const choices=page.locator('.dropdown-panel').getByRole('button')
  expect(await choices.count()).toBeGreaterThan(0)
  for(const choice of await choices.all()){
   const box=await choice.boundingBox()
   expect(box!.width,await choice.getAttribute('aria-label') ?? await choice.innerText()).toBeGreaterThanOrEqual(44)
   expect(box!.height,await choice.getAttribute('aria-label') ?? await choice.innerText()).toBeGreaterThanOrEqual(44)
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.keyboard.press('Escape')
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})
test('charts explain their timeframe and latest values without color',async({page})=>{
 await page.goto('/stats/1/?tab=quality&hours=6')
 await expect(page.getByRole('img',{name:/网络延迟趋势，最近 6 小时/})).toBeVisible()
 await expect(page.getByRole('img',{name:/最近 6 小时探测，最新延迟.*窗口丢包率/}).first()).toBeVisible()
 await page.goto('/network-quality')
 await page.getByRole('button',{name:'6 小时',exact:true}).click()
 await expect(page.getByRole('img',{name:/延迟最近 \d+ 个时间桶，样本时间.*，最新/}).first()).toBeVisible()
 await page.goto('/stats/1/?tab=status&hours=6')
 await expect(page.getByRole('img',{name:/负载详情，最近 6 小时/})).toBeVisible()
})

test('mini chart labels match the last 24 timestamp buckets on home and selected ranges',async({page})=>{
 const start=1700000000
 const ping=Array.from({length:288},(_,i)=>({task_id:1,ts:start+i*60,latency:i,loss:i/10}))
 await page.route('**/api/nodes/*/metrics?*',route=>{
  const hours=Number(new URL(route.request().url()).searchParams.get('hours'))
  return route.fulfill({json:{metrics:[],probes:{1:'Synthetic target'},ping:ping.map(p=>({...p,ts:p.ts+hours*3600})),loss:{1:14.35}}})
 })
 const time=(hours:number,index:number)=>new Date((start+hours*3600+index*60)*1000).toISOString()
 const name=(hours:number)=>`延迟最近 24 个时间桶，样本时间 ${time(hours,264)} 至 ${time(hours,287)}，最新287ms`
 await page.goto('/')
 const home=page.getByRole('img',{name:name(24),exact:true}).first()
 await expect(home).toBeVisible()
 await expect(home.locator(':scope > div')).toHaveCount(24)
 expect(await home.locator(':scope > div').evaluateAll(cells=>cells.map(c=>c.getAttribute('title')))).toEqual(ping.slice(-24).map(p=>`${p.latency.toFixed(0)} ms`))
 await expect(page.getByRole('img',{name:`丢包率最近 24 个时间桶，样本时间 ${time(24,264)} 至 ${time(24,287)}，最新28.7%`,exact:true}).first()).toBeVisible()
 await page.goto('/network-quality')
 for(const [range,hours] of [['6 小时',6],['7 天',168]] as const){
  const rangeButton=page.getByRole('button',{name:range,exact:true})
  await rangeButton.click(); await expect(rangeButton).toHaveAttribute('aria-pressed','true')
  const chart=page.getByRole('img',{name:name(hours),exact:true}).first()
  await expect(chart).toBeVisible()
  expect(await chart.locator(':scope > div').evaluateAll(cells=>cells.map(c=>c.getAttribute('title')))).toEqual(ping.slice(-24).map(p=>`${p.latency.toFixed(0)} ms`))
 }
})
