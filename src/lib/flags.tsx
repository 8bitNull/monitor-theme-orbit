// 按需取用的国旗 SVG：Vite 的 glob 会把每一面旗发成独立文件，页面只加载访客需要的那些。
import { useEffect, useState } from "react"

const modules = import.meta.glob<string>("/node_modules/country-flag-icons/3x2/*.svg", {
  query: "?url",
  import: "default",
})

const cache = new Map<string, string>()

/** 异步取旗 URL，供非 React 的 DOM（如地球标记）使用。 */
export function flagUrlAsync(code: string): Promise<string | null> {
  const cc = code.toUpperCase()
  const hit = cache.get(cc)
  if (hit) return Promise.resolve(hit)
  const loader = modules[`/node_modules/country-flag-icons/3x2/${cc}.svg`]
  if (!loader) return Promise.resolve(null)
  return loader().then(
    (u) => {
      cache.set(cc, u)
      return u
    },
    () => null,
  )
}

function useFlagUrl(code: string): string | null {
  const cc = code.toUpperCase()
  const [url, setUrl] = useState<string | null>(() => cache.get(cc) ?? null)
  useEffect(() => {
    if (url || !cc) return
    let alive = true
    void flagUrlAsync(cc).then((u) => {
      if (alive && u) setUrl(u)
    })
    return () => {
      alive = false
    }
  }, [cc, url])
  return url
}

/** 国旗小图；无旗时退回两个字母的代码块。 */
export function Flag({ code, title }: { code: string; title?: string }) {
  const url = useFlagUrl(code)
  if (!code) return null
  if (!url) {
    return (
      <span
        className="inline-flex items-center justify-center rounded-[2px] bg-hover text-secondary font-bold"
        style={{ width: 21, height: 14, fontSize: 9 }}
        title={title ?? code}
      >
        {code.toUpperCase()}
      </span>
    )
  }
  return <img src={url} alt={title ?? code} className="flag-img" title={title ?? code} loading="lazy" decoding="async" />
}
