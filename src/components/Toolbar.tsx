import { Dropdown } from "@/components/ui"
import type { Node } from "@/lib/api"
import { groupsOf } from "@/lib/api"
import { useId, useRef, useState, type ReactNode } from "react"

export type SortKey = "default" | "name" | "total" | "expiry" | "uptime" | "cpu" | "mem" | "disk" | "down" | "up"

export const SORT_LABEL: Record<SortKey, string> = {
  default: "默认排序", name: "名称", total: "总流量", expiry: "到期时间", uptime: "在线时间",
  cpu: "CPU使用率", mem: "内存使用率", disk: "硬盘使用率", down: "下载速度", up: "上传速度",
}

/** 列表上方的工具栏：排序/分组/标签三枚芯片、卡片/列表切换、可展开的完整排序行。 */
export function Toolbar({ nodes, sort, asc, group, live, onSort, onAsc, onGroup, onLive, view, onView, filters }: {
  filters?: ReactNode
  nodes: Node[]
  sort: SortKey
  asc: boolean
  group: string | null
  live: boolean
  onSort: (k: SortKey) => void
  onAsc: (v: boolean) => void
  onGroup: (g: string | null) => void
  onLive: (v: boolean) => void
  view: "card" | "list"
  onView: (v: "card" | "list") => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const filterId = useId()
  const filterButton = useRef<HTMLButtonElement>(null)
  const groups = groupsOf(nodes)
  const groupLabel = group === null ? "全部" : group === "" ? "未分组" : group

  return (
    <div className="dashboard-toolbar surface-card flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Dropdown label={`排序：${SORT_LABEL[sort]}，${asc ? "升" : "降"}序`} button={() => (
          <span className="toolbar-chip min-h-11 min-w-11">
            <i className="ti ti-arrows-sort text-sm text-accent" aria-hidden />
            <span>排序</span>
            <span className="chip-label">{SORT_LABEL[sort]} {asc ? "↑" : "↓"}</span>
            <i className="ti ti-chevron-down text-xs text-secondary" aria-hidden />
          </span>
        )}>
          {(close) => (
            <>
              {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                <button key={k} className={`dropdown-item ${sort === k ? "active" : ""}`}
                  onClick={() => {
                    // 再点一次当前排序即切换方向（面板保持开，便于连点）；换键则应用并收起。
                    if (sort === k) onAsc(!asc)
                    else { onSort(k); close() }
                  }}>
                  {SORT_LABEL[k]}
                  <span className="ml-auto text-xs text-secondary">{sort === k ? (asc ? "↑" : "↓") : ""}</span>
                </button>
              ))}
              <button className="dropdown-item md:hidden" aria-pressed={live} onClick={()=>onLive(!live)}>实时排序：{live ? "开启" : "关闭"}</button>
            </>
          )}
        </Dropdown>

        <Dropdown align="right" label={`分组：${groupLabel}`} button={() => (
          <span className="toolbar-chip min-h-11 min-w-11">
            <i className="ti ti-folder text-sm text-accent" aria-hidden />
            <span>分组</span>
            <span className="chip-label truncate max-w-[8em]">{groupLabel}</span>
            <i className="ti ti-chevron-down text-xs text-secondary" aria-hidden />
          </span>
        )}>
          {(close) => (
            <>
              <button className={`dropdown-item ${group === null ? "active" : ""}`}
                onClick={() => { onGroup(null); close() }}>全部分组</button>
              {groups.map((g) => (
                <button key={g} className={`dropdown-item ${group === g ? "active" : ""}`}
                  onClick={() => { onGroup(g); close() }}>{g}</button>
              ))}
              <button className={`dropdown-item ${group === "" ? "active" : ""}`}
                onClick={() => { onGroup(""); close() }}>未分组</button>
            </>
          )}
        </Dropdown>


        {filters && <button ref={filterButton} className="toolbar-chip min-h-11" aria-expanded={filterOpen} aria-controls={filterId} onClick={() => setFilterOpen(value => !value)}>更多筛选</button>}
      </div>

      <div className="flex items-center gap-2">
        <div className="toolbar-btn-group" role="group" aria-label="节点视图">
          <button className={`toolbar-btn-group-item !min-h-11 !min-w-11 ${view === "card" ? "active" : ""}`} aria-label="卡片视图"
            aria-pressed={view === "card"} title="卡片视图" onClick={() => onView("card")}>
            <i className="ti ti-layout-grid text-sm" aria-hidden />
          </button>
          <button className={`toolbar-btn-group-item !min-h-11 !min-w-11 ${view === "list" ? "active" : ""}`} aria-label="列表视图"
            aria-pressed={view === "list"} title="列表视图" onClick={() => onView("list")}>
            <i className="ti ti-list text-sm" aria-hidden />
          </button>
        </div>
        <button className="more-sort toolbar-chip min-h-11 min-w-11 hidden md:inline-flex" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
          <i className={`ti ${expanded ? "ti-chevron-up" : "ti-selector"} text-sm`} aria-hidden />
          {expanded ? "收起排序" : "更多排序"}
        </button>
      </div>

      {filters && <div id={filterId} className={`filter-options w-full border-t border-line pt-2 ${filterOpen ? "block" : "hidden"}`} onKeyDown={event => {
        if (event.key === "Escape" && !(event.target as HTMLElement).closest('.dropdown-panel')) {
          setFilterOpen(false)
          filterButton.current?.focus()
        }
      }}>{filters}</div>}
      {expanded && (
        <div className="flex w-full flex-wrap items-center gap-2 border-t border-line pt-2.5">
          {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
            <button key={k} aria-pressed={sort === k} onClick={() => onSort(k)}
              className={`toolbar-chip min-h-11 min-w-11 !py-1 ${sort === k ? "!border-accent !text-accent" : ""}`}>
              {SORT_LABEL[k]}
            </button>
          ))}
          <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-secondary">
            实时排序
            <button type="button" role="switch" aria-label="实时排序" aria-checked={live} onClick={() => onLive(!live)}
              className={`relative inline-block min-h-11 min-w-11 rounded-full transition-colors ${live ? "bg-accent" : "bg-hover"}`}>
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${live ? "left-[18px]" : "left-0.5"}`} />
            </button>
          </label>
        </div>
      )}
    </div>
  )
}
