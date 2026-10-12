import { quota } from '../lib/traffic'
import { traffic } from '../lib/format'
export function TrafficQuota({ used, limit }: { used: number; limit: number }) {
  const state = quota(used, limit)
  return <div>
    <div className="flex justify-between gap-2 text-xs">
      <span>已用 {Number.isFinite(used) && used >= 0 ? traffic(used) : '--'}</span>
      <span>{Number.isFinite(limit) && limit > 0 ? traffic(limit) : '不限'}</span>
    </div>
    {state.percent !== null && <div className="progress-track mt-1" role="progressbar"
      aria-label="周期流量用量" aria-valuemin={0} aria-valuemax={100} aria-valuenow={state.percent}>
      <div className={`progress-fill quota-${state.tone}`} style={{ width: `${state.percent}%` }} />
    </div>}
  </div>
}
