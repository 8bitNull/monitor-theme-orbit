import { lazy, Suspense } from "react"

/**
 * 3D 地球：globe.gl（three.js）+ NASA 蓝色大理石纹理 + Natural Earth 国界，
 * 实现在 GlobeImpl，随本模块一起懒加载。
 */

export type GlobeMarker = { code: string; count: number; lat: number; lng: number; names: string[] }

export type GlobeProps = {
  markers: GlobeMarker[]
  onPick: (code: string) => void
  dark: boolean
}

const Impl = lazy(() => import("@/components/GlobeImpl"))

export function Globe(props: GlobeProps) {
  return (
    <Suspense fallback={<div className="globe-wrap skeleton" />}>
      <Impl {...props} />
    </Suspense>
  )
}
