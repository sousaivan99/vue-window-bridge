import { expect, test, type Page } from '@playwright/test'

interface BrowserBridgeState {
  isOpen: { value: boolean }
  receivedData: { value: unknown }
  sendToWindow(data: unknown): boolean
  sendToMainWindow(data: unknown): boolean
}

interface BridgeTestWindow extends Window {
  lastOpenResult: null | {
    ok: boolean
    placement?: string
    fallbackReason?: string
  }
  testBridge: BrowserBridgeState
}

interface WindowWithScreenDetails extends Window {
  getScreenDetails(): Promise<{
    screens: readonly {
      availLeft: number
      availWidth: number
      label: string
    }[]
  }>
}

const bridgeResult = (page: Page) =>
  page.evaluate(() => {
    const testWindow = window as unknown as BridgeTestWindow
    const result = testWindow.lastOpenResult
    if (!result) return null

    return {
      ok: result.ok,
      placement: result.placement,
      fallbackReason: result.fallbackReason,
    }
  })

test('opens a real current-screen fallback popup', async ({ page, browserName }) => {
  await page.goto('/tests/e2e/fixtures/main.html')
  const popupPromise = page.waitForEvent('popup')
  await page.getByRole('button', { name: 'Open window' }).click()
  const popup = await popupPromise
  await popup.waitForLoadState('domcontentloaded')

  await expect.poll(() => bridgeResult(page)).toMatchObject({
    ok: true,
    placement: 'current-screen',
  })
  await expect(popup.locator('#ready')).toHaveText('Child ready')

  const result = await bridgeResult(page)
  expect(result?.fallbackReason).toBe(
    browserName === 'firefox'
      ? 'window-management-unsupported'
      : 'single-screen',
  )

  await popup.close()
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as BridgeTestWindow).testBridge.isOpen.value,
      ),
    )
    .toBe(false)
})

test('places and connects a popup on an emulated second Chromium screen', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Chromium CDP provides virtual screens')

  const cdp = await page.context().newCDPSession(page)
  const origin = 'http://127.0.0.1:4173'
  const { targetInfo } = await cdp.send('Target.getTargetInfo')

  await cdp.send('Emulation.addScreen', {
    left: 1280,
    top: 0,
    width: 1024,
    height: 768,
    workAreaInsets: { top: 0, left: 0, bottom: 40, right: 0 },
    devicePixelRatio: 1,
    label: 'Virtual second display',
    isInternal: false,
  })
  await cdp.send('Browser.setPermission', {
    permission: { name: 'window-management' },
    setting: 'granted',
    origin,
    browserContextId: targetInfo.browserContextId,
  })

  await page.goto('/tests/e2e/fixtures/main.html')
  const screens = await page.evaluate(async () => {
    const details = await (
      window as unknown as WindowWithScreenDetails
    ).getScreenDetails()
    return details.screens.map((screen) => ({
      left: screen.availLeft,
      width: screen.availWidth,
      label: screen.label,
    }))
  })
  expect(screens).toHaveLength(2)
  expect(screens).toContainEqual(
    expect.objectContaining({ left: 1280, label: 'Virtual second display' }),
  )

  const popupPromise = page.waitForEvent('popup')
  await page.getByRole('button', { name: 'Open window' }).click()
  const popup = await popupPromise
  await popup.waitForLoadState('domcontentloaded')

  await expect.poll(() => bridgeResult(page)).toEqual({
    ok: true,
    placement: 'requested-screen',
  })
  await expect.poll(() => popup.evaluate(() => window.screenX)).toBe(1280)

  expect(
    await page.evaluate(() =>
      (window as unknown as BridgeTestWindow).testBridge.sendToWindow({
        from: 'main',
      }),
    ),
  ).toBe(true)
  await expect
    .poll(() =>
      popup.evaluate(
        () =>
          (window as unknown as BridgeTestWindow).testBridge.receivedData.value,
      ),
    )
    .toEqual({ from: 'main' })

  expect(
    await popup.evaluate(() =>
      (window as unknown as BridgeTestWindow).testBridge.sendToMainWindow({
        from: 'child',
      }),
    ),
  ).toBe(true)
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as BridgeTestWindow).testBridge.receivedData.value,
      ),
    )
    .toEqual({ from: 'child' })

  await popup.close()
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as BridgeTestWindow).testBridge.isOpen.value,
      ),
    )
    .toBe(false)
})
