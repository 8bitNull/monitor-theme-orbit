import { test, expect } from '@playwright/test'

// Catch an enlarged circular track or a thumb positioned against the hit target.
for (const width of [360, 390, 430, 1440]) for (const mode of ['light', 'dark'] as const) {
  test(`glass capsule stays centered inside accessible target ${width} ${mode}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.emulateMedia({ colorScheme: mode })
    await page.goto('/')
    await page.getByRole('button', { name: '主题', exact: true }).click()
    const button = page.getByRole('switch', { name: '玻璃效果' })
    const geometry = () => button.evaluate(el => {
      const target = el.getBoundingClientRect()
      const track = el.querySelector('span')!
      const thumb = track.querySelector('span') ?? track
      const t = track.getBoundingClientRect(), k = thumb.getBoundingClientRect()
      return { target: { width: target.width, height: target.height }, track: { width: t.width, height: t.height, x: t.x - target.x, y: t.y - target.y }, thumb: { width: k.width, height: k.height, x: k.x - t.x, y: k.y - t.y }, background: getComputedStyle(el).backgroundColor, trackBackground: getComputedStyle(track).backgroundColor, panelBackground: getComputedStyle(el.parentElement!.parentElement!).backgroundColor }
    })
    await expect(button).toHaveAttribute('aria-checked', 'false')
    const off = await geometry()
    expect(off.target.width).toBeGreaterThanOrEqual(44)
    expect(off.target.height).toBeGreaterThanOrEqual(44)
    expect(off.track.width).toBe(36)
    expect(off.track.height).toBe(20)
    expect(off.track.x).toBe((off.target.width - 36) / 2)
    expect(off.track.y).toBe((off.target.height - 20) / 2)
    expect(off.thumb).toEqual({ width: 16, height: 16, x: 2, y: 2 })
    expect(off.background).toBe('rgba(0, 0, 0, 0)')
    expect(off.trackBackground).not.toBe('rgba(0, 0, 0, 0)')
    expect(off.trackBackground).not.toBe(off.panelBackground)
    await page.screenshot({ path: `artifacts/acceptance/theme-switch-fix/after-${width}-${mode}-off.png` })
    // Click in the transparent area, outside the visible capsule.
    await button.click({ position: { x: 1, y: 1 } })
    await expect(button).toHaveAttribute('aria-checked', 'true')
    await expect.poll(async () => (await geometry()).thumb).toEqual({ width: 16, height: 16, x: 18, y: 2 })
    await expect(page.locator('html')).toHaveAttribute('data-glass', 'on')
    await page.screenshot({ path: `artifacts/acceptance/theme-switch-fix/after-${width}-${mode}-on.png` })
    await button.focus()
    await button.press('Space')
    await expect(button).toHaveAttribute('aria-checked', 'false')
    await expect(button).toBeFocused()
    await button.press('Enter')
    await expect(button).toHaveAttribute('aria-checked', 'true')
    expect(await page.evaluate(() => localStorage.getItem('dstatus-glass'))).toBe('on')
    await page.reload()
    await page.getByRole('button', { name: '主题', exact: true }).click()
    await expect(button).toHaveAttribute('aria-checked', 'true')
    await page.getByRole('button', { name: '恢复默认外观', exact: true }).click()
    await page.getByRole('button', { name: '主题', exact: true }).click()
    await expect(button).toHaveAttribute('aria-checked', 'false')
    expect(await page.evaluate(() => localStorage.getItem('dstatus-glass'))).toBeNull()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}

test('glass capsule responds to touch without shrinking its hit target', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })
  const page = await context.newPage()
  await page.goto('/')
  await page.getByRole('button', { name: '主题', exact: true }).tap()
  const button = page.getByRole('switch', { name: '玻璃效果' })
  const box = (await button.boundingBox())!
  await page.touchscreen.tap(box.x + 1, box.y + 1)
  await expect(button).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('html')).toHaveAttribute('data-glass', 'on')
  await context.close()
})
