import {test,expect} from '@playwright/test'
import {openHarness} from './page'

test('navigation cleanup cancels pending hover and removes all intent listeners',async({page})=>{
 await openHarness(page,`
  import {installNavigation} from '/src/lib/navigation.ts';
  history.replaceState(null,'','/');
  document.getElementById('root').innerHTML='<a href="/network-quality"><span>quality</span></a>';
  window.intents=[];
  window.dispose=installNavigation({beforePathChange(){},beforeLeaveHome(){},onRouteChange(){},onIntent(url){window.intents.push(url.pathname)}});
 `)
 const link=page.getByRole('link',{name:'quality'})
 await link.dispatchEvent('mouseover')
 await page.evaluate(()=>(window as any).dispose())
 await page.waitForTimeout(150)
 for(const event of ['mouseover','focusin','pointerdown'])await link.dispatchEvent(event)
 await page.waitForTimeout(150)
 expect(await page.evaluate(()=>(window as any).intents)).toEqual([])
})
