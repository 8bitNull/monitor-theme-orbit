import { useEffect, useRef, useState } from "react"
import type { GlobeProps } from "@/components/Globe"
import { flagUrlAsync } from "@/lib/flags"
import earthTexture from "@/assets/earth-blue-marble.jpg"

/**
 * globe.gl 渲染：地球纹理是公有领域素材（NASA 蓝色大理石）；节点按国家聚成
 * 带旗标记，点击标记经 `globe-pick` 事件交给上层筛选节点。场景只建一次，
 * 数据变化只刷新标记。
 */
export default function GlobeImpl({ markers, onPick }: GlobeProps) {
  const [failed,setFailed] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const globeRef = useRef<{ update: (markers: GlobeProps["markers"]) => void; resize: () => void } | null>(null)
  const pickRef = useRef(onPick)
  pickRef.current = onPick

  useEffect(() => {
    let disposed = false
    let destroy: (()=>void) | undefined
    const container=boxRef.current
    const motion=matchMedia("(prefers-reduced-motion: reduce)")
    let changeMotion: (()=>void) | undefined

    ;(async () => {
      const probe=document.createElement("canvas")
      const context=probe.getContext("webgl2") ?? probe.getContext("webgl")
      if (!context) { if (!disposed) setFailed(true); return }
      context.getExtension("WEBGL_lose_context")?.loseContext()
      const [{ default: Globe }] = await Promise.all([import("globe.gl")])
      if (disposed || !boxRef.current) return
      const width = boxRef.current.clientWidth
      const globe = new Globe(boxRef.current, { animateIn: !motion.matches })
        .width(width)
        .height(boxRef.current.clientHeight || Math.round(width / 2))
        .backgroundColor("rgba(0,0,0,0)")
        .globeImageUrl(earthTexture)
        .showAtmosphere(true)
        .atmosphereColor("#3b82f6")
        .atmosphereAltitude(0.18)
        .htmlElementsData(markers.map((m) => ({ ...m })))
        .htmlLat((d: object) => (d as { lat: number }).lat)
        .htmlLng((d: object) => (d as { lng: number }).lng)
        .htmlAltitude(0.06)
        .htmlElement((d: object) => {
          const { code, count, names } = d as { code: string; count: number; names: string[] }
          const el = document.createElement("div")
          el.className = "globe-marker"
          const img = document.createElement("img")
          img.alt = code
          void flagUrlAsync(code).then((url) => {
            if (url) img.src = url
          })
          const cnt = document.createElement("span")
          cnt.className = "cnt"
          cnt.textContent = String(count)
          el.append(img, cnt)
          el.title = names.join("、")
          el.onclick = (e) => {
            e.stopPropagation()
            el.dispatchEvent(new CustomEvent("globe-pick", { bubbles: true, detail: code }))
          }
          return el
        })

      const controls = globe.controls() as { autoRotate?: boolean; autoRotateSpeed?: number } | undefined
      if (controls) {
        controls.autoRotate = !motion.matches
        changeMotion=()=>{ controls.autoRotate=!motion.matches }
        motion.addEventListener("change",changeMotion)
        controls.autoRotateSpeed = 0.6
      }
      destroy=()=>{globe.pauseAnimation();globe._destructor()}
      globe.pointOfView({ lat: 28, lng: 105, altitude: 1.9 }, 0)

      ;(window as unknown as Record<string, unknown>).__globeDebug = {
        initMarkers: markers.length,
        texture: typeof earthTexture,
      }
      globeRef.current = {
        update: (next) => {
          ;(window as unknown as Record<string, unknown>).__globeDebug = {
            ...(window as unknown as Record<string, unknown>).__globeDebug as object,
            updateLen: next.length,
            updateSample: next[0] ? { code: next[0].code, lat: next[0].lat } : null,
          }
          globe.htmlElementsData(next.map((m) => ({ ...m })))
        },
        resize: () => {
          const el = boxRef.current
          if (!el) return
          globe.width(el.clientWidth)
          globe.height(el.clientHeight)
        },
      }
    })().catch(()=>{ destroy?.(); if (!disposed) setFailed(true) })

    const onPickEvent = (e: Event) => pickRef.current((e as CustomEvent<string>).detail)
    const onResize = () => globeRef.current?.resize()
    boxRef.current?.addEventListener("globe-pick", onPickEvent)
    window.addEventListener("resize", onResize)
    return () => {
      disposed = true
      container?.removeEventListener("globe-pick", onPickEvent)
      window.removeEventListener("resize", onResize)
      if(changeMotion) motion.removeEventListener("change",changeMotion)
      destroy?.()
      globeRef.current = null
      if (container) container.innerHTML = ""
    }
  }, [])

  useEffect(() => {
    globeRef.current?.update(markers)
  }, [markers])

  if(failed) return <p role="status" className="p-4 text-sm text-secondary">设备不支持3D地图，可使用地区筛选</p>
  return <div ref={boxRef} className="globe-wrap" />
}
