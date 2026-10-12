export const SYNTHETIC_DATA_VERSION = "dstatus-v1-1790800000"

export function makeNodes(count, options = {}) {
const G = 1024 ** 3
const now = options.now ?? Math.floor(Date.now() / 1000)

function mkNode(id, name, country, group, opts = {}) {
  const memTotal = 8 * G
  const diskTotal = 512 * G
  const cpu = opts.offline ? 0 : 8 + ((id * 7.3) % 40)
  const memUsed = opts.offline ? 0 : memTotal * (0.25 + ((id * 3.7) % 40) / 100)
  const diskUsed = diskTotal * (0.3 + ((id * 5.1) % 30) / 100)
  return {
    id, name, sort: id, public: true, online: !opts.offline, country, group,
    last_seen: now - (opts.offline ? 86400 * 38 : 3),
    metrics: opts.offline ? null : {
      uptime: 38 * 86400 + id * 3600, cpu,
      load: [0.15 + id * 0.01, 0.13, 0.12],
      mem_total: memTotal, mem_used: memUsed,
      swap_total: 2 * G, swap_used: 0.02 * 2 * G,
      disk_total: diskTotal, disk_used: diskUsed,
      net_rx: (5 + ((id * 9.1) % 30)) * 125_000,
      net_tx: (4 + ((id * 7.7) % 25)) * 125_000,
      total_rx: (100 + id * 20) * G, total_tx: (60 + id * 12) * G,
      month_rx: (40 + id * 10) * G, month_tx: (10 + id * 2) * G,
      tcp: 12 + id, udp: 3 + (id % 5), procs: 80 + id * 3,
    },
    os: ["Debian 12", "Ubuntu 22.04", "Windows Server 2022", "Alpine 3.19"][id % 4],
    kernel: "6.1.0-18-amd64", arch: "x86_64", virt: "kvm",
    cpu_name: "Demo Synthetic CPU", cpu_cores: 4,
    mem_total: memTotal, swap_total: 2 * G, disk_total: diskTotal,
    agent_version: "1.8.2",
    price: [18, 25, 12, 30][id % 4], currency: "CNY", billing_cycle: "monthly",
    expires_at: opts.noExpiry ? null : "2026-10-04",
    expires_in: opts.noExpiry ? null : 4,
    traffic_limit: 0, traffic_mode: "sum", traffic_reset_day: 1,
    total_rx: (100 + id * 20) * G, total_tx: (60 + id * 12) * G,
    month_rx: (40 + id * 10) * G, month_tx: (10 + id * 2) * G,
    month_used: (50 + id * 12) * G,
    month_start: "2026-09-01", day_rx: 2 * G, day_tx: 1 * G,
    // 管理员帧才有的字段（ADMIN 时同时下发，模拟登录态）
    ...(ADMIN ? {
      ip: "203.0.113." + (10 + id),
      ipv4: "203.0.113." + (10 + id),
      ipv6: id % 2 ? "2001:db8::" + id : "",
      addresses: [
        { address: "203.0.113." + (10 + id), source: id % 3 === 0 ? "manual" : "interface" },
        ...(id % 2 ? [{ address: "2001:db8::" + id, source: "interface" }] : []),
      ],
      hostname: "demo-host-" + String(id).padStart(2, "0"),
      remark: id % 4 === 0 ? "测试备注 · 黑五机" : "",
      interval: 2,
      country_pin: id % 5 === 0 ? "US" : "",
      country_auto: country,
    } : {}),
  }
}

const ADMIN = options.admin === true

const nodes = [
  mkNode(1, "Demo 北京 01", "CN", "demo"),
  mkNode(2, "Demo 上海 02", "CN", "demo"),
  mkNode(3, "Demo 广州 03", "CN", "demo"),
  mkNode(4, "Demo 香港 04", "HK", "demo"),
  mkNode(5, "Demo 东京 05", "JP", "demo"),
  mkNode(6, "Demo 新加坡 06", "SG", "demo"),
  mkNode(7, "Demo 洛杉矶 07", "US", "demo"),
  mkNode(8, "Demo 纽约 08", "US", "demo"),
  mkNode(9, "Demo 达拉斯 09", "US", "demo"),
  mkNode(10, "Demo 法兰克福 10", "DE", "demo"),
  mkNode(11, "Demo 阿姆斯特丹 11", "NL", "demo"),
  mkNode(12, "Demo 伦敦 12", "GB", "demo"),
  mkNode(13, "Demo 圣何塞 13", "US", "edge"),
  mkNode(14, "Demo 首尔 14", "KR", "edge"),
  mkNode(15, "Demo 离线节点 15", "CN", "edge", { offline: true }),
  mkNode(16, "Demo 悉尼 16", "AU", "edge", { noExpiry: true }),
]

for (let id = 17; id <= count; id++) nodes.push(mkNode(id, `Demo Synthetic ${id}`, ["CN", "US", "DE", "JP"][id % 4], id % 3 ? "demo" : "edge"))
return nodes.slice(0, count)
}
