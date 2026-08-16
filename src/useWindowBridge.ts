import {
  getCurrentScope,
  onScopeDispose,
  ref,
  shallowRef,
  shallowReadonly,
  toRaw,
  type Ref,
  type ShallowRef,
} from 'vue'

/** A simple way to choose where the new window should appear. */
export type ScreenChoice = 'next' | 'primary' | 'current' | number

/**
 * `maximized` fills the screen's available area without entering HTML fullscreen.
 * A custom size is centered on the chosen screen.
 */
export type WindowSize =
  | 'maximized'
  | 'windowed'
  | { width: number; height: number }

export type WindowFallback = 'open-current' | 'fail'

export interface WindowBridgeDebugEvent {
  action: string
  details?: unknown
}

export type WindowBridgeLogger = (event: WindowBridgeDebugEvent) => void

/** Optional settings. Calling `useWindowBridge()` with no settings is supported. */
export interface WindowBridgeOptions {
  /** Screen used by default. Defaults to `next`. */
  screen?: ScreenChoice
  /** Window size used by default. Defaults to `maximized`. */
  size?: WindowSize
  /** A reusable browser window name. Defaults to `_blank`. */
  name?: string
  /** What to do when exact screen placement is unavailable. Defaults to `open-current`. */
  fallback?: WindowFallback
  /** Print debug events, or receive them with a custom logger. */
  debug?: boolean | WindowBridgeLogger
  /** How often to check whether the opened window was closed. Defaults to 1000 ms. */
  checkInterval?: number
}

/** Settings that can be changed for one `openWindow()` call. */
export interface OpenWindowOptions {
  screen?: ScreenChoice
  size?: WindowSize
  name?: string
  fallback?: WindowFallback
}

export type WindowPlacement = 'requested-screen' | 'current-screen'

export type WindowFallbackReason =
  | 'window-management-unsupported'
  | 'insecure-context'
  | 'single-screen'
  | 'permission-denied'
  | 'screen-details-failed'

export type OpenWindowFailureReason =
  | 'ssr'
  | 'invalid-url'
  | 'cross-origin-url'
  | 'invalid-options'
  | 'permission-denied'
  | 'screen-details-failed'
  | 'target-unavailable'
  | 'popup-blocked'

export type OpenWindowResult =
  | {
      ok: true
      window: Window
      placement: WindowPlacement
      fallbackReason?: WindowFallbackReason
    }
  | {
      ok: false
      reason: OpenWindowFailureReason
      error?: unknown
    }

export interface WindowBridge<Received = unknown, Sent = unknown> {
  /** The window opened by this bridge. Most apps only need `isOpen`. */
  openedWindow: Readonly<ShallowRef<Window | null>>
  /** Whether the window opened by this bridge is still open. */
  isOpen: Readonly<Ref<boolean>>
  /** The latest data received from the other window. */
  receivedData: Readonly<ShallowRef<Received | null>>
  /** Open a same-origin page. Call this directly from a click or key handler. */
  openWindow: (url: string | URL, options?: OpenWindowOptions) => Promise<OpenWindowResult>
  /** Send data from the main window to its opened window. */
  sendToWindow: (data: Sent) => boolean
  /** Send data from an opened window back to its main window. */
  sendToMainWindow: (data: Sent) => boolean
  /** Close the window owned by this bridge. */
  closeWindow: () => void
  /** Whether this page was opened by another browser window. */
  isOpenedWindow: () => boolean
  /** Enter HTML fullscreen. Call this directly from a user interaction in this window. */
  enterFullscreen: () => Promise<boolean>
  /** Remove listeners, stop timers, and close the owned window. */
  cleanup: () => void
}

interface ScreenWithPosition extends Screen {
  availLeft: number
  availTop: number
  left: number
  top: number
  isExtended?: boolean
  isPrimary?: boolean
}

interface DetailedScreen extends ScreenWithPosition {
  isPrimary: boolean
  isInternal: boolean
  label: string
  devicePixelRatio: number
}

interface ScreenDetailsLike extends EventTarget {
  readonly screens: readonly DetailedScreen[]
  readonly currentScreen: DetailedScreen
}

interface WindowWithManagement extends Window {
  getScreenDetails?: () => Promise<ScreenDetailsLike>
}

interface ResolvedOpenOptions {
  screen: ScreenChoice
  size: WindowSize
  name: string
  fallback: WindowFallback
}

