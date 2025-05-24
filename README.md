# Vue Multi-Window

A Vue composable for opening and managing multiple windows across different monitors, with cross-window communication.

## Features

- Open windows on secondary monitors automatically
- Smart detection of available screens and monitors
- Supports modern Multi-Screen API with fallbacks for legacy browsers
- Bidirectional communication between parent and child windows
- Fullscreen and maximize window support
- Secure cross-window messaging with origin validation
- TypeScript support

## Installation

```bash
npm install vue-multi-window
# or
yarn add vue-multi-window
# or
pnpm add vue-multi-window
# or
bun add vue-multi-window
```

## Basic Usage

### In Parent Component

```vue
<script setup>
import { ref, watch } from 'vue'
import { useMultiWindow } from 'vue-multi-window'

// Initialize with optional configuration
const { openWindowOnSecondMonitor, receivedData, closeChildWindow } = useMultiWindow({
  debug: true, // Enable debug logging
  fullscreen: true, // Open in fullscreen mode (default)
  preferredScreen: 1 // Optional: prefer a specific screen index
})

// Track received data
watch(receivedData, (newData) => {
  if (newData) {
    console.log('Received data from child window:', newData)
  }
})

// Function to open a new window
const openSecondaryWindow = () => {
  openWindowOnSecondMonitor('/secondary-page')
}
</script>

<template>
  <button @click="openSecondaryWindow">Open on Second Monitor</button>
  <button @click="closeChildWindow">Close Child Window</button>
  
  <div v-if="receivedData">
    <h3>Received Data:</h3>
    <pre>{{ receivedData }}</pre>
  </div>
</template>
```

### In Child Component

```vue
<script setup>
import { onMounted } from 'vue'
import { useMultiWindow } from 'vue-multi-window'

const { isChildWindow, sendDataToParent } = useMultiWindow()

// Optional: Check if this is a child window
onMounted(() => {
  if (!isChildWindow()) {
    console.warn('This component is not running in a child window')
  }
})

// Function to send data back to parent
const sendDataToParentWindow = () => {
  const data = {
    message: 'Hello from child window',
    timestamp: new Date().toISOString(),
    value: 42
  }
  
  sendDataToParent(data)
}
</script>

<template>
  <div>
    <h1>Child Window</h1>
    <button @click="sendDataToParentWindow">Send Data to Parent</button>
  </div>
</template>
```

## API Reference

### Configuration Options

```typescript
interface MultiWindowOptions {
  debug?: boolean;       // Enable debug logging
  preferredScreen?: number; // Preferred screen index (0-based)
  fullscreen?: boolean;  // Whether to open in fullscreen mode
}
```

### Returned Values

```typescript
const {
  // State
  childWindow,          // Ref<Window | null> - Reference to the child window
  isChildWindowOpen,    // Ref<boolean> - Whether child window is open
  receivedData,         // Ref<any> - Data received from child window
  
  // Methods
  openWindowOnSecondMonitor, // (path: string) => Promise<Window | null>
  sendDataToParent,     // (data: any) => void
  closeChildWindow,     // () => void
  isChildWindow,        // () => boolean
  requestFullscreenForSelf, // () => void
  cleanup              // () => void - Clean up event listeners
} = useMultiWindow(options)
```

## Browser Compatibility

This package works in modern browsers with varying levels of functionality:

### Full Support (Multi-Screen API)
- Chrome 100+ (with Experimental Web Platform features enabled)
- Edge 100+ (with Experimental Web Platform features enabled)

### Good Support (Legacy Screen Detection)
- Most modern browsers with multi-monitor support
- Chrome, Firefox, Edge, Safari with standard screen properties

### Basic Support (Regular Window)
- All browsers that support `window.open()`

## Security Considerations

- Messages are validated by origin to prevent cross-site scripting attacks
- Uses same-origin policy for security
- The Multi-Screen API requires a secure context (HTTPS) and user permission

## License

MIT 