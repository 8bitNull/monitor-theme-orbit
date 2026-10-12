import { useState } from "react"
import { Flag } from "@/lib/flags"
import { countryName } from "@/lib/country"
import type { Node } from "@/lib/api"

/**
 * IP 与节点信息页。hub 出于安全设计从不对匿名访客下发节点地址，地址、主机名、
 * 备注等只出现在登录管理员看到的帧里；IP 质量检测也不在 hub 的数据范围内。
 * 因此本页按身份分流：管理员看到真实地址与来源，访客看到归属地与身份说明，
 * 不保留 DStatus 依赖其自有探针端的"质量检测"空壳。
 */

type AddressEntry = { address: string; source: string }

type AdminNode = Node & {
  ip?: string
  ipv4?: string
  ipv6?: string
  addresses?: AddressEntry[]
  hostname?: string
  remark?: string
  interval?: number
  country_pin?: string
  country_auto?: string
}

const SOURCE_LABEL: Record<string, string> = {
  manual: "手动指定",
  interface: "接口上报",
  exit: "连接出口",
}

export function IpInfo({ node, authed }: { node: Node; authed: boolean }) {
  const admin = node as AdminNode
  const addresses = authed ? admin.addresses?.length ? admin.addresses : [...new Set([admin.ipv4, admin.ipv6, admin.ip].filter((a): a is string => !!a))].map(address => ({ address, source: "unknown" })) : []

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold">{authed ? "IP 与节点信息" : "归属地与节点信息"}</h1>
          {authed && <a href="/admin/" className="inline-flex min-h-11 items-center underline">查看后台</a>}
          <p className="text-xs text-secondary">{authed ? "管理员视图" : "公开视图"}</p>
        </div>
      </section>

      {authed ? (
        <AdminBody node={admin} addresses={addresses} />
      ) : (
        <VisitorBody node={node} />
      )}
    </div>
  )
}

/* ---------- 管理员视图 ---------- */

function AdminBody({ node, addresses }: { node: AdminNode; addresses: AddressEntry[] }) {
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "主机名", value: node.hostname || null },
    { label: "备注", value: node.remark || null },
    { label: "Agent 版本", value: node.agent_version || null },
    {
      label: "上报间隔",
      value: node.interval && node.interval > 0 ? `每 ${node.interval >= 60 ? `${Math.round(node.interval / 60)} 分钟` : `${node.interval} 秒`}` : null,
    },
    { label: "系统", value: node.os || null },
    { label: "内核", value: node.kernel || null },
    { label: "架构", value: node.arch || null },
    { label: "虚拟化", value: node.virt || null },
  ].filter((r) => r.value !== null && r.value !== "")

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <section className="surface-card p-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <i className="ti ti-link text-accent" aria-hidden />节点地址
          </h2>
          {addresses.length ? (
            <div className="mt-3 space-y-2">
              {addresses.map((a) => (
                <div key={a.address} className="flex items-center justify-between gap-2 rounded-lg bg-inner px-3 py-2.5">
                  <code className="min-w-0 flex-1 break-all text-sm" style={{ direction: "ltr" }}>{a.address}</code>
                  <span className="shrink-0 rounded-md bg-hover px-2 py-0.5 text-[11px] text-secondary">
                    {SOURCE_LABEL[a.source] ?? "来源未提供"}
                  </span>
                  <CopyButton text={a.address} />
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-lg border border-dashed border-line py-8 text-center text-sm text-secondary">
              节点未上报任何地址
            </p>
          )}
          <p className="mt-3 text-[11px] text-secondary">
            地址仅登录管理员可见，访客看到的始终是"已隐藏"。
          </p>
        </section>

        <section className="surface-card p-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <i className="ti ti-info-circle text-accent" aria-hidden />节点身份
          </h2>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            {rows.map((r) => (
              <div key={r.label} className="min-w-0">
                <dt className="text-xs text-secondary">{r.label}</dt>
                <dd className="mt-0.5 break-all text-sm text-main" title={typeof r.value === "string" ? r.value : undefined}>
                  {r.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <GeoCard
        node={node}
        sourceLabel={node.country_pin ? "手动指定" : node.country_auto ? "自动识别" : null}
        note="归属地取自节点连接来源的查询结果，或由管理员手动指定。"
      />
    </div>
  )
}

/* ---------- 访客视图 ---------- */

function VisitorBody({ node }: { node: Node }) {
  return <section className="surface-card p-4">
    <h2 className="text-base font-semibold">节点信息</h2>
    <dl className="mt-3 grid grid-cols-2 gap-3">
      <div><dt className="text-xs text-secondary">归属地</dt><dd className="mt-1 flex items-center gap-2 text-sm"><Flag code={node.country} title={node.country} />{node.country ? countryName(node.country) : "暂未确定"}</dd></div>
      {[{label:"系统",value:node.os},{label:"架构",value:node.arch},{label:"虚拟化",value:node.virt}].filter(row=>row.value).map(row=><div key={row.label} className="min-w-0"><dt className="text-xs text-secondary">{row.label}</dt><dd className="mt-1 break-words text-sm">{row.value}</dd></div>)}
      <div><dt className="text-xs text-secondary">节点地址</dt><dd className="mt-1 text-sm">已隐藏</dd></div>
    </dl>
    <p className="mt-3 border-t border-line pt-3 text-xs text-secondary">归属地仅表示国家或地区。节点地址与完整信息仅登录管理员可见。</p>
  </section>
}

/* ---------- 共用 ---------- */

function GeoCard({ node, sourceLabel, note }: {
  node: Node
  sourceLabel: string | null
  note: string
}) {
  return (
    <section className="surface-card h-fit p-4">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <i className="ti ti-map-2 text-accent" aria-hidden />归属地
      </h2>
      <div className="mt-4 flex items-center gap-3">
        {node.country ? (
          <>
            <Flag code={node.country} title={node.country} />
            <div>
              <div className="text-lg font-bold">{countryName(node.country)}</div>
              <div className="text-xs text-secondary">{node.country}</div>
            </div>
          </>
        ) : (
          <div className="text-sm text-secondary">暂未确定归属地</div>
        )}
        {sourceLabel && (
          <span className="ml-auto rounded-md bg-hover px-2 py-0.5 text-[11px] text-secondary">{sourceLabel}</span>
        )}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-secondary">{note}</p>
    </section>
  )
}

function CopyButton({ text }: { text: string }) {
  const [result, setResult] = useState("")
  return (
    <span>
    <button
      type="button"
      aria-label="复制地址"
      title="复制"
      className="shrink-0 min-h-11 min-w-11 rounded-md p-1.5 text-secondary transition-colors hover:bg-hover hover:text-accent"
      onClick={async () => {
        try {
          if (!navigator.clipboard) throw new Error('Clipboard unavailable')
          await navigator.clipboard.writeText(text)
          setResult("已复制")
        } catch { setResult("复制失败，请手动选择地址") }
      }}
    >
      <i className={`ti ${result === "已复制" ? "ti-circle-check text-success" : "ti-copy"} text-xs`} aria-hidden />
    </button>
    <span role="status" className="text-xs">{result}</span>
    </span>
  )
}
