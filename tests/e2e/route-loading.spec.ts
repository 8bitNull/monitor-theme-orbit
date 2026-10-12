import {test, expect} from '@playwright/test'
import {installFixture} from './fixtures'

test('direct overview downloads its tab while identity and detail shell are pending',async({page})=>{
 await installFixture(page)
 let release!:()=>void
 const gate=new Promise<void>(r=>release=r)
 const assets:string[]=[]
 page.on('request',r=>{if(r.url().includes('/assets/'))assets.push(r.url())})
 await page.route('**/api/me',async route=>{await gate;await route.fulfill({json:{authed:false,public_page:true}})})
 await page.route('**/assets/DetailPage-*.js',async route=>{await gate;await route.continue()})
 try {
 await page.goto('/stats/1/',{waitUntil:'commit'})
 await expect.poll(()=>assets.some(a=>/DetailOverview-.*\.js/.test(a)),{timeout:3000}).toBe(true)
 await expect.poll(()=>assets.some(a=>/Echart-.*\.js/.test(a)),{timeout:3000}).toBe(true)
 await expect(page.getByText('正在确认身份…')).toBeVisible()
 } finally {release()}
 await expect(page.getByRole('tabpanel',{name:'概况',exact:true})).toBeVisible()
})

test('focus preloads quality code without navigation or data requests',async({page})=>{
 await installFixture(page)
 const assets:string[]=[], api:string[]=[]
 page.on('request',r=>{if(r.url().includes('/assets/'))assets.push(r.url());if(r.url().includes('/api/'))api.push(r.url())})
 await page.goto('/')
 await expect(page.getByTestId('node-card').first()).toBeVisible()
 expect(assets.some(a=>/NetworkQualityPage|DetailOverview|Echart|globe/.test(a))).toBe(false)
 // The four-slot history queue can still have pending work after networkidle.
 await expect(page.getByTestId('node-card')).toHaveCount(16)
 await expect.poll(()=>api.filter(url=>/\/api\/nodes\/\d+\/metrics\?/.test(url)).length).toBe(16)
 await page.waitForLoadState('networkidle')
 const initial=api.length
 await page.locator('a[href="/network-quality"]').first().focus()
 await expect.poll(()=>assets.some(a=>/NetworkQualityPage-.*\.js/.test(a)),{timeout:3000}).toBe(true)
 expect(new URL(page.url()).pathname).toBe('/')
 expect(api.length).toBe(initial)
 await expect(page.getByTestId('node-card').first()).toBeVisible()
})

test('direct IP route preloads only its selected tab before identity completes',async({page})=>{
 await installFixture(page)
 let release!:()=>void
 const gate=new Promise<void>(r=>release=r), assets:string[]=[]
 page.on('request',r=>{if(r.url().includes('/assets/'))assets.push(r.url())})
 await page.route('**/api/me',async route=>{await gate;await route.fulfill({json:{authed:false,public_page:true}})})
 try {
 await page.goto('/stats/1/?tab=ip',{waitUntil:'commit'})
 await expect.poll(()=>assets.some(a=>/IpInfo-.*\.js/.test(a)),{timeout:3000}).toBe(true)
 expect(assets.some(a=>/DetailOverview|Echart/.test(a))).toBe(false)
 }finally{release()}
 await expect(page.getByRole('tabpanel')).toBeVisible()
})

test('brief hover cancels but deliberate hover preloads only the target code',async({page})=>{
 await installFixture(page)
 const assets:string[]=[]
 page.on('request',r=>{if(r.url().includes('/assets/'))assets.push(r.url())})
 await page.goto('/')
 const link=page.locator('a[href="/network-quality"]').first()
 await expect(page.getByTestId('node-card').first()).toBeVisible()
 await link.evaluate(a=>{a.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));a.dispatchEvent(new MouseEvent('mouseout',{bubbles:true}))})
 await page.waitForTimeout(200)
 expect(assets.some(a=>/NetworkQualityPage/.test(a))).toBe(false)
 await link.dispatchEvent('mouseover')
 await expect.poll(()=>assets.some(a=>/NetworkQualityPage/.test(a))).toBe(true)
 expect(assets.some(a=>/DetailOverview|DetailPage|globe/.test(a))).toBe(false)
 expect(new URL(page.url()).pathname).toBe('/')
})

test('touch intent deduplicates target code and ignores native-only links',async({page})=>{
 await installFixture(page)
 const assets:string[]=[]
 page.on('request',r=>{if(r.url().includes('/assets/'))assets.push(r.url())})
 await page.goto('/')
 await expect(page.getByTestId('node-card').first()).toBeVisible()
 await page.evaluate(()=>{
  const root=document.getElementById('root')!
  for(const attrs of [{href:'/admin/'},{href:'https://example.com/network-quality'}, {href:'/network-quality',target:'_blank'}, {href:'/network-quality',download:''}]) {
   const a=document.createElement('a');Object.entries(attrs).forEach(([k,v])=>a.setAttribute(k,v));root.append(a)
   a.dispatchEvent(new FocusEvent('focusin',{bubbles:true}));a.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch'}));a.remove()
  }
 })
 await page.waitForTimeout(150)
 expect(assets.some(a=>/NetworkQualityPage/.test(a))).toBe(false)
 const link=page.locator('a[href="/network-quality"]').first()
 for(let i=0;i<3;i++)await link.dispatchEvent('pointerdown',{pointerType:'touch',button:0})
 await expect.poll(()=>assets.filter(a=>/NetworkQualityPage-.*\.js/.test(a)).length).toBe(1)
 expect(new URL(page.url()).pathname).toBe('/')
})

test('failed speculative import leaves home usable and actual entry offers reload',async({page})=>{
 await installFixture(page)
 let failed=false, documents=0
 page.on('request',r=>{if(r.isNavigationRequest()&&r.resourceType()==='document')documents++})
 await page.route('**/assets/NetworkQualityPage-*.js',async route=>{if(!failed){failed=true;await route.abort()}else await route.continue()})
 await page.goto('/')
 const link=page.locator('a[href="/network-quality"]').first()
 await expect(page.getByTestId('node-card').first()).toBeVisible()
 await link.focus()
 await expect.poll(()=>failed).toBe(true)
 await expect(page.getByRole('button',{name:'重新加载',exact:true})).toHaveCount(0)
 await expect(page.getByTestId('node-card').first()).toBeVisible()
 await link.click()
 await page.getByRole('button',{name:'重新加载',exact:true}).click()
 await expect(page.getByPlaceholder('搜索节点名称')).toBeVisible()
 expect(documents).toBe(2)
})
