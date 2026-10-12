import { useCallback, useEffect, useRef, useState } from 'react'
import type { Me, Node } from './api'
import { fetchIdentity } from './initial-identity'
export type AuthState = 'checking' | 'admin' | 'visitor' | 'unavailable'
type ReviewMode = 'blocking' | 'public-navigation' | 'resume'
export function stripAdminFields(node: Node): Node {
  const fields = ['ip', 'ipv4', 'ipv6', 'addresses', 'hostname', 'remark', 'interval', 'country_pin', 'country_auto']
  if (!fields.some(key => Object.hasOwn(node, key))) return node
  const copy = { ...node } as Node & Record<string, unknown>
  for (const key of fields) delete copy[key]
  return copy
}
/** Resume reviews retain the confirmed view; privilege barriers remain blocking. */
export function useAuthSession(onDowngrade: () => void) {
  const [me, setMe] = useState<Me | null>(null)
  const [state, setState] = useState<AuthState>('checking')
  const [authEpoch, setAuthEpoch] = useState(0)
  const cleanup = useRef(onDowngrade)
  cleanup.current = onDowngrade
  const alive = useRef(false), generation = useRef(0)
  const inflight = useRef<Promise<void> | null>(null)
  const controller = useRef<AbortController | null>(null)
  const recovering = useRef(false)
  const identity = useRef<Me | null>(null)
  const suspended = useRef(true)
  const refresh = useCallback((mode: ReviewMode = 'blocking'): Promise<void> => {
    const keepMounted = !suspended.current && identity.current !== null && (
      mode === 'resume' || (mode === 'public-navigation' && identity.current.authed === false && identity.current.public_page === true)
    )
    // Explicit retries and 401 barriers still mask a pending background review.
    if (!keepMounted) {
      if (!suspended.current) cleanup.current()
      suspended.current = true
      setMe(null); setState('checking')
    }
    if (inflight.current) return inflight.current
    recovering.current = false
    const epoch = ++generation.current
    const abort = new AbortController()
    controller.current = abort
    const request = fetchIdentity(abort.signal).then(next => {
      if (!alive.current || epoch !== generation.current) return
      if (typeof next.authed !== 'boolean') throw new Error('Invalid identity')
      const changed = identity.current?.authed !== next.authed || identity.current.public_page !== next.public_page
      if (!suspended.current && changed) { cleanup.current(); suspended.current = true }
      if (suspended.current) setAuthEpoch(n => n + 1)
      identity.current = next; suspended.current = false
      setMe(next); setState(next.authed ? 'admin' : 'visitor')
    }).catch(() => {
      if (!alive.current || epoch !== generation.current) return
      if (!suspended.current) cleanup.current()
      identity.current = null; suspended.current = true
      setMe(null); setState('unavailable')
    }).finally(() => { if (inflight.current === request) inflight.current = null })
    inflight.current = request
    return request
  }, [])
  useEffect(() => {
    alive.current = true
    const focus = () => { void refresh('resume') }
    const visible = () => { if (!document.hidden) void refresh('resume') }
    const invalid = () => {
      generation.current++; controller.current?.abort(); inflight.current = null
      if (recovering.current) {
        cleanup.current(); identity.current = null; suspended.current = true; setMe(null); setState('unavailable')
        return
      }
      void refresh()
      recovering.current = true
    }
    void refresh()
    addEventListener('focus', focus)
    addEventListener('dstatus-auth-invalidated', invalid)
    document.addEventListener('visibilitychange', visible)
    return () => {
      alive.current = false; generation.current++; controller.current?.abort(); inflight.current = null
      removeEventListener('focus', focus); removeEventListener('dstatus-auth-invalidated', invalid)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [refresh])
  const reviewNavigation = useCallback(() => refresh('public-navigation'), [refresh])
  return { me, state, refresh, reviewNavigation, authEpoch }
}
