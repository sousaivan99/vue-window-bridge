# Vue Window Bridge

A beginner-friendly Vue composable for opening a page in another browser window, placing it on another screen when the browser allows it, and sending data between both windows.

Start with no configuration:

```ts
const { openWindow } = useWindowBridge()
```

Add screen, size, logging, and fallback options only when you need them.

## Features

- One simple composable for the main window and the opened window
- Exact multi-screen placement in supported Chromium browsers
- Safe current-screen fallback in other browsers
- Typed two-way messaging
- Reactive open state and received data
- Automatic Vue lifecycle cleanup
- Same-origin message and window validation
- SSR-safe API with typed results

## Installation

```bash
npm install vue-window-bridge
```

You can also use `pnpm add`, `yarn add`, or `bun add`.

## Quick start

### 1. Open a window

Use this in your main Vue component:

```vue
<script setup lang="ts">
import { useWindowBridge } from 'vue-window-bridge'

const { openWindow, closeWindow, isOpen } = useWindowBridge()

// Keep openWindow() directly inside the click handler so popup blockers allow it.
const showPresentation = () => openWindow('/presentation')
</script>

<template>
  <button @click="showPresentation">Open presentation</button>
  <button v-if="isOpen" @click="closeWindow">Close presentation</button>
</template>
```

That is all you need. By default, the library tries to open the page maximized on the next screen. If exact screen placement is unavailable, it opens a normal window on the current screen.

### 2. Send data to the opened window

```vue
<script setup lang="ts">
import { useWindowBridge } from 'vue-window-bridge'

const { openWindow, sendToWindow } = useWindowBridge()

const openAndSend = async () => {
  const result = await openWindow('/presentation')

  if (result.ok) {
    sendToWindow({ title: 'Quarterly results', slide: 1 })
  }
}
</script>

<template>
  <button @click="openAndSend">Start presentation</button>
</template>
```

### 3. Receive data in the opened window

Use the same composable on the page you opened:

```vue
<script setup lang="ts">
import { watch } from 'vue'
import { useWindowBridge } from 'vue-window-bridge'

const {
  receivedData,
  sendToMainWindow,
  enterFullscreen,
  isOpenedWindow,
} = useWindowBridge()

watch(receivedData, (data) => {
  if (data) console.log('Received from the main window:', data)
})

const tellMainWindowWeAreReady = () => {
  sendToMainWindow({ ready: true })
}
</script>

<template>
  <p v-if="isOpenedWindow()">Connected to the main window</p>
  <button @click="tellMainWindowWeAreReady">I am ready</button>

  <!-- Fullscreen must be requested from a click in this window. -->
  <button @click="enterFullscreen">Enter fullscreen</button>
</template>
```

## TypeScript messages

The first generic is data received by this window. The second is data sent by this window.

```ts
type FromPresentation = { ready: boolean }
type ToPresentation = { title: string; slide: number }

const bridge = useWindowBridge<FromPresentation, ToPresentation>()

bridge.receivedData.value // FromPresentation | null
bridge.sendToWindow({ title: 'Quarterly results', slide: 2 })
```

Messages must use values supported by the browser's structured clone algorithm. Plain objects, arrays, strings, numbers, dates, maps, sets, and typed arrays are good choices. Functions and DOM elements cannot be sent.

## Customization

All settings are optional:

```ts
const bridge = useWindowBridge({
  screen: 'next',
  size: 'maximized',
  name: 'presentation-window',
  fallback: 'open-current',
  checkInterval: 1000,
  debug: true,
})
```

| Setting | Values | Default | Purpose |
| --- | --- | --- | --- |
| `screen` | `'next'`, `'primary'`, `'current'`, or a screen index | `'next'` | Chooses a screen when Window Management is supported. |
| `size` | `'maximized'`, `'windowed'`, or `{ width, height }` | `'maximized'` | Fills available space, uses 800×600, or uses a custom centered size. |
| `name` | Any window target name | `'_blank'` | Lets advanced apps reuse a named window. |
| `fallback` | `'open-current'` or `'fail'` | `'open-current'` | Opens on the current screen or returns a failure when exact placement is unavailable. |
| `checkInterval` | Positive milliseconds | `1000` | Controls how often closed-window state is checked. |
| `debug` | `true` or a logger function | `false` | Prints events or sends them to your logger. |

