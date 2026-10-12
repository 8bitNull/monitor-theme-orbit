import { useEffect, useState } from 'react'

export function nextDeadline(deadlines: readonly number[], evaluatedAt: number): number | null {
  let next: number | null = null
  for (const value of deadlines) if (Number.isFinite(value) && value > evaluatedAt && (next === null || value < next)) next = value
  return next
}

/** The clock belongs to expiration boundaries, not to every second of page rendering. */
export function useDeadline(deadlines: readonly number[]): number {
  const [evaluatedAt, setEvaluatedAt] = useState(Date.now)
  const key = [...new Set(deadlines.filter(Number.isFinite))].sort((a, b) => a - b).join(',')
  useEffect(() => {
    const next = nextDeadline(key ? key.split(',').map(Number) : [], evaluatedAt)
    if (next === null) return
    const timer = setTimeout(() => setEvaluatedAt(Date.now()), Math.max(0, next - Date.now()))
    return () => clearTimeout(timer)
  }, [key, evaluatedAt])
  return evaluatedAt
}
