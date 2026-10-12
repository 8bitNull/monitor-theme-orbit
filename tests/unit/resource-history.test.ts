import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import type { Node } from '../../src/lib/api'
const charts: Record<string, unknown>[] = []
vi.stubGlobal('React', React)
vi.mock('../../src/components/Echart', async importOriginal => {
  const original = await importOriginal<typeof import('../../src/components/Echart')>()
  return { ...original, Echart: ({ option }: { option: Record<string, unknown> }) => { charts.push(option); return null } }
})
vi.mock('../../src/components/Foldout', () => ({ Foldout: ({children}: {children: React.ReactNode}) => children }))
import { Overview } from '../../src/pages/DetailOverview'
for (const total of [0, 100]) it(`detail histories and footers preserve ${total ? 'valid zero' : 'unknown capacity'}`, () => {
  charts.length = 0
  const node = {name:'Synthetic',os:'',virt:'',country:'',month_rx:0,month_tx:0,traffic_limit:0,mem_total:total,disk_total:total,swap_total:0,metrics:null} as Node
  const metrics = [0,120].map(ts => ({ts,cpu:10,mem_used:0,disk_used:0,net_rx:0,net_tx:0}))
  const html = renderToStaticMarkup(React.createElement(Overview,{node,history:{metrics,loading:false,error:null,stale:false,retained:true},dark:false,hours:6,points:180,onRefresh:()=>{}}))
  const expected = total ? [0,0] : [null,null]
  const memorySpark = charts[1].series as {data:unknown[]}[]
  const diskSpark = charts[2].series as {data:unknown[]}[]
  const resources = charts[3].series as {data:unknown[]}[]
  const disk = charts[6].series as {data:unknown[]}[]
  expect.soft(memorySpark[0].data).toEqual(expected)
  expect.soft(diskSpark[0].data).toEqual(expected)
  expect.soft(resources[1].data).toEqual(expected)
  expect.soft(disk[0].data).toEqual(expected)
  const footerValues = [...html.matchAll(/class="text-right text-\[11px\] tabular-nums text-secondary">([^<]*)/g)].map(match=>match[1])
  expect.soft(footerValues.slice(1)).toEqual(total ? ['0%','0%'] : ['--','--'])
})
