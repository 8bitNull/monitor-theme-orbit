import { expect, it } from 'vitest'
import { trafficOption } from '../../src/pages/DetailOverview'
const points = [0,120,600].map(ts => ({ts,cpu:0,mem_used:0,disk_used:0,net_rx:125000,net_tx:250000}))
it('plots actual interval endings and explains byte estimates and missing intervals', () => {
  const option = trafficOption(points,false,120)
  expect(option.xAxis.type).toBe('time')
  expect(option.series[0].data).toEqual([[120000,15000000],[600000,null]])
  expect(option.series[1].data).toEqual([[120000,30000000],[600000,null]])
  expect(option.tooltip.formatter([{dataIndex:0}])).toContain('15,000,000 bytes')
  expect(option.tooltip.formatter([{dataIndex:0}])).toContain('估算')
  expect(option.tooltip.formatter([{dataIndex:1}])).toContain('缺失区间未计入')
})
