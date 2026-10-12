import { expect, it, vi, afterEach } from 'vitest'
import { parseDashboardState, readDetailParams, saveDashboardState, DEFAULT_DASHBOARD, restoreScroll } from '../../src/lib/dashboard-state'
afterEach(() => vi.unstubAllGlobals())
it('accepts versioned UI selections and discards unknown node fields', () => {
  const s = parseDashboardState(JSON.stringify({v:1,group:'edge',view:'list',scrollY:900,ip:'203.0.113.1',node:{hostname:'secret'}}))
  expect(s.group).toBe('edge'); expect(s.view).toBe('list'); expect(s.scrollY).toBe(900)
  expect('ip' in s).toBe(false); expect('node' in s).toBe(false)
})
it('corrupt, old and invalid data falls back safely', () => {
  expect(parseDashboardState('{').view).toBe('card')
  expect(parseDashboardState('{"v":0,"view":"list"}').view).toBe('card')
  expect(parseDashboardState('{"v":1,"scrollY":-8,"sort":"unsafe","region":"secret"}')).toMatchObject({scrollY:0,sort:'default',region:null})
})
it('validates detail parameters', () => {
  expect(readDetailParams('?tab=quality&hours=168')).toEqual({tab:'quality',hours:168})
  expect(readDetailParams('?tab=terminal&hours=2160')).toEqual({tab:'status',hours:6})
  expect(readDetailParams('?tab=ip&hours=1')).toEqual({tab:'ip',hours:1})
})
it('serializes only UI fields without invoking arbitrary object serializers', () => {
  const setItem=vi.fn(); vi.stubGlobal('sessionStorage',{setItem})
  const toJSON=vi.fn(() => { throw Error('private serializer') })
  saveDashboardState({...DEFAULT_DASHBOARD,view:'list',toJSON,node:{ip:'secret'}} as typeof DEFAULT_DASHBOARD)
  expect(toJSON).not.toHaveBeenCalled()
  expect(JSON.parse(setItem.mock.calls[0][1])).toEqual({...DEFAULT_DASHBOARD,view:'list'})
})
it('scroll restoration waits for layout, cancels and stops at its deadline', () => {
  let callback: FrameRequestCallback=()=>{}; let now=0
  vi.stubGlobal('performance',{now:()=>now}); vi.stubGlobal('document',{documentElement:{scrollHeight:100}})
  vi.stubGlobal('innerHeight',800); const scroll=vi.fn(); vi.stubGlobal('scrollTo',scroll)
  vi.stubGlobal('requestAnimationFrame',(fn:FrameRequestCallback)=>{callback=fn;return 1})
  vi.stubGlobal('cancelAnimationFrame',vi.fn())
  const cancel=restoreScroll(900); callback(0); expect(scroll).not.toHaveBeenCalled()
  cancel(); now=4000; callback(0); expect(scroll).not.toHaveBeenCalled()
  restoreScroll(900); now=8000; callback(0); expect(scroll).toHaveBeenCalledWith(0,900)
})

it('drops legacy queries and private groups but retains explicit public groups', () => {
  expect(parseDashboardState(JSON.stringify({v:1,query:'203.0.113.1 synthetic-host'})).query).toBe('')
  const setItem=vi.fn(); vi.stubGlobal('sessionStorage',{setItem})
  saveDashboardState({...DEFAULT_DASHBOARD,query:'203.0.113.1 synthetic-host',group:'private-group'},['edge'])
  expect(setItem.mock.calls[0][1]).not.toMatch(/203\.0\.113|synthetic-host|private-group/)
  saveDashboardState({...DEFAULT_DASHBOARD,group:'edge'},['edge'])
  expect(JSON.parse(setItem.mock.calls[1][1]).group).toBe('edge')
})

it('does not clamp a deep scroll target while progressive mounting is incomplete', () => {
 let callback: FrameRequestCallback=()=>{}, now=0, ready=false, height=1200, position=0
 vi.stubGlobal('performance',{now:()=>now})
 vi.stubGlobal('document',{documentElement:{get scrollHeight(){return height}}})
 vi.stubGlobal('innerHeight',800)
 vi.stubGlobal('scrollTo',(_x:number,y:number)=>{position=Math.min(y,height-800)})
 vi.stubGlobal('requestAnimationFrame',(fn:FrameRequestCallback)=>{callback=fn;return 1})
 restoreScroll(5000,()=>ready)
 now=4000;callback(0);expect(position).toBe(0)
 height=6500;ready=true;callback(0);expect(position).toBe(5000)
})
