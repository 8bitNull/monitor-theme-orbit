import {test,expect} from '@playwright/test'
import {openHarness} from './page'
test('source harness mounts React and receives events',async({page})=>{
 await openHarness(page,`
  import React from '/node_modules/.vite/deps/react.js';
  import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
  const {createRoot}=ReactDOM;
  function Probe(){const [count,setCount]=React.useState(0);
   return React.createElement('button',{onClick:()=>setCount(n=>n+1)},String(count));}
  createRoot(document.getElementById('root')).render(React.createElement(Probe));
 `)
 await page.getByRole('button',{name:'0',exact:true}).click()
 await expect(page.getByRole('button',{name:'1',exact:true})).toBeVisible()
})
