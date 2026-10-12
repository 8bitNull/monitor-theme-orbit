import {expect,it} from 'vitest'
import {nextDeadline} from '../../src/lib/use-deadline'
it('selects only the earliest finite deadline not yet evaluated',()=>{
 expect(nextDeadline([NaN,Infinity,-Infinity,0,5,6,9,6],5)).toBe(6)
 expect(nextDeadline([],5)).toBe(null)
 expect(nextDeadline([4,5,NaN],5)).toBe(null)
 expect(nextDeadline([15001],15000)).toBe(15001)
 expect(nextDeadline([15001],15001)).toBe(null)
})
