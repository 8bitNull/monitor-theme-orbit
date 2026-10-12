import { expect, it } from 'vitest'
import { stripAdminFields } from '../../src/lib/auth-session'
import type { Node } from '../../src/lib/api'
it('removes every administrator field without changing public metrics or the source', () => {
  const secret = { ip: '203.0.113.1', ipv4: '203.0.113.1', ipv6: '2001:db8::1', addresses: [], hostname: 'synthetic-host', remark: 'synthetic-note', interval: 5, country_pin: 'US', country_auto: 'US' }
  const original = { id: 1, name: 'Public', public: true, metrics: null, ...secret } as unknown as Node
  const safe = stripAdminFields(original)
  expect(safe).toEqual({ id: 1, name: 'Public', public: true, metrics: null })
  for (const key of Object.keys(secret)) expect(original).toHaveProperty(key)
})
