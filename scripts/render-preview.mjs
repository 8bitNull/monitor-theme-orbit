// Start the built mock server first: MOCK_PORT=8796 node mock-server.mjs
import { chromium } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { mkdir } from 'node:fs/promises'

const root = fileURLToPath(new URL('../', import.meta.url))
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 1 })
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'))
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  let configLoaded = false
  page.on('response', response => {
    if (response.url().endsWith('/api/themes/orbit/config') && response.ok()) configLoaded = true
  })
  await page.goto(process.env.PREVIEW_HUB || 'http://127.0.0.1:8796', { waitUntil: 'networkidle' })
  await page.getByText('Demo 北京 01', { exact: true }).waitFor()
  await page.evaluate(() => document.fonts.ready)
  await mkdir(resolve(root, 'docs/branding'), { recursive: true })
  await page.screenshot({ path: resolve(root, 'docs/branding/dashboard-dark.png'), clip: { x: 0, y: 0, width: 1440, height: 980 } })
  if (!configLoaded) throw new Error('Orbit theme configuration did not load')
  if (errors.length) throw new Error(errors.join('\n'))
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto(new URL('../docs/branding/preview.html', import.meta.url).href)
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode())) })
  await page.screenshot({ path: resolve(root, 'preview.png') })
  console.log('preview.png: 1600 × 900; live dashboard captured; Orbit configuration loaded; no browser errors')
} finally {
  await browser.close()
}