interface WindowRectangle {
  left: number
  top: number
  width: number
  height: number
}

interface BridgeMessage {
  __vueWindowBridge: 2
  type: 'data'
  payload: unknown
}

const DEFAULT_WINDOW_WIDTH = 800
const DEFAULT_WINDOW_HEIGHT = 600
const MESSAGE_MARKER = 2 as const

const isBridgeMessage = (value: unknown): value is BridgeMessage => {
  if (!value || typeof value !== 'object') return false

  const message = value as Partial<BridgeMessage>
  return message.__vueWindowBridge === MESSAGE_MARKER && message.type === 'data'
}

const isPositiveNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0

const isValidScreenChoice = (screen: ScreenChoice): boolean =>
  screen === 'next' ||
  screen === 'primary' ||
  screen === 'current' ||
  (Number.isInteger(screen) && screen >= 0)

const isValidSize = (size: WindowSize): boolean =>
  size === 'maximized' ||
  size === 'windowed' ||
  (typeof size === 'object' &&
    isPositiveNumber(size.width) &&
    isPositiveNumber(size.height))

const screenRectangle = (screen: ScreenWithPosition): WindowRectangle => ({
  left: screen.availLeft,
  top: screen.availTop,
  width: screen.availWidth,
  height: screen.availHeight,
})

const currentScreenRectangle = (browserWindow: Window): WindowRectangle => {
  const screen = browserWindow.screen as ScreenWithPosition

  return {
    left: Number.isFinite(screen.availLeft) ? screen.availLeft : browserWindow.screenX,
    top: Number.isFinite(screen.availTop) ? screen.availTop : browserWindow.screenY,
    width: screen.availWidth || screen.width || browserWindow.innerWidth,
    height: screen.availHeight || screen.height || browserWindow.innerHeight,
  }
}

const findScreenIndex = (
  screens: readonly DetailedScreen[],
  currentScreen: DetailedScreen,
): number => {
  const sameObjectIndex = screens.indexOf(currentScreen)
  if (sameObjectIndex >= 0) return sameObjectIndex

  return screens.findIndex(
    (screen) =>
      screen.left === currentScreen.left &&
      screen.top === currentScreen.top &&
      screen.width === currentScreen.width &&
      screen.height === currentScreen.height,
  )
}

const chooseScreen = (
  details: ScreenDetailsLike,
  choice: ScreenChoice,
): DetailedScreen | undefined => {
  if (typeof choice === 'number') return details.screens[choice]
  if (choice === 'current') return details.currentScreen
  if (choice === 'primary') {
    return details.screens.find((screen) => screen.isPrimary)
  }

  const currentIndex = findScreenIndex(details.screens, details.currentScreen)
  const safeCurrentIndex = currentIndex >= 0 ? currentIndex : 0
  return details.screens[(safeCurrentIndex + 1) % details.screens.length]
}

const windowRectangle = (
  screen: WindowRectangle,
  size: WindowSize,
): WindowRectangle => {
  if (size === 'maximized') return screen

  const requestedWidth = size === 'windowed' ? DEFAULT_WINDOW_WIDTH : size.width
  const requestedHeight = size === 'windowed' ? DEFAULT_WINDOW_HEIGHT : size.height
  const width = Math.min(requestedWidth, screen.width)
  const height = Math.min(requestedHeight, screen.height)

  return {
    width,
    height,
    left: screen.left + (screen.width - width) / 2,
    top: screen.top + (screen.height - height) / 2,
  }
}

const windowFeatures = (rectangle: WindowRectangle): string => {
  const values = {
    left: Math.round(rectangle.left),
    top: Math.round(rectangle.top),
    width: Math.round(rectangle.width),
    height: Math.round(rectangle.height),
  }

  return [
    'popup=yes',
    `left=${values.left}`,
    `top=${values.top}`,
    `width=${values.width}`,
    `height=${values.height}`,
    'resizable=yes',
    'scrollbars=yes',
  ].join(',')
}

const permissionFailureReason = (error: unknown): WindowFallbackReason =>
  error instanceof DOMException && error.name === 'NotAllowedError'
    ? 'permission-denied'
    : 'screen-details-failed'

/**
 * Connect a Vue page to one other browser window.
 *
 * The simplest usage is `useWindowBridge()` followed by `openWindow('/page')`.
 * All settings are optional and can be overridden for an individual open call.
 */
