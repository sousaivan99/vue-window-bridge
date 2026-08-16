import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { useWindowBridge } from '../src/useWindowBridge.js'

interface FakeChildWindow extends Window {
  closed: boolean
}

const createChildWindow = (): FakeChildWindow => {
  const child = {
    closed: false,
    close: vi.fn(() => {
      child.closed = true
    }),
    postMessage: vi.fn(),
  }

  return child as unknown as FakeChildWindow
}

class FakeBrowserWindow extends EventTarget {
  location = new URL('https://example.test/app/main')
  opener: Window | null = null
  isSecureContext = true
  screenX = 50
  screenY = 50
  innerWidth = 1200
  innerHeight = 800
  screen: Screen & {
    availLeft?: number
    availTop?: number
    isExtended?: boolean
  } = {
    availHeight: 1040,
    availWidth: 1920,
    colorDepth: 24,
    height: 1080,
    orientation: {} as ScreenOrientation,
    pixelDepth: 24,
    width: 1920,
  }
  open = vi.fn<Window['open']>()
  document = {
    documentElement: {
      requestFullscreen: vi.fn(() => Promise.resolve()),
    },
  }
  getScreenDetails?: () => Promise<{
    screens: readonly TestScreen[]
    currentScreen: TestScreen
  }>
}

interface TestScreen extends Screen {
  availLeft: number
  availTop: number
  left: number
  top: number
  isExtended?: boolean
  isPrimary: boolean
  isInternal: boolean
  label: string
  devicePixelRatio: number
}

const createScreen = (
  overrides: Partial<TestScreen> = {},
): TestScreen =>
  ({
    availHeight: 1040,
    availLeft: 0,
    availTop: 0,
    availWidth: 1920,
    colorDepth: 24,
    devicePixelRatio: 1,
    height: 1080,
    isInternal: true,
    isPrimary: true,
    label: 'Main display',
    left: 0,
    orientation: {} as ScreenOrientation,
    pixelDepth: 24,
    top: 0,
    width: 1920,
    ...overrides,
  }) as TestScreen

const useFakeWindow = (fakeWindow: FakeBrowserWindow) => {
  vi.stubGlobal('window', fakeWindow as unknown as Window)
}

