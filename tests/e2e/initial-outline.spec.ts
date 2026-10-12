import { test, expect, type Locator } from '@playwright/test'

// Removing the route-main exception restores the unwanted page-sized blue ring.
async function expectUnoutlinedMain(main: Locator) {
  await expect(main).toBeFocused()
  await expect(main).toHaveAttribute('tabindex', '-1')
  expect(await main.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('none')
}

for (const width of [390, 1440]) for (const mode of ['light', 'dark'] as const) for (const route of ['/', '/network-quality', '/stats/1/']) {
  test(`automatic route focus has no page outline ${width} ${mode} ${route}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.emulateMedia({ colorScheme: mode })
    await page.goto(route)
    await expectUnoutlinedMain(page.locator('main'))
    if (width === 390 && mode === 'light' && route === '/') await page.screenshot({ path: 'artifacts/acceptance/initial-outline-fix/after.png' })
  })
}

test('keyboard controls retain rings and SPA destination retains main focus', async ({ page }) => {
  await page.goto('/')
  await expectUnoutlinedMain(page.locator('main'))
  await page.keyboard.press('Tab')
  expect(await page.evaluate(() => document.activeElement?.matches(':focus-visible'))).toBe(true)
  expect(await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle)).toBe('solid')
  const theme = page.getByRole('button', { name: '主题', exact: true })
  await theme.focus()
  expect(await theme.evaluate(el => getComputedStyle(el).outlineWidth)).toBe('2px')
  await theme.press('Enter')
  await expect(page.getByRole('switch', { name: '玻璃效果' })).toBeVisible()
  await theme.click()
  const quality = page.getByRole('link', { name: '网络质量', exact: true })
  await quality.focus()
  expect(await quality.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid')
  await quality.press('Enter')
  await expect(page.getByRole('heading', { name: '网络质量监控' })).toBeVisible()
  await expectUnoutlinedMain(page.locator('main'))
  const input = page.getByPlaceholder('搜索节点名称')
  await input.focus()
  expect(await input.evaluate(el => el.matches(':focus-visible') && getComputedStyle(el).outlineStyle === 'solid')).toBe(true)
  await input.fill('Demo')
  await expect(input).toHaveValue('Demo')
})

test('identity loading route main has no outline', async ({ page }) => {
  let release!: () => void
  const gate = new Promise<void>(r => release = r)
  await page.route('**/api/me', async route => { await gate; await route.continue() })
  try {
    await page.goto('/')
    await expect(page.getByText('正在确认身份…')).toBeVisible()
    await expectUnoutlinedMain(page.locator('main'))
  } finally { release() }
})

test('failed destination main has no outline while retry retains its ring', async ({ page }) => {
  await page.route('**/assets/DetailPage-*.js', route => route.abort())
  await page.goto('/stats/1/')
  const retry = page.getByRole('button', { name: '重新加载', exact: true })
  await expect(retry).toBeVisible()
  await expectUnoutlinedMain(page.locator('main'))
  await page.keyboard.press('Tab')
  await retry.focus()
  expect(await retry.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid')
})
