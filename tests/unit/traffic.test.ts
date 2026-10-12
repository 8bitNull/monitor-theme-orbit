import { describe, expect, it } from 'vitest'
import { estimateTraffic, quota, sampleStep, toMbps } from '../../src/lib/traffic'
import type { MetricsPoint } from '../../src/lib/api'
const point = (ts: number, rx: number): MetricsPoint => ({ ts, net_rx: rx, net_tx: 250000, cpu: 20, mem_used: 1, disk_used: 1 })
describe('traffic contract', () => {
  it('uses bytes/sec and backend sampling step', () => {
    expect(toMbps(125000)).toBe(1)
    expect(sampleStep(6,180)).toBe(120)
    expect(sampleStep(24,24)).toBe(1440)
    expect(estimateTraffic([point(0,125000),point(120,125000)],120)).toEqual([{start:0,end:120,rx:15000000,tx:30000000}])
  })
  it('keeps gaps null and never extrapolates the tail', () => {
    expect(estimateTraffic([point(0,1),point(120,2),point(600,3)],120)[1].rx).toBeNull()
    expect(estimateTraffic([point(0,1)],120)).toEqual([])
  })
  it('sorts and keeps last duplicate and rejects invalid rates', () => {
    expect(estimateTraffic([point(120,1),point(0,2),point(0,3)],120)[0].rx).toBe(360)
    for (const rate of [NaN, Infinity,-1]) expect(estimateTraffic([point(0,rate),point(120,1)],120)[0].rx).toBeNull()
  })
  it('accepts the gap boundary and rejects invalid sampling steps', () => {
    expect(estimateTraffic([point(0,1),point(180,1)],120)[0].rx).toBe(180)
    for (const step of [0,NaN,-1]) expect(estimateTraffic([point(0,1),point(120,1)],step)[0].rx).toBeNull()
  })
  it('shows unlimited neutrally, valid zero, and quota thresholds', () => {
    expect(quota(10,0)).toEqual({percent:null,tone:'neutral'})
    expect(quota(0,100)).toEqual({percent:0,tone:'normal'})
    expect(quota(79,100).tone).toBe('normal')
    expect(quota(80,100).tone).toBe('warning')
    expect(quota(100,100)).toEqual({percent:100,tone:'danger'})
    expect(quota(101,100)).toEqual({percent:100,tone:'danger'})
  })
})
