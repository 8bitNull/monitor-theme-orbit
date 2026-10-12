import {test,expect} from '@playwright/test'

// Delaying the actual entry isolates the startup dependency: identity must not
// wait for React, while nodes and realtime still wait for verified identity.
test('identity starts before entry execution and is handed off once; reviews fetch fresh identity',async({page})=>{
 let releaseEntry:(()=>void)|undefined,releaseIdentity:(()=>void)|undefined
 let meCalls=0,nodeCalls=0,sockets=0,admin=false
 await page.route('**/assets/index-*.js',async route=>{
  await new Promise<void>(r=>{releaseEntry=r});await route.continue()
 })
 await page.route('**/api/me',async route=>{
  meCalls++
  if(meCalls===1)await new Promise<void>(r=>{releaseIdentity=r})
  await route.fulfill({json:{authed:admin,public_page:true,site_name:'DStatus',github:false}})
 })
 await page.route('**/api/nodes',async route=>{nodeCalls++;await route.continue()})
 await page.routeWebSocket('**/api/ws',()=>{sockets++})
 await page.goto('/',{waitUntil:'commit'})
 await expect.poll(()=>!!releaseEntry).toBe(true)
 await expect.poll(()=>meCalls,{timeout:3000}).toBe(1)
 expect(nodeCalls).toBe(0);expect(sockets).toBe(0)
 releaseEntry!()
 await expect(page.getByText('正在确认身份…')).toBeVisible()
 expect(nodeCalls).toBe(0);expect(sockets).toBe(0)
 releaseIdentity!()
 await expect(page.locator('[data-testid="node-card"]').first()).toBeVisible()
 expect(meCalls).toBe(1)
 admin=true
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
 await expect.poll(()=>meCalls).toBe(2)
 await expect(page.getByRole('link',{name:'后台',exact:true})).toBeVisible()
 expect(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}))).not.toContain('"authed"')
})

test('failed early identity blocks data until explicit retry succeeds',async({page})=>{
 let failure=true,nodes=0,sockets=0,identities=0
 await page.route('**/api/me',route=>{identities++;return route.fulfill(failure?{status:503}:{json:{authed:false,public_page:true,site_name:'DStatus',github:false}})})
 await page.route('**/api/nodes',route=>{nodes++;return route.continue()})
 await page.routeWebSocket('**/api/ws',()=>{sockets++})
 await page.goto('/')
 await expect(page.getByText('身份状态暂时无法确认')).toBeVisible()
 expect(nodes).toBe(0);expect(sockets).toBe(0);expect(identities).toBe(1)
 failure=false
 await page.getByRole('button',{name:'重试',exact:true}).click()
 await expect(page.locator('[data-testid="node-card"]').first()).toBeVisible()
 expect(identities).toBe(2)
})

test('public page disabled does not start nodes or realtime',async({page})=>{
 let nodes=0,sockets=0
 await page.route('**/api/me',route=>route.fulfill({json:{authed:false,public_page:false,site_name:'DStatus',github:false}}))
 await page.route('**/api/nodes',route=>{nodes++;return route.continue()})
 await page.routeWebSocket('**/api/ws',()=>{sockets++})
 await page.route('**/admin/',route=>route.fulfill({contentType:'text/html',body:'<h1>Login</h1>'}))
 await page.goto('/')
 await expect(page).toHaveURL(/\/admin\/$/)
 expect(nodes).toBe(0);expect(sockets).toBe(0)
})

test('stalled entry discards expired initial administrator identity',async({page})=>{
 let releaseEntry:(()=>void)|undefined,admin=true,calls=0
 await page.route('**/assets/index-*.js',async route=>{await new Promise<void>(r=>{releaseEntry=r});await route.continue()})
 await page.route('**/api/me',route=>{calls++;return route.fulfill({json:{authed:admin,public_page:true,site_name:'DStatus',github:false}})})
 await page.routeWebSocket('**/api/ws',()=>{})
 await page.goto('/',{waitUntil:'commit'})
 await expect.poll(()=>calls).toBe(1)
 await page.evaluate(()=>{(window as any).__dstatusIdentity.startedAt-=11000})
 admin=false;releaseEntry!()
 await expect(page.locator('[data-testid="node-card"]').first()).toBeVisible()
 await expect(page.getByRole('link',{name:'登录',exact:true})).toBeVisible()
 expect(calls).toBe(2)
})

test('pagehide after handoff cancels pending identity and cannot start data',async({page})=>{
 let release:(()=>void)|undefined,identities=0,nodes=0,sockets=0
 await page.route('**/api/me',async route=>{
  identities++
  if(identities===1)await new Promise<void>(r=>{release=r})
  await route.fulfill({json:{authed:false,public_page:true,site_name:'DStatus',github:false}}).catch(()=>{})
 })
 await page.route('**/api/nodes',route=>{nodes++;return route.continue()})
 await page.routeWebSocket('**/api/ws',()=>{sockets++})
 await page.goto('/')
 await expect(page.getByText('正在确认身份…')).toBeVisible()
 await expect.poll(()=>!!release).toBe(true)
 await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')))
 release!()
 await expect(page.getByText('身份状态暂时无法确认')).toBeVisible()
 expect(nodes).toBe(0);expect(sockets).toBe(0)
 await page.getByRole('button',{name:'重试',exact:true}).click()
 await expect(page.locator('[data-testid="node-card"]').first()).toBeVisible()
 expect(identities).toBe(2)
})
