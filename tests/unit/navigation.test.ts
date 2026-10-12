import {it,expect} from 'vitest'
import {matchThemeRoute,shouldHandleLink} from '../../src/lib/navigation'
it('handles only exact theme paths',()=>{
 expect(matchThemeRoute('/')).toEqual({page:'home',id:null})
 expect(matchThemeRoute('/network-quality/')).toEqual({page:'quality',id:null})
 expect(matchThemeRoute('/stats/12/')).toEqual({page:'stats',id:12})
 expect(matchThemeRoute('/node/12')).toEqual({page:'stats',id:12})
 for(const path of ['/admin/','/stats/x','/stats/1/admin','/network-quality-admin','/other','/stats/9007199254740992']) expect(matchThemeRoute(path)).toBeNull()
})
const origin='https://example.test'
const anchor=(href:string,attrs:Record<string,string>={})=>({href:new URL(href,origin).href,target:attrs.target??'',hasAttribute:(key:string)=>key in attrs}) as HTMLAnchorElement
const event=(attrs:object={})=>({button:0,defaultPrevented:false,...attrs}) as MouseEvent
it('preserves native modified, download, target and external links',()=>{
 for(const attrs of [{ctrlKey:true},{metaKey:true},{shiftKey:true},{altKey:true},{button:1},{defaultPrevented:true}]) expect(shouldHandleLink(event(attrs),anchor('/stats/1'),origin)).toBe(false)
 for(const a of [anchor('/stats/1',{download:''}),anchor('/stats/1',{target:'_blank'}),anchor('https://elsewhere.test/'),anchor('/admin/')]) expect(shouldHandleLink(event(),a,origin)).toBe(false)
 expect(shouldHandleLink(event(),anchor('/stats/1?tab=quality&hours=24#chart',{target:'_self'}),origin)).toBe(true)
})
it('leaves same-page fragments native but accepts cross-path fragments',()=>{
 const prior=Object.getOwnPropertyDescriptor(globalThis,'location')
 Object.defineProperty(globalThis,'location',{configurable:true,value:{href:'https://example.test/stats/1?tab=quality',pathname:'/stats/1',search:'?tab=quality'}})
 try {
 expect(shouldHandleLink(event(),anchor('/stats/1?tab=quality#chart'),origin)).toBe(false)
 expect(shouldHandleLink(event(),anchor('/stats/1?tab=quality#'),origin)).toBe(false)
 expect(shouldHandleLink(event(),anchor('/stats/2?tab=quality#chart'),origin)).toBe(true)
 Object.defineProperty(globalThis,'location',{configurable:true,value:new URL(origin+'/stats/1?tab=quality&hours=24')})
 expect(shouldHandleLink(event(),anchor('/stats/1?hours=24&tab=quality#chart'),origin)).toBe(true)
 } finally {if(prior)Object.defineProperty(globalThis,'location',prior);else Reflect.deleteProperty(globalThis,'location')}
})
