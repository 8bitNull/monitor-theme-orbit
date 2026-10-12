import {afterEach,expect,it,vi} from 'vitest'
import {fetchIdentity} from '../../src/lib/initial-identity'
const identity={authed:false,public_page:true,site_name:'Test',github:false}
function install(response:Promise<Response|null>,age=0) {
 const controller=new AbortController()
 const win=new EventTarget() as EventTarget & {__dstatusIdentity?:unknown}
 win.__dstatusIdentity={request:response,controller,startedAt:performance.now()-age,abandon:()=>controller.abort()}
 vi.stubGlobal('window',win)
 return controller
}
afterEach(()=>vi.unstubAllGlobals())

it('uses early response once; subsequent review observes changed identity',async()=>{
 install(Promise.resolve(Response.json(identity)))
 vi.stubGlobal('fetch',async()=>Response.json({...identity,authed:true}))
 expect(await fetchIdentity(new AbortController().signal)).toEqual(identity)
 expect(await fetchIdentity(new AbortController().signal)).toEqual({...identity,authed:true})
 expect((window as Window).__dstatusIdentity).toBeUndefined()
})
it('stalled startup discards old administrator response and confirms visitor identity',async()=>{
 const controller=install(Promise.resolve(Response.json({...identity,authed:true})),11000)
 vi.stubGlobal('fetch',async()=>Response.json(identity))
 expect(await fetchIdentity(new AbortController().signal)).toEqual(identity)
 expect(controller.signal.aborted).toBe(true)
})
it('discarded request cannot establish identity after consumer cancellation',async()=>{
 const early=install(Promise.resolve(Response.json({...identity,authed:true})))
 const consumer=new AbortController();consumer.abort()
 await expect(fetchIdentity(consumer.signal)).rejects.toMatchObject({name:'AbortError'})
 expect(early.signal.aborted).toBe(true)
})
it.each([401,503])('early HTTP %s preserves API error status instead of accepting identity',async status=>{
 install(Promise.resolve(new Response('',{status})))
 await expect(fetchIdentity(new AbortController().signal)).rejects.toMatchObject({status})
})
it('network failure has normal recoverable API error',async()=>{
 install(Promise.resolve(null))
 await expect(fetchIdentity(new AbortController().signal)).rejects.toMatchObject({status:0})
})
it('invalid early JSON cannot establish identity',async()=>{
 install(Promise.resolve(new Response('<html>proxy</html>')))
 await expect(fetchIdentity(new AbortController().signal)).rejects.toMatchObject({status:200})
})

it('pagehide during response decoding prevents abandoned identity from being returned',async()=>{
 let finish!:(value:typeof identity)=>void
 const response=Response.json(identity)
 vi.spyOn(response,'json').mockImplementation(()=>new Promise(r=>{finish=r}))
 const controller=install(Promise.resolve(response))
 const win=window as unknown as EventTarget & {__dstatusIdentity:{abandon:()=>void}}
 win.addEventListener('pagehide',win.__dstatusIdentity.abandon,{once:true})
 const pending=fetchIdentity(new AbortController().signal)
 await vi.waitFor(()=>expect(finish).toBeDefined())
 win.dispatchEvent(new Event('pagehide'));finish(identity)
 await expect(pending).rejects.toMatchObject({name:'AbortError'})
 expect(controller.signal.aborted).toBe(true)
})
