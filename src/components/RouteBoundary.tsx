import { focusRouteMain } from "@/lib/navigation"
import { Component, type ReactNode } from 'react'

export function SafeRouteLoading({ message = '正在加载页面…' }: { message?: ReactNode }) {
  return <main ref={focusRouteMain} tabIndex={-1} className="mx-auto w-full max-w-screen-2xl px-4 pt-24 pb-8" role="status">
    <p>{message}</p>
    <div aria-hidden="true" className="mt-4 h-20 rounded-xl bg-hover" />
    <div aria-hidden="true" className="mt-4 h-48 rounded-xl bg-hover" />
  </main>
}
/** Reload retries both rejected lazy factories and their transitive chunk requests. */
export class RouteBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (this.state.failed) return <SafeRouteLoading message={<>页面加载失败，请重试。 <button className="min-h-11 min-w-11 px-4 underline" onClick={() => location.reload()}>重新加载</button></>} />
    return this.props.children
  }
}
