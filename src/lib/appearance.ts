import manifest from "../../theme.json"
import { api } from "@/lib/api"

/** 外观（亮暗/配色/玻璃）+ 面板设置，全部对内聚在一个模块。 */

export type Mode = "light" | "dark" | "system"

export const PRESETS = [
  { id: "vercel-black", label: "Vercel 纯黑", brand: "#3b82f6", dark: "#0a0a0a", light: "#ffffff" },
  { id: "graphite-gray", label: "石墨深灰", brand: "#8b949e", dark: "#171717", light: "#f4f4f5" },
  { id: "classic-blue-black", label: "经典蓝黑", brand: "#3b82f6", dark: "#0f172a", light: "#f8fafc" },
  { id: "warm-black", label: "暖黑", brand: "#f59e0b", dark: "#1a1210", light: "#faf7f2" },
  { id: "cool-black", label: "冷黑", brand: "#06b6d4", dark: "#0b1820", light: "#f3f8fb" },
] as const

const DARK_MEDIA = matchMedia("(prefers-color-scheme: dark)")

type AppearanceKey = "theme" | "dstatus-accent" | "dstatus-glass"

export function readAppearancePreference(key: AppearanceKey): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

export function saveAppearancePreference(key: AppearanceKey, value: string): void {
  try { localStorage.setItem(key, value) } catch { /* Current appearance still applies. */ }
}

export function validAccent(accent: string | null): string {
  return PRESETS.some(p => p.id === accent) ? accent! : "vercel-black"
}

export function resetAppearance(): { mode: Mode; accent: string; glass: boolean } {
  for (const key of ["theme", "dstatus-accent", "dstatus-glass"]) {
    try { localStorage.removeItem(key) } catch { /* Reset current appearance even without storage. */ }
  }
  return { mode: "system", accent: "vercel-black", glass: false }
}

export function savedMode(): Mode {
  const saved = readAppearancePreference("theme")
  return saved === "light" || saved === "dark" ? saved : "system"
}

/** 应用外观：html class / data 属性与 index.html 的内联脚本同一套规则。 */
export function applyAppearance(mode: Mode, accent: string, glass: boolean) {
  const dark = mode === "dark" || (mode === "system" && DARK_MEDIA.matches)
  document.documentElement.classList.toggle("dark", dark)
  document.documentElement.setAttribute("data-preset", validAccent(accent))
  if (glass) document.documentElement.setAttribute("data-glass", "on")
  else document.documentElement.removeAttribute("data-glass")
}

export function watchSystem(cb: () => void) {
  DARK_MEDIA.addEventListener("change", cb)
  return () => DARK_MEDIA.removeEventListener("change", cb)
}

/**
 * 面板里保存的设置。类型不符视为未保存；任何失败（含旧版 hub 的 404）都
 * 渲染默认值而不是报错。
 */
export function loadConfig(): Promise<Record<string, unknown>> {
  const pick = (saved: Record<string, unknown>) =>
    Object.fromEntries(
      ((manifest.config ?? []) as { key: string; type: string; default: unknown }[])
        .filter((f) => f.type !== "title")
        .map((f) => {
          const v = saved[f.key]
          // 存量值类型不符（旧版主题或其他来源写入）时回退默认并留痕，便于排查"区块不见了"。
          if (v !== undefined && typeof v !== typeof f.default) {
            console.warn(`[orbit] 主题配置「${f.key}」的值类型异常（${typeof v}），已回退默认值`, v)
          }
          return [f.key, typeof v === typeof f.default ? v : f.default]
        }),
    )
  return api<Record<string, unknown>>(`/themes/${manifest.short}/config`).then(pick).catch(() => pick({}))
}

export type Config = {
  show_region: boolean
  show_network: boolean
  show_expiring: boolean
  capacity_mbps: number
  footer_text: string
  footer_url: string
}

export function asConfig(raw: Record<string, unknown>): Config {
  return {
    show_region: raw.show_region === true,
    show_network: raw.show_network === true,
    show_expiring: raw.show_expiring === true,
    capacity_mbps: typeof raw.capacity_mbps === "number" && raw.capacity_mbps > 0 ? raw.capacity_mbps : 1000,
    footer_text: typeof raw.footer_text === "string" ? raw.footer_text : "",
    footer_url: typeof raw.footer_url === "string" ? raw.footer_url : "",
  }
}
