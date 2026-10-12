import {test,expect} from '@playwright/test'
test('ordinary links and back retain the document',async({page})=>{
 let documents=0
 page.on('request',r=>{if(r.isNavigationRequest()&&r.resourceType()==='document')documents++})
 await page.goto('/')
 await expect(page.locator('a[href^="/stats/"]').first()).toBeVisible()
 await page.evaluate(()=>{(window as any).sameDocument=true})
 await page.locator('a[href^="/stats/"]').first().click()
 await expect(page.getByRole('tab',{name:'概况',exact:true})).toBeVisible()
 expect(documents).toBe(1)
 expect(await page.evaluate(()=>(window as any).sameDocument)).toBe(true)
 await page.goBack()
 await expect(page.locator('a[href^="/stats/"]').first()).toBeVisible()
 expect(documents).toBe(1)
})
test('safe shell exists before delayed entry executes and disappears on takeover',async({page})=>{
 let release!:()=>void
 const gate=new Promise<void>(r=>release=r)
 await page.route('**/assets/index-*.js',async route=>{await gate;await route.continue()})
 try {
 await page.goto('/',{waitUntil:'commit'})
 await expect(page.getByTestId('boot-skeleton')).toBeVisible()
 await expect(page.locator('#root')).toBeEmpty()
 await page.waitForTimeout(2000)
 await expect(page.getByTestId('boot-skeleton')).toBeVisible()
 await expect(page.getByTestId('node-card')).toHaveCount(0)
 release()
 await expect(page.getByTestId('boot-skeleton')).toHaveCount(0)
 await expect(page.locator('main')).toHaveCount(1)
 } finally {release()}
})
for(const result of ['visitor','401'])test(`path change immediately clears old administrator owner before pending ${result} review`,async({page})=>{
 let admin=true, release!:()=>void, calls=0,closed=0
 const sockets:import('@playwright/test').WebSocketRoute[]=[]
 let frame:any
 await page.routeWebSocket('**/api/ws',socket=>{sockets.push(socket);socket.onClose(()=>closed++)})
 await page.route('**/api/me',async route=>{
 calls++; if(!admin)await new Promise<void>(r=>release=r)
 await route.fulfill(!admin&&result==='401'?{status:401}:{json:{authed:admin,public_page:true}})
 })
 await page.route('**/api/nodes',async route=>{
 const data=await(await route.fetch()).json()
 data.nodes=data.nodes.map((n:object,i:number)=>({...n,public:i!==0,addresses:[{address:'203.0.113.77',source:'manual'}]}))
 frame={...data,admin:true};await route.fulfill({json:data})
 })
 await page.goto('/stats/1/?tab=ip')
 await expect(page.getByText('203.0.113.77',{exact:true})).toBeVisible()
 await expect.poll(()=>sockets.length).toBeGreaterThan(0)
 await page.evaluate(()=>{
 const push=history.pushState.bind(history)
 history.pushState=(...args)=>{(window as any).privateAtPush=document.body.innerText.includes('203.0.113.77');push(...args)}
 })
 admin=false
 await page.getByRole('link',{name:'返回首页',exact:true}).click()
 await expect(page.getByText('正在确认身份…')).toBeVisible()
 expect(await page.evaluate(()=>(window as any).privateAtPush)).toBe(false)
 await expect.poll(()=>closed).toBe(1)
 await expect(page.getByText('203.0.113.77',{exact:true})).toHaveCount(0)
 await expect(page.getByTestId('node-card')).toHaveCount(0)
 try{sockets[0].send(JSON.stringify(frame))}catch{}
 await expect(page.getByTestId('node-card')).toHaveCount(0)
 await expect.poll(()=>!!release).toBe(true);release()
 if(result==='visitor')await expect(page.locator('a[href="/stats/2/"]').first()).toBeVisible()
 else await expect(page.getByText('身份状态暂时无法确认')).toBeVisible()
 await expect(page.locator('a[href="/stats/1/"]')).toHaveCount(0)
 expect(calls).toBe(2)
})
test('query survives same-document return but is never persisted across reload',async({page})=>{
 await page.goto('/network-quality')
 const search=page.getByPlaceholder('搜索节点名称')
 await search.fill('Demo 北京')
 await page.getByRole('link',{name:'首页',exact:true}).click()
 await expect(page.getByTestId('node-card').first()).toBeVisible()
 await page.getByRole('link',{name:'网络质量',exact:true}).click()
 await expect(search).toHaveValue('Demo 北京')
 expect(await page.evaluate(()=>JSON.stringify({...sessionStorage,...localStorage}))).not.toContain('Demo 北京')
 expect(page.url()).not.toContain('Demo')
 await page.reload();await expect(search).toHaveValue('')
})
test('params do not review identity; stats ids, back and forward do',async({page})=>{
 let calls=0
 await page.route('**/api/me',route=>{calls++;return route.fulfill({json:{authed:false,public_page:true}})})
 await page.goto('/stats/1/?tab=quality&hours=24')
 await expect(page.getByRole('button',{name:'24h',exact:true})).toHaveAttribute('aria-pressed','true')
 await page.getByRole('button',{name:'1h',exact:true}).click()
 await expect(page).toHaveURL(/hours=1/);expect(calls).toBe(1)
 await page.evaluate(()=>{const a=document.createElement('a');a.href='/stats/2/?tab=ip';document.getElementById('root')!.append(a);a.click();a.remove()})
 await expect(page.getByText('公开视图',{exact:false})).toBeVisible();expect(calls).toBe(2)
 await page.goBack()
 await expect(page.getByRole('button',{name:'1h',exact:true})).toHaveAttribute('aria-pressed','true');expect(calls).toBe(3)
 await page.goForward()
 await expect(page.getByText('公开视图',{exact:false})).toBeVisible();expect(calls).toBe(4)
 const length=await page.evaluate(()=>history.length)
 await page.evaluate(()=>{const a=document.createElement('a');a.href=location.href;document.getElementById('root')!.append(a);a.click();a.remove()})
 expect(await page.evaluate(()=>history.length)).toBe(length);expect(calls).toBe(4)
})
test('rapid paths share pending identity and final route wins delayed module',async({page})=>{
 let calls=0,releaseMe!:()=>void,releaseModule!:()=>void,moduleStarted=false
 const moduleGate=new Promise<void>(r=>releaseModule=r)
 await page.route('**/assets/NetworkQualityPage-*.js',async route=>{moduleStarted=true;await moduleGate;await route.continue()})
 await page.route('**/api/me',async route=>{calls++;if(calls>1)await new Promise<void>(r=>releaseMe=r);await route.fulfill({json:{authed:false,public_page:true}})})
 await page.goto('/')
 await expect(page.getByTestId('node-card').first()).toBeVisible()
 await page.getByRole('link',{name:'网络质量',exact:true}).click()
 await expect.poll(()=>!!releaseMe).toBe(true);releaseMe()
 await expect.poll(()=>moduleStarted).toBe(true)
 await page.evaluate(()=>{const a=document.createElement('a');a.href='/stats/2/?tab=ip';document.getElementById('root')!.append(a);a.click();a.remove()})
 await expect.poll(()=>calls).toBe(3)
 await page.evaluate(()=>{const a=document.createElement('a');a.href='/stats/3/?tab=ip';document.getElementById('root')!.append(a);a.click();a.remove()})
 expect(calls).toBe(3);releaseMe()
 await expect(page.getByText('公开视图',{exact:false})).toBeVisible()
 releaseModule()
 await expect(page).toHaveURL(/\/stats\/3/)
 await expect(page.getByRole('heading',{name:'网络质量监控'})).toHaveCount(0)
})
for(const chunk of ['DetailPage','IpInfo'])test(`failed ${chunk} import offers a real reload retry`,async({page})=>{
 let attempts=0,documents=0
 page.on('request',r=>{if(r.isNavigationRequest()&&r.resourceType()==='document')documents++})
 await page.route(`**/assets/${chunk}-*.js`,route=>{attempts++;return attempts===1?route.abort():route.continue()})
 await page.goto('/stats/1/?tab=ip')
 const retry=page.getByRole('button',{name:'重新加载',exact:true})
 await expect(retry).toBeVisible()
 await expect(page.getByText('公开视图',{exact:false})).toHaveCount(0)
 const box=await retry.boundingBox();expect(box!.height).toBeGreaterThanOrEqual(44);expect(box!.width).toBeGreaterThanOrEqual(44)
 await retry.click()
 await expect(page.getByText('公开视图',{exact:false})).toBeVisible()
 expect(attempts).toBeGreaterThanOrEqual(2);expect(documents).toBe(2)
})
test('native exceptions remain uncancelled and backend link requests a document',async({page})=>{
 await page.goto('/');await expect(page.getByTestId('node-card').first()).toBeVisible()
 const results=await page.evaluate(()=>{
 const root=document.getElementById('root')!
 const cases=[{href:'/stats/1',ctrlKey:true},{href:'/stats/1',metaKey:true},{href:'/stats/1',shiftKey:true},{href:'/stats/1',altKey:true},{href:'/stats/1',button:1},{href:'/stats/1',target:'_blank'},{href:'/stats/1',download:''},{href:'https://example.org/'},{href:'/admin/'},{href:'/other'},{href:'/#section'}]
 return cases.map(item=>{
 const a=document.createElement('a');a.href=item.href;if('target'in item)a.target=item.target!;if('download'in item)a.download='';root.append(a)
 let prevented=false
 const observe=(e:MouseEvent)=>{prevented=e.defaultPrevented;e.preventDefault()}
 document.addEventListener('click',observe,{once:true})
 a.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,button:0,...item}));a.remove();return prevented
 })
 })
 expect(results).toEqual(Array(11).fill(false))
 let documents=0
 page.on('request',r=>{if(r.isNavigationRequest()&&r.resourceType()==='document')documents++})
 await page.getByRole('link',{name:'登录',exact:true}).click()
 await expect.poll(()=>documents).toBe(1)
 await expect(page).toHaveURL(/\/admin\//)
})
test('no JavaScript shell explains its limitation without claiming live updates',async({browser})=>{
 const context=await browser.newContext({javaScriptEnabled:false})
 const page=await context.newPage()
 await page.goto('http://127.0.0.1:8791/')
 await expect(page.getByTestId('boot-skeleton')).toBeVisible()
 await expect(page.locator('noscript p')).toBeVisible()
 await expect(page.locator('noscript p')).toHaveText('请启用 JavaScript 以查看状态数据。')
 await expect(page.getByTestId('node-card')).toHaveCount(0)
 await context.close()
})
test('lazy destination main receives focus after replacing its safe fallback',async({page})=>{
 await page.route('**/assets/NetworkQualityPage-*.js',async route=>{await new Promise(r=>setTimeout(r,500));await route.continue()})
 await page.goto('/');await expect(page.getByTestId('node-card').first()).toBeVisible()
 await page.getByRole('link',{name:'网络质量',exact:true}).click()
 await expect(page.getByRole('heading',{name:'网络质量监控'})).toBeVisible()
 await expect(page.locator('main')).toBeFocused()
 await expect(page.locator('main')).toHaveAttribute('tabindex','-1')
})
test('public navigation reuses compatible home history without refetching',async({page})=>{
 let count=0
 await page.route('**/api/nodes/*/metrics?*',route=>{count++;return route.fulfill({json:{ping:[],probes:{},metrics:[]}})})
 await page.goto('/')
 await expect(page.getByTestId('node-card').first()).toBeVisible()
 await expect.poll(()=>count).toBe(16)
 await expect(page.getByText(/历史已完成/)).toHaveCount(0)
 const before=count
 expect(before).toBe(16)
 await page.getByRole('link',{name:'网络质量',exact:true}).click()
 await expect(page.getByRole('heading',{name:'网络质量监控',exact:true})).toBeVisible()
 expect(count).toBe(before)
 await page.goBack()
 await expect(page.getByTestId('node-card').first()).toBeVisible()
 expect(count).toBe(before)
})
test('reordered unchanged parameters do not add a history entry',async({page})=>{
 await page.goto('/stats/1/?tab=ip&hours=24')
 await expect(page.getByText('公开视图',{exact:false})).toBeVisible()
 const before=await page.evaluate(()=>history.length)
 await page.evaluate(()=>{const a=document.createElement('a');a.href='/stats/1/?hours=24&tab=ip';document.getElementById('root')!.append(a);a.click();a.remove()})
 expect(await page.evaluate(()=>history.length)).toBe(before)
})
test('401 identity checking unmounts a failed boundary and leaves one safe main',async({page})=>{
 let hold=false,release!:()=>void
 await page.route('**/api/me',async route=>{if(hold)await new Promise<void>(r=>release=r);await route.fulfill({json:{authed:true,public_page:true}})})
 await page.route('**/assets/DetailPage-*.js',route=>route.abort())
 await page.goto('/stats/1/?tab=ip')
 await expect(page.getByRole('button',{name:'重新加载',exact:true})).toBeVisible()
 hold=true
 await page.evaluate(()=>dispatchEvent(new Event('dstatus-auth-invalidated')))
 try {
 await expect(page.getByText('正在确认身份…')).toBeVisible()
 await expect(page.locator('main')).toHaveCount(1)
 await expect(page.getByRole('button',{name:'重新加载',exact:true})).toHaveCount(0)
 } finally {release?.()}
})
