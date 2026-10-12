import { afterEach, expect, it, vi } from 'vitest'
import { api } from '../../src/lib/http'
afterEach(()=>vi.unstubAllGlobals())
it('preserves AbortError while receiving the response body', async () => {
 const aborted = new DOMException('cancelled','AbortError')
 vi.stubGlobal('fetch', async ()=>({ok:true,status:200,json:()=>Promise.reject(aborted)}))
 await expect(api('/synthetic')).rejects.toBe(aborted)
})
it('preserves AbortError before headers arrive', async () => {
 const aborted = new DOMException('cancelled','AbortError')
 vi.stubGlobal('fetch', async ()=>{throw aborted})
 await expect(api('/synthetic')).rejects.toBe(aborted)
})
