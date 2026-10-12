// 本地预览用的 mock hub：只服务 dist/ 与公开接口的假数据，不随主题打包。
import http from "node:http"
import { gzipSync } from "node:zlib"
import { createHash } from "node:crypto"
import { makeNodes } from "./tests/performance/synthetic-data.mjs"
import { readFile, stat } from "node:fs/promises"
import { join, extname } from "node:path"

const ROOT = process.env.MOCK_DIST || new URL("./dist", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")
const PORT = Number(process.env.MOCK_PORT ?? 8787)

const ADMIN = process.env.MOCK_ADMIN === "1"
const fixedTs = process.env.MOCK_FIXED_TS === undefined ? null : Number(process.env.MOCK_FIXED_TS)
const clockSeconds = () => fixedTs ?? Math.floor(Date.now() / 1000)
const nodes = makeNodes(Number(process.env.MOCK_NODE_COUNT ?? 16), {admin: ADMIN, now: clockSeconds()})
const compress = process.env.MOCK_GZIP === "1"
function send(req, res, status, type, body, cacheControl = "no-store") {
  const source = Buffer.isBuffer(body) ? body : Buffer.from(body)
  const gzip = compress && /\bgzip\b/.test(req.headers["accept-encoding"] || "") && /json|javascript|text\//.test(type)
  res.writeHead(status, {"content-type": type, "cache-control": cacheControl, "vary": "Accept-Encoding", ...(gzip ? {"content-encoding": "gzip"} : {})})
  res.end(gzip ? gzipSync(source) : source)
}
function wsFrame(text) {
  const data = Buffer.from(text)
  const header = Buffer.alloc(data.length < 126 ? 2 : data.length <= 65535 ? 4 : 10)
  header[0] = 0x81
  if (data.length < 126) header[1] = data.length
  else if (data.length <= 65535) { header[1] = 126; header.writeUInt16BE(data.length, 2) }
  else { header[1] = 127; header.writeBigUInt64BE(BigInt(data.length), 2) }
  return Buffer.concat([header, data])
}

function sampleStep(hours, points) {
  const budget = Math.max(60, Math.min(1440, Math.floor(points)))
  return 60 * Math.max(1, Math.ceil(hours * 60 / budget))
}
function history(id, hours, budget) {
  const points = []
  const step = sampleStep(hours, budget)
  const end = Math.floor(clockSeconds() / step) * step
  for (let i = Math.floor(hours * 3600 / step); i >= 0; i--) {
    const ts = end - i * step
    const n = nodes.find((x) => x.id === id)
    const wave = (t) => Math.sin(t / 900 + id) * 0.5 + Math.sin(t / 260) * 0.5
    points.push({
      ts,
      cpu: n?.metrics ? Math.max(1, n.metrics.cpu + wave(ts) * 6) : 0,
      mem_used: n?.metrics ? n.metrics.mem_used * (0.98 + wave(ts) * 0.02) : 0,
      disk_used: n?.metrics ? n.metrics.disk_used : 0,
      net_rx: n?.metrics ? n.metrics.net_rx * (0.6 + wave(ts) * 0.5) : 0,
      net_tx: n?.metrics ? n.metrics.net_tx * (0.6 + wave(ts + 500) * 0.5) : 0,
    })
  }
  return points
}

function pingHistory(id, hours, points) {
  const probes = { 1: "Demo·国内入口", 2: "Demo·全球入口", 3: "Demo·边缘链路" }
  const rows = []
  const step = sampleStep(hours, points)
  const end = Math.floor(clockSeconds() / step) * step
  for (let i = Math.floor(hours * 3600 / step); i >= 0; i--) {
    for (const taskId of [1, 2, 3]) {
      const ts = end - i * step
      rows.push({
        task_id: taskId, ts,
        latency: 40 + taskId * 30 + Math.abs(Math.sin(ts / 420 + id)) * 40,
        loss: taskId === 3 ? 3.5 : 0.2,
      })
    }
  }
  return { ping: rows, probes, loss: { 3: 3.4 } }
}


const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json",
  ".woff2": "font/woff2", ".ico": "image/x-icon",
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost")
  const path = url.pathname
  const json = (data) => {
    send(req, res, 200, "application/json", JSON.stringify(data))
  }
  if (path === "/api/me") return json({ authed: ADMIN, github: false, site_name: "Orbit", public_page: true })
  if (path === "/api/themes/orbit/config") return json({})
  if (path === "/api/nodes") return json({ nodes, admin: ADMIN })
  const m = path.match(/^\/api\/nodes\/(\d+)\/metrics$/)
  if (m) {
    const id = Number(m[1])
    if (!nodes.some(node => node.id === id)) {
      return send(req, res, 404, "text/plain", "Unknown synthetic node")
    }
    const positive = (value, fallback) => Number.isFinite(value) && value > 0 ? value : fallback
    const hours = Math.min(168, positive(Number(url.searchParams.get("hours") ?? 24), 24))
    const points = positive(Number(url.searchParams.get("points") ?? 288), 288)
    const series = url.searchParams.get("series")
    if (series === "metrics") return json({ metrics: history(id, hours, points) })
    if (series === "ping") return json(pingHistory(id, hours, points))
    return json({ metrics: history(id, hours, points), ...pingHistory(id, hours, points) })
  }
  if (path.startsWith("/api/")) {
    return send(req, res, 404, "text/plain", "没有这个接口")
  }
  // 静态文件 + SPA 回退
  let file = join(ROOT, path === "/" ? "index.html" : path.slice(1))
  try {
    const st = await stat(file)
    if (st.isDirectory()) file = join(file, "index.html")
  } catch {
    file = join(ROOT, "index.html")
  }
  try {
    const data = await readFile(file)
    send(req, res, 200, MIME[extname(file)] ?? "application/octet-stream", data, extname(file) === ".html" ? "no-cache" : /[.-][A-Za-z0-9_-]{8,}\./.test(file) ? "public,max-age=31536000,immutable" : "no-cache")
  } catch {
    send(req, res, 404, "text/plain", "not found")
  }
})
server.on("upgrade", (req, socket) => {
  const key = req.headers["sec-websocket-key"]
  if (process.env.MOCK_WS !== "1" || new URL(req.url, "http://localhost").pathname !== "/api/ws" || req.headers.upgrade?.toLowerCase() !== "websocket" || typeof key !== "string" || !/^[A-Za-z0-9+/]{22}==$/.test(key)) {
    socket.destroy(); return
  }
  const accept = createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64")
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`)
  const publish = () => { if (!socket.destroyed) socket.write(wsFrame(JSON.stringify({nodes, admin: ADMIN}))) }
  publish()
  const interval = setInterval(publish, 2000)
  const close = () => { clearInterval(interval); socket.destroy() }
  socket.on("close", close)
  socket.on("end", close)
  socket.on("error", close)
})
server.listen(PORT, () => console.log(`mock hub on http://127.0.0.1:${PORT}`))
