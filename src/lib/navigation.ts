export type ThemeRoute = { page: 'home' | 'quality'; id: null } | { page: 'stats'; id: number }
export function matchThemeRoute(pathname: string): ThemeRoute | null {
  if (pathname === '/') return { page: 'home', id: null }
  if (/^\/network-quality\/?$/.test(pathname)) return { page: 'quality', id: null }
  const found = pathname.match(/^\/(?:stats|node)\/(\d+)\/?$/)
  if (!found) return null
  const id = Number(found[1])
  return Number.isSafeInteger(id) && id >= 0 ? { page: 'stats', id } : null
}
function sameParameters(a: URL, b: URL): boolean {
  const first = new URLSearchParams(a.search), second = new URLSearchParams(b.search)
  first.sort(); second.sort()
  return first.toString() === second.toString()
}
export function shouldHandleLink(event: MouseEvent, anchor: HTMLAnchorElement, origin: string): boolean {
  if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return false
  if (anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return false
  const url = new URL(anchor.href)
  if (url.origin !== origin || !matchThemeRoute(url.pathname)) return false
  // Leave fragment-only scrolling (including an empty #) to the browser.
  if (typeof location !== 'undefined' && url.pathname === location.pathname && url.search === location.search && anchor.href.includes('#')) return false
  return true
}
export function installNavigation({ beforePathChange, onRouteChange, beforeLeaveHome, onIntent }: {
  beforePathChange: () => void
  onRouteChange: (route: ThemeRoute) => void
  beforeLeaveHome: () => void
  onIntent?: (url: URL) => void
}): () => void {
  let previous = new URL(location.href)
  const root = document.getElementById('root')
  const change = (url: URL, push: boolean) => {
    const route = matchThemeRoute(url.pathname)
    if (!route) { if (!push) location.reload(); return }
    const pathChanged = previous.pathname !== url.pathname
    if (pathChanged) {
      if (matchThemeRoute(previous.pathname)?.page === 'home') beforeLeaveHome()
      // The caller applies the identity policy before publishing the new route.
      beforePathChange()
    }
    if (push) history.pushState(history.state, '', url)
    previous = url
    onRouteChange(route)
  }
  const click = (event: MouseEvent) => {
    const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null
    if (!anchor || !shouldHandleLink(event, anchor, location.origin)) return
    event.preventDefault()
    const url = new URL(anchor.href)
    const current = new URL(location.href)
    if (url.pathname === current.pathname && url.hash === current.hash && sameParameters(url, current)) return
    change(url, true)
  }
  const pop = () => change(new URL(location.href), false)
  let hoverTimer: ReturnType<typeof setTimeout> | undefined
  let hovered: HTMLAnchorElement | null = null
  const cancelHover = () => { clearTimeout(hoverTimer); hovered = null }
  const intentAnchor = (event: Event) => {
    const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null
    return anchor && shouldHandleLink({ button: 0, defaultPrevented: event.defaultPrevented } as MouseEvent, anchor, location.origin) ? anchor : null
  }
  const immediate = (event: Event) => {
    if (event instanceof MouseEvent && (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)) return
    const anchor = intentAnchor(event)
    if (anchor) onIntent?.(new URL(anchor.href))
  }
  const over = (event: MouseEvent) => {
    const anchor = intentAnchor(event)
    if (anchor === hovered) return
    cancelHover()
    if (!anchor || !onIntent) return
    hovered = anchor
    hoverTimer = setTimeout(() => { onIntent(new URL(anchor.href)); hoverTimer = undefined }, 100)
  }
  const out = (event: MouseEvent) => {
    if (hovered && event.relatedTarget instanceof Node && hovered.contains(event.relatedTarget)) return
    cancelHover()
  }
  root?.addEventListener('click', click)
  root?.addEventListener('mouseover', over)
  root?.addEventListener('mouseout', out)
  root?.addEventListener('focusin', immediate)
  root?.addEventListener('pointerdown', immediate)
  addEventListener('popstate', pop)
  return () => {
    cancelHover()
    root?.removeEventListener('click', click)
    root?.removeEventListener('mouseover', over)
    root?.removeEventListener('mouseout', out)
    root?.removeEventListener('focusin', immediate)
    root?.removeEventListener('pointerdown', immediate)
    removeEventListener('popstate', pop)
  }
}

/** Ref callback also runs when a lazy page replaces its loading fallback. */
export function focusRouteMain(main: HTMLElement | null): void {
  main?.focus({ preventScroll: true })
}
