import { expect, it, vi } from 'vitest'
import { createHistoryClient } from '../../src/lib/history-client'
import type { MetricsHistory } from '../../src/lib/api'
const empty: MetricsHistory = { metrics: [], ping: [], probes: {} }
const q = { id: 1, hours: 24, points: 288, series: 'ping' as const }
const turn = () => new Promise(resolve => setTimeout(resolve, 0))
it('shares inflight queries and bounds all consumers to four loaders', async () => {
  const releases: (() => void)[] = []
  let running = 0, peak = 0
  const loader = vi.fn(async () => { running++; peak = Math.max(peak, running); await new Promise<void>(resolve => releases.push(resolve)); running--; return empty })
  const client = createHistoryClient(loader)
  const first = client.get(q)
  expect(client.get(q, true)).toBe(first)
  const batch = Array.from({length: 7}, (_, i) => client.get({...q, id: i + 2}))
  await turn(); expect(peak).toBe(4)
  while (running || releases.length) { releases.splice(0).forEach(release => release()); await turn() }
  await Promise.all([first, ...batch]); expect(loader).toHaveBeenCalledTimes(8); expect(peak).toBe(4)
})
it('keeps actual success timestamps on cache hits and force bypasses completed cache', async () => {
  let time = 100
  const loader = vi.fn(async () => empty), client = createHistoryClient(loader, () => time)
  await client.get(q); time = 59100; await client.get(q)
  expect(loader).toHaveBeenCalledTimes(1); expect(client.peekTimestamp(q)).toBe(100)
  await client.get(q, true); expect(loader).toHaveBeenCalledTimes(2)
  time = 120000; await client.get(q); expect(loader).toHaveBeenCalledTimes(3)
})
it('clear rejects queued and running readers even when a loader ignores abort', async () => {
  const releases: ((data: MetricsHistory) => void)[] = []
  const loader = vi.fn(() => new Promise<MetricsHistory>(resolve => releases.push(resolve)))
  const client = createHistoryClient(loader)
  const old = Array.from({length: 6}, (_, i) => client.get({...q, id: i + 1}).catch(e => e.name))
  await turn(); client.clear()
  expect(await Promise.all(old)).toEqual(Array(6).fill('AbortError'))
  releases.splice(0).forEach(resolve => resolve(empty)); await turn()
  expect(client.peekTimestamp(q)).toBeNull(); expect(loader).toHaveBeenCalledTimes(4)
  const fresh = client.get(q); await turn(); releases.shift()!(empty); await fresh
  expect(loader).toHaveBeenCalledTimes(5)
})
it('temporary failures retain last successful cache and do not cache failures', async () => {
  const loader = vi.fn().mockResolvedValueOnce(empty).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(empty)
  const client = createHistoryClient(loader, () => 100)
  await client.get(q); await expect(client.get(q, true)).rejects.toThrow('offline')
  expect(client.peekTimestamp(q)).toBe(100)
  await client.get(q, true); expect(loader).toHaveBeenCalledTimes(3)
})
it('abort failures release queue slots and can be retried', async () => {
  const loader = vi.fn(async (query) => { if (query.id === 1) throw new DOMException('cancelled', 'AbortError'); return empty })
  const client = createHistoryClient(loader)
  const results = await Promise.allSettled(Array.from({length: 6}, (_, i) => client.get({...q, id: i+1})))
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(5)
  expect(client.peekTimestamp(q)).toBeNull()
  await expect(client.get(q)).rejects.toMatchObject({name: 'AbortError'})
  expect(loader).toHaveBeenCalledTimes(7)
})

it('keeps an atomic data/timestamp snapshot when another consumer refreshes the cache', async () => {
  let now = 100
  const client = createHistoryClient(async () => ({ metrics: [], ping: [], probes: { '1': String(now) } }), () => now)
  const q = { id: 1, hours: 1, points: 60, series: 'ping' as const }
  const first = await client.getSnapshot(q)
  now = 200
  await client.get(q, true)
  expect(first.ts).toBe(100)
  expect(first.data.probes['1']).toBe('100')
  expect(client.peekTimestamp(q)).toBe(200)
})
