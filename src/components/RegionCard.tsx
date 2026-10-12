import { Flag } from "@/lib/flags"
import { countryName } from "@/lib/country"
import { Globe, type GlobeMarker } from "@/components/Globe"
import { useMemo, useState } from "react"

/** 国家/地区 ISO 代码 → 经纬度质心，供地球标记定位。 */
const CENTROIDS: Record<string, [number, number]> = {
  US: [39.8, -98.6], CA: [56.1, -106.3], MX: [23.6, -102.5], BR: [-14.2, -51.9], AR: [-38.4, -63.6],
  CL: [-35.7, -71.5], PE: [-9.2, -75.0], GB: [54.0, -2.5], IE: [53.4, -8.2], FR: [46.6, 2.4],
  DE: [51.2, 10.4], NL: [52.2, 5.5], BE: [50.6, 4.6], LU: [49.8, 6.1], ES: [40.2, -3.7],
  PT: [39.6, -8.0], IT: [42.8, 12.6], CH: [46.8, 8.2], AT: [47.6, 14.1], PL: [52.1, 19.4],
  CZ: [49.8, 15.5], SK: [48.7, 19.7], HU: [47.2, 19.5], RO: [45.9, 25.0], BG: [42.7, 25.5],
  GR: [39.1, 21.8], TR: [39.0, 35.2], RU: [61.5, 90.0], UA: [48.4, 31.2], BY: [53.7, 27.9],
  SE: [60.1, 15.6], NO: [61.0, 8.5], DK: [56.3, 9.5], FI: [63.2, 26.0], IS: [64.9, -19.0],
  EE: [58.6, 25.0], LV: [56.9, 24.6], LT: [55.2, 23.9], CN: [35.9, 104.2], HK: [22.4, 114.1],
  MO: [22.2, 113.5], TW: [23.7, 121.0], JP: [36.2, 138.3], KR: [35.9, 127.8], KP: [40.3, 127.5],
  MN: [46.9, 103.8], IN: [21.0, 78.9], PK: [30.4, 69.3], BD: [23.7, 90.4], LK: [7.9, 80.8],
  NP: [28.4, 84.1], MM: [21.9, 95.9], TH: [15.9, 101.0], VN: [14.1, 108.3], KH: [12.6, 104.9],
  LA: [19.9, 102.5], MY: [4.2, 102.0], SG: [1.35, 103.8], ID: [-0.8, 113.9], PH: [12.9, 121.8],
  AU: [-25.3, 133.8], NZ: [-40.9, 174.9], AE: [23.4, 53.8], SA: [23.9, 45.1], QA: [25.4, 51.2],
  KW: [29.3, 47.5], BH: [26.1, 50.5], OM: [21.5, 55.9], IL: [31.1, 34.9], JO: [30.6, 36.2],
  LB: [33.9, 35.9], IQ: [33.2, 43.7], IR: [32.4, 53.7], EG: [26.8, 30.8], ZA: [-30.6, 22.9],
  NG: [9.1, 8.7], KE: [-0.02, 37.9], MA: [31.8, -7.1], DZ: [28.0, 1.7], TN: [33.9, 9.6],
  GH: [7.9, -1.0], TZ: [-6.4, 34.9], ET: [9.1, 40.5], KZ: [48.0, 66.9], UZ: [41.4, 64.6],
  GE: [42.3, 43.4], AM: [40.1, 45.0], AZ: [40.1, 47.6], CY: [35.1, 33.4], MT: [35.9, 14.4],
}


/** 地区卡：旗标计数行 + 可展开的 3D 地球。点击某地区筛选节点列表。 */
export function RegionCard({ countries, active, onPick }: {
  countries: { code: string; count: number; names: string[] }[]
  active: string | null
  onPick: (code: string | null) => void
}) {
  // 默认收起（与 demo 的 default-expanded=false 一致）：globe 分包与地球纹理
  // 都不小，只在访客点开时加载。
  const [globeOpen, setGlobeOpen] = useState(false)

  const markers: GlobeMarker[] = useMemo(
    () =>
      countries
        .filter((c) => CENTROIDS[c.code])
        .map((c) => ({ code: c.code, count: c.count, lat: CENTROIDS[c.code][0], lng: CENTROIDS[c.code][1], names: c.names })),
    [countries],
  )

  return (
    <section className="region-card surface-card p-4">
      <header className="region-controls flex flex-wrap items-center justify-end gap-2">
        {active && (
          <span className="mr-auto inline-flex items-center gap-1 rounded-md bg-accent-soft px-2 py-1 text-xs font-medium text-accent">
            <i className="ti ti-filter text-xs" aria-hidden />筛选中
          </span>
        )}
        <button className="toolbar-chip min-h-11 min-w-11 !py-1 !px-2" onClick={() => setGlobeOpen((v) => !v)} aria-expanded={globeOpen}>
          <i className={`ti ti-chevron-down text-xs transition-transform ${globeOpen ? "rotate-180" : ""}`} aria-hidden />
          <span>3D地图</span>
        </button>
        {active && <button className="toolbar-chip min-h-11 min-w-11 !py-1 !px-2 text-accent" onClick={() => onPick(null)}>
          <i className="ti ti-refresh text-xs" aria-hidden />
          <span>清除地区筛选</span>
        </button>}
      </header>

      {globeOpen && (
        <div className="region-globe overflow-hidden rounded-lg">
          <Globe markers={markers} onPick={(code) => onPick(active === code ? null : code)} dark={document.documentElement.classList.contains("dark")} />
        </div>
      )}

      <div className="region-tags-row flex flex-wrap items-center gap-2">
        {countries.map((c) => (
          <button key={c.code} className={`region-tag min-h-11 min-w-11 ${active === c.code ? "active" : ""}`}
            aria-pressed={active === c.code} aria-label={`${countryName(c.code)}，${c.count}个节点`}
            title={`点击查看${countryName(c.code)}的节点 (${c.count}个)`}
            onClick={() => onPick(active === c.code ? null : c.code)}>
            <Flag code={c.code} title={c.code} />
            <span className="region-tag-code">{c.code}</span>
            <span className="region-tag-count">{c.count}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