const dispatchMessage = (
  browserWindow: FakeBrowserWindow,
  init: { data: unknown; origin: string; source: Window },
) => {
  const event = new Event('message') as MessageEvent
  Object.defineProperties(event, {
    data: { value: init.data },
    origin: { value: init.origin },
    source: { value: init.source },
  })
  browserWindow.dispatchEvent(event)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useWindowBridge', () => {
  it('returns an SSR-safe result when window is unavailable', async () => {
    const bridge = useWindowBridge()

    await expect(bridge.openWindow('/presentation')).resolves.toEqual({
      ok: false,
      reason: 'ssr',
    })
    await expect(bridge.enterFullscreen()).resolves.toBe(false)
    expect(bridge.isOpenedWindow()).toBe(false)
    bridge.cleanup()
  })

  it('opens a current-screen fallback with no configuration', async () => {
    const browserWindow = new FakeBrowserWindow()
    const childWindow = createChildWindow()
    browserWindow.open.mockReturnValue(childWindow)
    useFakeWindow(browserWindow)

    const bridge = useWindowBridge()
    const result = await bridge.openWindow('./presentation')

    expect(result).toMatchObject({
      ok: true,
      placement: 'current-screen',
      fallbackReason: 'window-management-unsupported',
    })
    expect(browserWindow.open).toHaveBeenCalledWith(
      'https://example.test/app/presentation',
      '_blank',
      expect.stringContaining('width=1920'),
    )
    expect(bridge.isOpen.value).toBe(true)
    expect(bridge.openedWindow.value).toBe(childWindow)

    bridge.cleanup()
  })

  it('uses ScreenDetails.currentScreen to choose the next screen', async () => {
    const browserWindow = new FakeBrowserWindow()
    const childWindow = createChildWindow()
    const mainScreen = createScreen({ isExtended: true })
    const secondScreen = createScreen({
      availLeft: 1920,
      isExtended: true,
      isInternal: false,
      isPrimary: false,
      label: 'Projector',
      left: 1920,
    })
    browserWindow.screen.isExtended = true
    browserWindow.open.mockReturnValue(childWindow)
    browserWindow.getScreenDetails = vi.fn().mockResolvedValue({
      screens: [mainScreen, secondScreen],
      currentScreen: mainScreen,
    })
    useFakeWindow(browserWindow)

    const bridge = useWindowBridge()
    const result = await bridge.openWindow('/presentation')

    expect(result).toMatchObject({ ok: true, placement: 'requested-screen' })
    expect(browserWindow.getScreenDetails).toHaveBeenCalledOnce()
    expect(browserWindow.open).toHaveBeenCalledWith(
      'https://example.test/presentation',
      '_blank',
      expect.stringContaining('left=1920'),
    )

    bridge.cleanup()
  })

  it('supports senior-friendly per-open screen and size options', async () => {
    const browserWindow = new FakeBrowserWindow()
    const childWindow = createChildWindow()
    const primaryScreen = createScreen()
    const secondScreen = createScreen({
      availLeft: -1280,
      availWidth: 1280,
      isPrimary: false,
      left: -1280,
      width: 1280,
    })
    browserWindow.screen.isExtended = true
    browserWindow.open.mockReturnValue(childWindow)
    browserWindow.getScreenDetails = vi.fn().mockResolvedValue({
      screens: [primaryScreen, secondScreen],
      currentScreen: primaryScreen,
    })
    useFakeWindow(browserWindow)

    const bridge = useWindowBridge()
    const result = await bridge.openWindow('/tool', {
      screen: 1,
      size: { width: 640, height: 480 },
      name: 'tool-window',
    })

    expect(result.ok).toBe(true)
    expect(browserWindow.open).toHaveBeenCalledWith(
      'https://example.test/tool',
      'tool-window',
      expect.stringMatching(/left=-960.*width=640.*height=480/),
    )

    bridge.cleanup()
  })

  it('rejects cross-origin URLs before opening anything', async () => {
    const browserWindow = new FakeBrowserWindow()
    useFakeWindow(browserWindow)

    const bridge = useWindowBridge()
    const result = await bridge.openWindow('https://other.example/page')

    expect(result).toEqual({ ok: false, reason: 'cross-origin-url' })
    expect(browserWindow.open).not.toHaveBeenCalled()
    bridge.cleanup()
  })

  it('reports popup blocking without leaving stale open state', async () => {
    const browserWindow = new FakeBrowserWindow()
    browserWindow.open.mockReturnValue(null)
    useFakeWindow(browserWindow)

    const bridge = useWindowBridge()
    const result = await bridge.openWindow('/presentation')

    expect(result).toEqual({ ok: false, reason: 'popup-blocked' })
    expect(bridge.isOpen.value).toBe(false)
    expect(bridge.openedWindow.value).toBeNull()
    bridge.cleanup()
  })

  it('keeps the existing window when a replacement popup is blocked', async () => {
    const browserWindow = new FakeBrowserWindow()
    const existingWindow = createChildWindow()
    browserWindow.open
      .mockReturnValueOnce(existingWindow)
      .mockReturnValueOnce(null)
    useFakeWindow(browserWindow)

    const bridge = useWindowBridge()
    await bridge.openWindow('/first')
    const result = await bridge.openWindow('/replacement')

    expect(result).toEqual({ ok: false, reason: 'popup-blocked' })
    expect(bridge.isOpen.value).toBe(true)
    expect(bridge.openedWindow.value).toBe(existingWindow)
    expect(existingWindow.close).not.toHaveBeenCalled()
    bridge.cleanup()
  })

  it('reports denied placement permission when fallback is disabled', async () => {
    const browserWindow = new FakeBrowserWindow()
    browserWindow.screen.isExtended = true
    browserWindow.getScreenDetails = vi
      .fn()
      .mockRejectedValue(new DOMException('Denied', 'NotAllowedError'))
    useFakeWindow(browserWindow)

    const bridge = useWindowBridge({ fallback: 'fail' })
    const result = await bridge.openWindow('/presentation')

    expect(result).toMatchObject({ ok: false, reason: 'permission-denied' })
    expect(browserWindow.open).not.toHaveBeenCalled()
    bridge.cleanup()
  })

  it('only receives versioned data from the tracked same-origin window', async () => {
    const browserWindow = new FakeBrowserWindow()
    const childWindow = createChildWindow()
    const unrelatedWindow = createChildWindow()
    browserWindow.open.mockReturnValue(childWindow)
    useFakeWindow(browserWindow)

    const bridge = useWindowBridge<string>()
    await bridge.openWindow('/presentation')

    dispatchMessage(browserWindow, {
      data: { __vueWindowBridge: 2, type: 'data', payload: 'wrong source' },
      origin: browserWindow.location.origin,
      source: unrelatedWindow,
    })
    dispatchMessage(browserWindow, {
      data: { __vueWindowBridge: 2, type: 'data', payload: 'wrong origin' },
      origin: 'https://other.example',
      source: childWindow,
    })
    dispatchMessage(browserWindow, {
      data: 'unwrapped data',
      origin: browserWindow.location.origin,
      source: childWindow,
    })

    expect(bridge.receivedData.value).toBeNull()

    dispatchMessage(browserWindow, {
      data: { __vueWindowBridge: 2, type: 'data', payload: 'hello' },
      origin: browserWindow.location.origin,
      source: childWindow,
    })
    expect(bridge.receivedData.value).toBe('hello')

    bridge.cleanup()
  })

  it('sends wrapped data to the opened window', async () => {
    const browserWindow = new FakeBrowserWindow()
    const childWindow = createChildWindow()
    browserWindow.open.mockReturnValue(childWindow)
    useFakeWindow(browserWindow)

    const bridge = useWindowBridge<unknown, { answer: number }>()
    await bridge.openWindow('/presentation')

    expect(bridge.sendToWindow({ answer: 42 })).toBe(true)
    expect(childWindow.postMessage).toHaveBeenCalledWith(
      {
        __vueWindowBridge: 2,
        type: 'data',
        payload: { answer: 42 },
      },
      browserWindow.location.origin,
    )

    bridge.cleanup()
  })

  it('sends data back to the main window from an opened window', () => {
    const browserWindow = new FakeBrowserWindow()
    const mainWindow = createChildWindow()
    browserWindow.opener = mainWindow
    useFakeWindow(browserWindow)

    const bridge = useWindowBridge<unknown, string>()

    expect(bridge.isOpenedWindow()).toBe(true)
    expect(bridge.sendToMainWindow('ready')).toBe(true)
    expect(mainWindow.postMessage).toHaveBeenCalledWith(
      { __vueWindowBridge: 2, type: 'data', payload: 'ready' },
      browserWindow.location.origin,
    )

    bridge.cleanup()
  })

  it('clears state even when the owned window was already closed', async () => {
    const browserWindow = new FakeBrowserWindow()
    const childWindow = createChildWindow()
    browserWindow.open.mockReturnValue(childWindow)
    useFakeWindow(browserWindow)

    const bridge = useWindowBridge()
    await bridge.openWindow('/presentation')
    childWindow.closed = true

    bridge.closeWindow()

    expect(bridge.isOpen.value).toBe(false)
    expect(bridge.openedWindow.value).toBeNull()
    bridge.cleanup()
  })

  it('enters fullscreen from the current window and reports success', async () => {
    const browserWindow = new FakeBrowserWindow()
    useFakeWindow(browserWindow)

    const bridge = useWindowBridge()

    await expect(bridge.enterFullscreen()).resolves.toBe(true)
    expect(
      browserWindow.document.documentElement.requestFullscreen,
    ).toHaveBeenCalledOnce()
    bridge.cleanup()
  })

  it('cleans up automatically when its Vue scope is stopped', async () => {
    const browserWindow = new FakeBrowserWindow()
    const childWindow = createChildWindow()
    browserWindow.open.mockReturnValue(childWindow)
    useFakeWindow(browserWindow)
    const scope = effectScope()
    const bridge = scope.run(() => useWindowBridge())

    expect(bridge).toBeDefined()
    await bridge!.openWindow('/presentation')
    scope.stop()

    expect(childWindow.close).toHaveBeenCalledOnce()
    expect(bridge!.isOpen.value).toBe(false)
  })
})
