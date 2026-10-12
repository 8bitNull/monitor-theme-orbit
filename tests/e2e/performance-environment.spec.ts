import {test,expect} from '@playwright/test'
test('synthetic server can gzip and mark API no-store',async({request})=>{
 const res=await request.get('/api/nodes',{headers:{'accept-encoding':'gzip'}})
 expect(res.headers()['cache-control']).toBe('no-store')
 expect((await res.json()).nodes).toHaveLength(16)
})
