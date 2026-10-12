import type { Node } from './api'

/** Complete comparison of sanitized JSON values; no field allowlist may hide updates. */
export function sameJson(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((value, i) => sameJson(value, b[i]))
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>
  const keys = Object.keys(left)
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && sameJson(left[key], right[key]))
}

/** Call only after authorization filtering and sanitization. */
export function reconcileNodeSnapshots(previous: readonly Node[], incoming: readonly Node[]): Node[] {
  const byId = new Map(previous.map(node => [node.id, node]))
  const next = incoming.map(node => {
    const old = byId.get(node.id)
    return old && sameJson(old, node) ? old : node
  })
  return next.length === previous.length && next.every((node, i) => node === previous[i]) ? previous as Node[] : next
}
