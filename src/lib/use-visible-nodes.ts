import {useEffect, useRef, useState} from 'react'
const sameIds = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((id, i) => id === b[i])
/** Visibility is only a scheduling hint; the caller retains its complete query set. */
export function useVisibleNodes(displayIds: readonly number[]) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const idsRef = useRef(displayIds)
  idsRef.current = displayIds
  const [visibleIds, setPriorityIds] = useState<readonly number[]>(() => displayIds.slice(0, 4))
  const displayKey = displayIds.join(',')
  const previousKey = useRef(displayKey)
  // A new display set has a useful initial hint even before effects/observation run.
  const priorityIds = previousKey.current === displayKey ? visibleIds : displayIds.slice(0, 4)
  const binding = useRef<{root: HTMLDivElement; update: () => void; dispose: () => void} | null>(null)
  useEffect(() => {
    const changed = previousKey.current !== displayKey
    previousKey.current = displayKey
    const publish = (next: readonly number[]) => setPriorityIds(previous => sameIds(previous, next) ? previous : next)
    const root = rootRef.current
    if (binding.current?.root !== root) { binding.current?.dispose(); binding.current = null }
    if (binding.current) { if (changed) binding.current.update(); return }
    if (!root || typeof IntersectionObserver === 'undefined') { publish(idsRef.current.slice(0, 4)); return }
    const observed = new Set<HTMLElement>(), visible = new Set<HTMLElement>()
    const update = () => {
      const ids = new Set([...visible].map(element => Number(element.dataset.nodeId)))
      publish(idsRef.current.filter(id => ids.has(id)))
    }
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const element = entry.target as HTMLElement
        if (!observed.has(element)) continue
        if (entry.isIntersecting && entry.boundingClientRect.width > 0 && entry.boundingClientRect.height > 0) visible.add(element); else visible.delete(element)
      }
      update()
    }, {rootMargin: '200px 0px'})
    const candidates = (node: Node): HTMLElement[] => node instanceof HTMLElement
      ? [...(node.matches('[data-node-id]') ? [node] : []), ...node.querySelectorAll<HTMLElement>('[data-node-id]')]
      : []
    const observe = (element: HTMLElement) => {
      if (!observed.has(element)) { observed.add(element); observer.observe(element) }
    }
    publish(idsRef.current.slice(0, 4))
    root.querySelectorAll<HTMLElement>('[data-node-id]').forEach(observe)
    const mutations = new MutationObserver(records => {
      let changed = false
      const touched = new Set<HTMLElement>()
      for (const record of records) {
        if (record.type === 'attributes') { touched.add(record.target as HTMLElement); changed = true }
        else for (const node of [...record.addedNodes, ...record.removedNodes]) {
          for (const element of candidates(node)) touched.add(element)
        }
      }
      for (const element of touched) {
        if (root.contains(element) && element.hasAttribute('data-node-id')) observe(element)
        else if (observed.delete(element)) { observer.unobserve(element); changed = visible.delete(element) || changed }
      }
      if (changed) update()
    })
    mutations.observe(root, {childList: true, subtree: true, attributes: true, attributeFilter: ['data-node-id']})
    binding.current = {root, update, dispose: () => { mutations.disconnect(); observer.disconnect(); observed.clear(); visible.clear() }}
  })
  useEffect(() => () => { binding.current?.dispose(); binding.current = null }, [])
  return {rootRef, priorityIds}
}
