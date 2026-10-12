import type { Me } from './api'
import { api } from './http'

declare global {
  interface Window {
    __dstatusIdentity?: {
      request: Promise<Response | null>
      controller: AbortController
      startedAt: number
      abandon: () => void
    }
  }
}

/** One document-only handoff. Reviews never reuse the initial identity. */
export async function fetchIdentity(signal: AbortSignal): Promise<Me> {
  const early = typeof window === 'undefined' ? undefined : window.__dstatusIdentity
  if (early) {
    delete window.__dstatusIdentity
  }
  // A stalled entry or abandoned document must confirm identity again.
  if (!early || early.controller.signal.aborted || performance.now() - early.startedAt > 10000) {
    if (early) window.removeEventListener('pagehide', early.abandon)
    early?.controller.abort()
    return api<Me>('/me', { signal, cache: 'no-store' })
  }
  const abort = () => early.controller.abort()
  if (signal.aborted) abort()
  else signal.addEventListener('abort', abort, { once: true })
  try {
    const response = early.request.then(value => {
      if (!value) throw new TypeError('Initial identity request failed')
      return value
    })
    const identity = await api<Me>('/me', { signal }, response)
    if (signal.aborted || early.controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
    return identity
  } finally {
    window.removeEventListener('pagehide', early.abandon)
    signal.removeEventListener('abort', abort)
  }
}
