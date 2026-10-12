import { Dropdown } from "@/components/ui"
import type { Me } from "@/lib/api"
import { applyAppearance, PRESETS, type Mode } from "@/lib/appearance"

const MODE_LABEL: Record<Mode, string> = { light: "日间模式", dark: "夜间模式", system: "系统适配" }
const MODE_ICON: Record<Mode, string> = { light: "ti-sun", dark: "ti-moon", system: "ti-device-desktop" }

export type DetailTab = "status" | "ip" | "quality"

/** 顶部导航。列表页：站点名 + 首页/网络质量 + 外观 + 登录；详情页：面包屑 + 三标签 + 站点。 */
export function Navbar({ route, me, mode, accent, glass, onMode, onAccent, onGlass, onResetAppearance, tab, onTab, nodeName }: {
  route: { page: "home" | "quality" | "stats"; id: number | null }
  me: Me | null
  mode: Mode
  accent: string
  glass: boolean
  onMode: (m: Mode) => void
  onAccent: (a: string) => void
  onGlass: (g: boolean) => void
  onResetAppearance: () => void
  tab?: DetailTab
  onTab?: (t: DetailTab) => void
  nodeName?: string
}) {
  const themeMenu = (
    <ThemeDropdown mode={mode} accent={accent} glass={glass} onMode={onMode} onAccent={onAccent} onGlass={onGlass} onResetAppearance={onResetAppearance} />
  )

  if (route.page === "stats") {
    const tabs: { key: DetailTab; label: string; icon: string }[] = [
      { key: "status", label: "概况", icon: "ti-activity" },
      { key: "ip", label: me?.authed ? "IP 与节点信息" : "归属地与节点信息", icon: "ti-map-2" },
      { key: "quality", label: "网络质量", icon: "ti-wifi" },
    ]
    return (
      <nav className="navbar">
        <div className="navbar-bg" />
        <div className="relative mx-auto max-w-screen-2xl">
          <div className="flex h-16 items-center justify-between gap-3 pl-5 pr-2 sm:pl-6 sm:pr-3 md:pl-7 md:pr-4 lg:pl-9 lg:pr-6">
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <a href="/" className="group flex min-h-11 min-w-11 items-center justify-center gap-1.5" aria-label="返回首页">
                <i className="ti ti-3d-cube-sphere text-2xl leading-none text-accent" aria-hidden />
              </a>
              <span className="text-line">|</span>
              <a href="/" className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 text-secondary hover:text-main">
                <i className="ti ti-home text-base" aria-hidden />
                <span className="hidden sm:inline">首页</span>
              </a>
              <span className="text-line">|</span>
              <span className="truncate font-medium">{nodeName ?? `节点 #${route.id}`}</span>
            </div>

            <div role="tablist" aria-label="节点详情" className="hidden items-center gap-1 md:flex">
              {tabs.map((t) => (
                <button key={t.key} role="tab" id={`desktop-tab-${t.key}`} aria-controls={`detail-panel-${t.key}`} onClick={() => onTab?.(t.key)} aria-selected={tab === t.key}
                  className={`nav-link !rounded-lg !px-3 ${tab === t.key ? "active" : ""}`}>
                  <span className="inline-flex items-center gap-1.5">
                    <i className={`ti ${t.icon} text-lg leading-none`} aria-hidden />
                    <span className="text-xs font-medium leading-none">{t.label}</span>
                  </span>
                </button>
              ))}
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {themeMenu}
              <Dropdown label="站点" align="right" button={() => (
                <span className="nav-link cursor-pointer">
                  <span className="inline-flex items-center gap-1.5">
                    <i className="ti ti-layout-grid text-xl leading-none" aria-hidden />
                    <span className="hidden text-xs font-medium leading-none md:inline-block">站点</span>
                  </span>
                </span>
              )}>
                {() => (
                  <>
                    <a className="dropdown-item" href="/"><i className="ti ti-home text-sm" /> 状态页首页</a>
                    <a className="dropdown-item" href="/network-quality"><i className="ti ti-activity text-sm" /> 网络质量监控</a>
                    <a className="dropdown-item" href="/admin/"><i className="ti ti-settings text-sm" /> 进入后台</a>
                  </>
                )}
              </Dropdown>
            </div>
          </div>
          {/* 移动端标签行 */}
          <div role="tablist" aria-label="节点详情" className="flex items-center justify-center gap-1 pb-2 md:hidden">
            {tabs.map((t) => (
              <button key={t.key} role="tab" id={`mobile-tab-${t.key}`} aria-controls={`detail-panel-${t.key}`} aria-selected={tab === t.key} onClick={() => onTab?.(t.key)}
                className={`nav-link !rounded-lg !px-3 ${tab === t.key ? "active" : ""}`}>
                <span className="inline-flex items-center gap-1.5">
                  <i className={`ti ${t.icon} text-base leading-none`} aria-hidden />
                  <span className="text-xs font-medium leading-none">{t.label}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </nav>
    )
  }

  return (
    <nav className="navbar">
      <div className="navbar-bg" />
      <div className="relative mx-auto flex h-16 max-w-screen-2xl items-center justify-between pl-5 pr-2 sm:pl-6 sm:pr-3 md:pl-7 md:pr-4 lg:pl-9 lg:pr-6"
        >
        <a href="/" className="group flex min-h-11 min-w-11 flex-1 items-center gap-1.5" title={me?.site_name || "Monitor"} aria-label={`${me?.site_name || "Monitor"}，返回首页`}>
          <i className="ti ti-3d-cube-sphere text-2xl leading-none text-accent" aria-hidden />
          <span className="min-w-0 truncate text-lg font-bold">
            {me?.site_name || "Monitor"}
          </span>
        </a>

        <div className="flex shrink-0 items-center gap-1">
          <a href="/" className={`nav-link ${route.page === "home" ? "active" : ""}`} aria-label="首页">
            <span className="inline-flex items-center gap-1.5">
              <i className="ti ti-home text-xl leading-none" aria-hidden />
              <span className="hidden text-xs font-medium leading-none md:inline-block">首页</span>
            </span>
          </a>
          <a href="/network-quality" className={`nav-link ${route.page === "quality" ? "active" : ""}`} aria-label="网络质量">
            <span className="inline-flex items-center gap-1.5">
              <i className="ti ti-activity text-xl leading-none" aria-hidden />
              <span className="hidden text-xs font-medium leading-none md:inline-block">网络质量</span>
            </span>
          </a>
          {themeMenu}
          <a href="/admin/" className="nav-link" aria-label={me?.authed ? "后台" : "登录"}>
            <span className="inline-flex items-center gap-1.5">
              {me?.authed ? <i className="ti ti-settings text-xl leading-none" aria-hidden /> : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></svg>}
              <span className="hidden text-xs font-medium leading-none md:inline-block">{me?.authed ? "后台" : "登录"}</span>
            </span>
          </a>
        </div>
      </div>
    </nav>
  )
}

function ThemeDropdown({ mode, accent, glass, onMode, onAccent, onGlass, onResetAppearance }: {
  mode: Mode
  accent: string
  glass: boolean
  onMode: (m: Mode) => void
  onAccent: (a: string) => void
  onGlass: (g: boolean) => void
  onResetAppearance: () => void
}) {
  return (
    <Dropdown align="right" panelClass="w-56" label="主题" button={() => (
      <span className="nav-link cursor-pointer">
        <span className="inline-flex items-center gap-1.5">
          <i className="ti ti-device-desktop text-xl leading-none" aria-hidden />
          <span className="hidden text-xs font-medium leading-none lg:inline-block">主题</span>
          <i className="ti ti-chevron-down hidden text-base leading-none transition-transform lg:inline-block" aria-hidden />
        </span>
      </span>
    )}>
      {(close) => (
        <>
          {(["light", "dark", "system"] as Mode[]).map((m) => (
            <button key={m} className={`dropdown-item ${mode === m ? "active" : ""}`}
              onClick={() => { onMode(m); applyAppearance(m, accent, glass); close() }}>
              <i className={`ti ${MODE_ICON[m]} text-sm`} aria-hidden />
              {MODE_LABEL[m]}
            </button>
          ))}
          <div className="dropdown-divider" />
          <div className="px-2.5 pb-1 pt-0.5 text-xs text-secondary">
            <i className="ti ti-palette mr-1 text-sm" aria-hidden />配色
          </div>
          <div className="flex flex-wrap items-center gap-2 px-3 pb-2">
            {PRESETS.map((p) => (
              <button key={p.id} title={p.label} aria-label={p.label}
                onClick={() => { onAccent(p.id); applyAppearance(mode, p.id, glass) }}
                className={`flex h-11 w-11 shrink-0 overflow-hidden rounded-md border transition-all ${
                  accent === p.id ? "border-accent ring-2 ring-accent/40" : "border-line"}`}>
                <span className="h-full flex-1" style={{ background: p.dark }} />
                <span className="h-full flex-1" style={{ background: p.brand }} />
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between px-2.5 py-1.5 text-xs">
            <span className="inline-flex items-center gap-1.5 text-secondary">
              <i className="ti ti-sparkles text-sm" aria-hidden />玻璃
            </span>
            <GlassSwitch on={glass} onChange={(v) => { onGlass(v); applyAppearance(mode, accent, v) }} />
          </div>
          <div className="dropdown-divider" />
          <button className="dropdown-item" onClick={() => {
            onResetAppearance()
            close()
          }}>
            <i className="ti ti-restore text-sm" aria-hidden />恢复默认外观
          </button>
        </>
      )}
    </Dropdown>
  )
}

function GlassSwitch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-label="玻璃效果" aria-checked={on} onClick={() => onChange(!on)}
      className="flex h-11 w-11 shrink-0 items-center justify-center bg-transparent">
      <span aria-hidden="true" className={`relative h-5 w-9 rounded-full transition-colors ${on ? "bg-accent" : "bg-hover"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
      </span>
    </button>
  )
}