export const useWindowBridge = <Received = unknown, Sent = unknown>(
  options: WindowBridgeOptions = {},
): WindowBridge<Received, Sent> => {
  const openedWindow = shallowRef<Window | null>(null)
  const isOpen = ref(false)
  const receivedData = shallowRef<Received | null>(null)
  const browserWindow = typeof window === 'undefined' ? null : window
  const mainWindow = browserWindow?.opener ?? null
  let closeCheckTimer: ReturnType<typeof setTimeout> | undefined
  let isCleanedUp = false

  const log = (action: string, details?: unknown) => {
    const event: WindowBridgeDebugEvent = { action, details }

    if (typeof options.debug === 'function') {
      options.debug(event)
    } else if (options.debug) {
      console.debug(`[WindowBridge] ${action}`, details ?? '')
    }
  }

  const stopCheckingForClose = () => {
    if (closeCheckTimer !== undefined) {
      clearTimeout(closeCheckTimer)
      closeCheckTimer = undefined
    }
  }

  const clearOpenedWindow = () => {
    stopCheckingForClose()
    openedWindow.value = null
    isOpen.value = false
  }

  const checkForClose = () => {
    if (!openedWindow.value || openedWindow.value.closed) {
      if (isOpen.value) log('window-closed')
      clearOpenedWindow()
      return
    }

    closeCheckTimer = setTimeout(
      checkForClose,
      options.checkInterval ?? 1000,
    )
  }

  const startCheckingForClose = () => {
    stopCheckingForClose()
    checkForClose()
  }

  const receiveMessage = (event: MessageEvent) => {
    if (!browserWindow || event.origin !== browserWindow.location.origin) return

    const isFromOpenedWindow =
      openedWindow.value !== null && event.source === openedWindow.value
    const isFromMainWindow = mainWindow !== null && event.source === mainWindow
    if (!isFromOpenedWindow && !isFromMainWindow) return
    if (!isBridgeMessage(event.data)) return

    receivedData.value = event.data.payload as Received
    log('data-received', event.data.payload)
  }

  if (browserWindow) {
    browserWindow.addEventListener('message', receiveMessage)
  }

  const resolveOpenOptions = (
    overrides: OpenWindowOptions = {},
  ): ResolvedOpenOptions => ({
    screen: overrides.screen ?? options.screen ?? 'next',
    size: overrides.size ?? options.size ?? 'maximized',
    name: overrides.name ?? options.name ?? '_blank',
    fallback: overrides.fallback ?? options.fallback ?? 'open-current',
  })

  const openBrowserWindow = (
    url: URL,
    openOptions: ResolvedOpenOptions,
    rectangle: WindowRectangle,
    placement: WindowPlacement,
    fallbackReason?: WindowFallbackReason,
  ): OpenWindowResult => {
    if (!browserWindow) return { ok: false, reason: 'ssr' }

    const newWindow = browserWindow.open(
      url.href,
      openOptions.name,
      windowFeatures(windowRectangle(rectangle, openOptions.size)),
    )

    if (!newWindow) {
      log('open-failed', { reason: 'popup-blocked' })
      return { ok: false, reason: 'popup-blocked' }
    }

    const previousWindow = openedWindow.value
    if (previousWindow && previousWindow !== newWindow && !previousWindow.closed) {
      previousWindow.close()
    }

    openedWindow.value = newWindow
    isOpen.value = true
    startCheckingForClose()
    log('window-opened', { placement, fallbackReason })

    return {
      ok: true,
      window: newWindow,
      placement,
      ...(fallbackReason ? { fallbackReason } : {}),
    }
  }

  const openWindow = async (
    url: string | URL,
    overrides: OpenWindowOptions = {},
  ): Promise<OpenWindowResult> => {
    if (!browserWindow) return { ok: false, reason: 'ssr' }

    let targetUrl: URL
    try {
      targetUrl = new URL(url, browserWindow.location.href)
    } catch (error) {
      return { ok: false, reason: 'invalid-url', error }
    }

    if (targetUrl.origin !== browserWindow.location.origin) {
      return { ok: false, reason: 'cross-origin-url' }
    }

    const openOptions = resolveOpenOptions(overrides)
    if (
      !isValidScreenChoice(openOptions.screen) ||
      !isValidSize(openOptions.size) ||
      !isPositiveNumber(options.checkInterval ?? 1000)
    ) {
      return { ok: false, reason: 'invalid-options' }
    }

    const managementWindow = browserWindow as WindowWithManagement
    const currentScreen = browserWindow.screen as ScreenWithPosition
    const canUseWindowManagement =
      browserWindow.isSecureContext &&
      typeof managementWindow.getScreenDetails === 'function'

    const openFallback = (
      reason: WindowFallbackReason,
      error?: unknown,
    ): OpenWindowResult => {
      if (openOptions.fallback === 'fail') {
        if (reason === 'permission-denied') {
          return { ok: false, reason: 'permission-denied', error }
        }
        if (reason === 'screen-details-failed') {
          return { ok: false, reason: 'screen-details-failed', error }
        }
        return { ok: false, reason: 'target-unavailable', error }
      }

      return openBrowserWindow(
        targetUrl,
        openOptions,
        currentScreenRectangle(browserWindow),
        'current-screen',
        reason,
      )
    }

    if (!canUseWindowManagement) {
      return openFallback(
        browserWindow.isSecureContext
          ? 'window-management-unsupported'
          : 'insecure-context',
      )
    }

    if (currentScreen.isExtended === false) {
      return openFallback('single-screen')
    }

    let screenDetails: ScreenDetailsLike
    try {
      screenDetails = await managementWindow.getScreenDetails!()
    } catch (error) {
      return openFallback(permissionFailureReason(error), error)
    }

    if (screenDetails.screens.length <= 1 && openOptions.screen !== 'current') {
      return openFallback('single-screen')
    }

    const targetScreen = chooseScreen(screenDetails, openOptions.screen)
    if (!targetScreen) {
      return { ok: false, reason: 'target-unavailable' }
    }

    return openBrowserWindow(
      targetUrl,
      openOptions,
      screenRectangle(targetScreen),
      'requested-screen',
    )
  }

  const createMessage = (data: Sent): BridgeMessage => ({
    __vueWindowBridge: MESSAGE_MARKER,
    type: 'data',
    payload: toRaw(data),
  })

  const sendToWindow = (data: Sent): boolean => {
    if (!browserWindow || !openedWindow.value || openedWindow.value.closed) {
      log('send-failed', { destination: 'window', reason: 'not-open' })
      return false
    }

    try {
      openedWindow.value.postMessage(
        createMessage(data),
        browserWindow.location.origin,
      )
      log('data-sent', { destination: 'window', data })
      return true
    } catch (error) {
      log('send-failed', { destination: 'window', error })
      return false
    }
  }

  const sendToMainWindow = (data: Sent): boolean => {
    if (!browserWindow || !mainWindow || mainWindow.closed) {
      log('send-failed', { destination: 'main-window', reason: 'not-opened-window' })
      return false
    }

    try {
      mainWindow.postMessage(createMessage(data), browserWindow.location.origin)
      log('data-sent', { destination: 'main-window', data })
      return true
    } catch (error) {
      log('send-failed', { destination: 'main-window', error })
      return false
    }
  }

  const closeWindow = () => {
    const windowToClose = openedWindow.value
    clearOpenedWindow()

    if (windowToClose && !windowToClose.closed) {
      windowToClose.close()
      log('window-closed-by-app')
    }
  }

  const isOpenedWindow = (): boolean =>
    mainWindow !== null && !mainWindow.closed

  const enterFullscreen = async (): Promise<boolean> => {
    if (!browserWindow?.document?.documentElement.requestFullscreen) {
      log('fullscreen-failed', { reason: 'unsupported' })
      return false
    }

    try {
      await browserWindow.document.documentElement.requestFullscreen()
      log('fullscreen-entered')
      return true
    } catch (error) {
      log('fullscreen-failed', { error })
      return false
    }
  }

  const cleanup = () => {
    if (isCleanedUp) return
    isCleanedUp = true

    if (browserWindow) {
      browserWindow.removeEventListener('message', receiveMessage)
    }
    closeWindow()
    log('cleaned-up')
  }

  if (getCurrentScope()) {
    onScopeDispose(cleanup)
  }

  return {
    openedWindow: shallowReadonly(openedWindow),
    isOpen: shallowReadonly(isOpen),
    receivedData: shallowReadonly(receivedData),
    openWindow,
    sendToWindow,
    sendToMainWindow,
    closeWindow,
    isOpenedWindow,
    enterFullscreen,
    cleanup,
  }
}