You can override placement for one call:

```ts
await bridge.openWindow('/tools', {
  screen: 'primary',
  size: { width: 1100, height: 700 },
  name: 'tools-window',
})
```

A custom logger receives structured events:

```ts
const bridge = useWindowBridge({
  debug: (event) => analytics.track(event.action, event.details),
})
```

## API

```ts
const {
  // Reactive state
  openedWindow,   // Readonly<ShallowRef<Window | null>>
  isOpen,         // Readonly<Ref<boolean>>
  receivedData,   // Readonly<ShallowRef<Received | null>>

  // Beginner-friendly actions
  openWindow,
  closeWindow,
  sendToWindow,
  sendToMainWindow,
  isOpenedWindow,
  enterFullscreen,

  // Usually automatic; available for advanced/manual lifecycles
  cleanup,
} = useWindowBridge(options)
```

`openWindow()` never throws for expected browser failures. It returns an object with `ok: true` or `ok: false`:

```ts
const result = await openWindow('/presentation')

if (!result.ok) {
  console.error('Could not open the window:', result.reason)
} else if (result.placement === 'current-screen') {
  console.info('Opened with fallback:', result.fallbackReason)
}
```

Junior developers can ignore the result when no custom error UI is needed. Senior developers can use its typed reason codes for permissions, popup blockers, SSR, invalid configuration, and placement failures.

## Browser support

Exact screen discovery and placement uses the [Window Management API](https://developer.mozilla.org/en-US/docs/Web/API/Window_Management_API):

- Chrome and Edge 100+ support `getScreenDetails()` without an experimental flag.
- Other Chromium-based browsers generally inherit that support according to their Chromium version.
- Firefox and Safari do not currently support `getScreenDetails()`.
- The API requires HTTPS (localhost is allowed), the `window-management` permission, and a user action.

Because the API is still [limited availability](https://developer.mozilla.org/en-US/docs/Web/API/Window/getScreenDetails), Vue Window Bridge uses progressive enhancement:

1. Use exact requested-screen placement when permission and browser support are available.
2. Otherwise open a regular same-origin window on the current screen.
3. Return a typed result describing what happened.

The fallback intentionally does not guess where another monitor is located. Guesses fail for screens arranged above, below, or to the left of the main screen.

## Fullscreen

`size: 'maximized'` and HTML fullscreen are different:

- `maximized` sizes the browser window to the screen's available area.
- `enterFullscreen()` uses the Fullscreen API and hides browser/OS UI where permitted.

Browsers require [transient user activation](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen), so call `enterFullscreen()` directly from a click or key handler in the window that should become fullscreen.

## Security

- Only same-origin URLs can be opened by the bridge.
- Incoming messages must match both the expected origin and the exact connected `Window` object.
- Application data is wrapped in a private, versioned message format.
- No `'*'` message target is used.
- Do not open the connected page with `noopener`; the opened page needs its `window.opener` connection.

If you use `Permissions-Policy`, allow `window-management` for the page that requests screen details. Its default allowlist is `self`.

## Migrating from v1

Version 2 uses clearer names and removes behavior that browsers could not reliably provide:

| v1 | v2 |
| --- | --- |
| `useMultiWindow()` | `useWindowBridge()` |
| `openWindowOnSecondMonitor()` | `openWindow()` |
| `closeChildWindow()` | `closeWindow()` |
| `sendDataToChild()` | `sendToWindow()` |
| `sendDataToParent()` | `sendToMainWindow()` |
| `isChildWindow()` | `isOpenedWindow()` |
| `requestFullscreenForSelf()` | `enterFullscreen()` |
| `childWindow` | `openedWindow` |
| `isChildWindowOpen` | `isOpen` |
| `preferredScreen` | `screen` |
| `fullscreen` | `size: 'maximized'` plus explicit `enterFullscreen()` |

## Testing and contributing

Run the fast validation suite while developing:

```bash
bun install
bun run check
```

Run the real Chromium and Firefox browser tests before publishing:

```bash
bunx playwright install chromium firefox
bun run test:e2e
```

The Chromium suite uses the browser's DevTools Protocol to create a virtual second display, grants the real `window-management` permission, and verifies exact popup placement and two-way messaging. Firefox verifies the real unsupported-API fallback path.

## License

MIT
