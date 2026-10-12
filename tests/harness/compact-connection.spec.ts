import {test,expect} from '@playwright/test'
import {openHarness} from './page'

test('healthy connection has no banner or periodic render; failures remain recoverable',async({page})=>{
 await page.clock.install()
 await page.route('**/src/components/ConnectionStatus.tsx*',async route=>{
  const res=await route.fetch();let body=await res.text()
  const pattern=/function ConnectionStatus\([^]*?\) \{/
  expect(body).toMatch(pattern)
  body=body.replace(pattern,h=>h+'\nwindow.statusRenders=(window.statusRenders??0)+1;')
  await route.fulfill({response:res,body})
 })
 await openHarness(page,`
 import React from '/node_modules/.vite/deps/react.js';import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
 import {ConnectionStatus} from '/src/components/ConnectionStatus.tsx';
 function Probe(){const [state,setState]=React.useState({transport:'websocket',lastSuccessAt:Date.now(),stale:false});window.changeConnection=setState;return React.createElement(ConnectionStatus,{...state,onRetry:()=>window.retries=(window.retries??0)+1})}
 ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Probe));`)
 await expect.poll(()=>page.evaluate(()=>(window as any).statusRenders)).toBeGreaterThan(0)
 await expect(page.locator('.connection-status')).toHaveCount(0)
 const before=await page.evaluate(()=>(window as any).statusRenders)
 await page.clock.runFor(5000)
 expect(await page.evaluate(()=>(window as any).statusRenders)).toBe(before)
 for(const transport of ['polling','disconnected']) {
  await page.evaluate(transport=>(window as any).changeConnection({transport,lastSuccessAt:Date.now(),stale:false}),transport)
  await expect(page.getByRole('status')).toContainText(transport==='polling'?'轮询':'中断')
  await page.getByRole('button',{name:'重新连接',exact:true}).click()
 }
 expect(await page.evaluate(()=>(window as any).retries)).toBe(2)
 await page.evaluate(()=>(window as any).changeConnection({transport:'websocket',lastSuccessAt:Date.now()-16000,stale:true}))
 await expect(page.getByRole('status')).toHaveText('数据已过期')
 await expect(page.getByText('当前显示最近一次成功数据')).toBeVisible()
 await page.evaluate(()=>(window as any).changeConnection({transport:'websocket',lastSuccessAt:Date.now(),stale:false}))
 await expect(page.locator('.connection-status')).toHaveCount(0)
})
