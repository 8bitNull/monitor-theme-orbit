import { useEffect, useRef, useState } from 'react'

// All cards share one observer; activation stays local to the entering card.
const waiting = new Map<Element, () => void>()
let observer: IntersectionObserver | null = null

function release(element: Element) {
  waiting.delete(element)
  observer?.unobserve(element)
  if (!waiting.size) { observer?.disconnect(); observer = null }
}

export function useNearViewport(deferred: boolean) {
  const ref = useRef<HTMLElement | null>(null)
  const [ready, setReady] = useState(!deferred)
  useEffect(() => {
    if (ready) return
    if (!deferred || typeof IntersectionObserver === 'undefined') { setReady(true); return }
    const element = ref.current
    if (!element) return
    observer ??= new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const activate = waiting.get(entry.target)
        release(entry.target)
        activate?.()
      }
    }, { rootMargin: '200px 0px' })
    waiting.set(element, () => setReady(true))
    observer.observe(element)
    return () => release(element)
  }, [deferred, ready])
  return { ref, ready }
}
