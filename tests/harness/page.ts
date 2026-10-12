import type {Page} from '@playwright/test'
export async function openHarness(page:Page,moduleSource:string) {
 // Vite may give each optimized dependency its own browser hash. Use the
 // imports emitted for the actual entry, rather than assigning React's hash
 // to react-dom/client (which Vite can reject as an outdated dependency).
 const response = await page.request.get('/src/main.tsx')
 if (!response.ok()) throw new Error('Vite entry transform is not ready')
 const entry = await response.text()
 const versions = new Map([...entry.matchAll(/(\/node_modules\/\.vite\/deps\/[^'"?]+\.js)\?v=([a-zA-Z0-9]+)/g)].map(match => [match[1],match[2]]))
 moduleSource = moduleSource.replace(/(\/node_modules\/\.vite\/deps\/[^'"?]+\.js)(?=['"])/g, path => {
  const version = versions.get(path)
  if (!version) throw new Error(`Vite dependency version is missing: ${path}`)
  return `${path}?v=${version}`
 })
 await page.route('**/__test__/probe.js',route=>route.fulfill({contentType:'text/javascript',body:moduleSource}))
 await page.route('**/__test__/harness',route=>route.fulfill({
  contentType:'text/html',body:`<!doctype html><div id="root"></div><script type="module">
   const {default:runtime}=await import('/@react-refresh');
   runtime.injectIntoGlobalHook(window);
   window.$RefreshReg$=()=>{};
   window.$RefreshSig$=()=>type=>type;
   window.__vite_plugin_react_preamble_installed__=true;
   await import('/__test__/probe.js');
  </script>`
 }))
 await page.goto('/__test__/harness')
}
