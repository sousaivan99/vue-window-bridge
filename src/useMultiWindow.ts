import { ref, toRaw } from 'vue'

export interface MultiWindowOptions {
  debug?: boolean;
  preferredScreen?: number; // Optional preferred screen index
  fullscreen?: boolean; // Whether to open in fullscreen mode
}

export const useMultiWindow = (options: MultiWindowOptions = {}) => {
  const childWindow = ref<Window | null>(null)
  const childOrigin = ref<string>('')
  const isChildWindowOpen = ref(false)
  const receivedData = ref<any>(null)
  const debug = options.debug || false
  const preferredScreen = options.preferredScreen
  const fullscreen = options.fullscreen !== undefined ? options.fullscreen : true
  
  // Debug logger
  const log = (message: string, data?: any) => {
    if (debug) {
      console.group(`[MultiWindow] ${message}`)
      if (data !== undefined) {
        console.log(data)
      }
      console.groupEnd()
    }
  }

  // Function to open a new window on the next available monitor
  const openWindowOnSecondMonitor = async (path: string): Promise<Window | null> => {
    try {
      // Try to use the modern getScreenDetails API if available
      if (typeof window !== 'undefined' && 'getScreenDetails' in window) {
        log('Using modern getScreenDetails API')
        return await openWithScreenDetailsAPI(path)
      } else {
        // Fall back to the older Screen API
        log('Falling back to legacy Screen API')
        return openWithLegacyScreenAPI(path)
      }
    } catch (error) {
      log('Error opening window', error)
      // If all else fails, just open a regular window
      return openRegularWindow(path)
    }
  }
  
  // Find which monitor contains the current window
  const findCurrentMonitorIndex = async () => {
    try {
      if (typeof window !== 'undefined' && 'getScreenDetails' in window) {
        // @ts-ignore - TypeScript doesn't know about this API yet
        const screenDetails = await window.getScreenDetails()
        const screens = screenDetails.screens
        
        if (!screens || screens.length <= 1) {
          return 0 // Only one screen available
        }
        
        // Get the current window position
        const windowX = window.screenX || window.screenLeft || 0
        const windowY = window.screenY || window.screenTop || 0
        
        log('Current window position', { x: windowX, y: windowY })
        
        // Find which screen contains the current window
        for (let i = 0; i < screens.length; i++) {
          const screen = screens[i]
          // @ts-ignore
          const bounds = screen.availLeft !== undefined ? {
            // @ts-ignore
            left: screen.availLeft,
            // @ts-ignore
            top: screen.availTop,
            // @ts-ignore
            right: screen.availLeft + screen.availWidth,
            // @ts-ignore
            bottom: screen.availTop + screen.availHeight
          } : screen.bounds
          
          if (windowX >= bounds.left && windowX < bounds.right &&
              windowY >= bounds.top && windowY < bounds.bottom) {
            log('Current window is on monitor', { index: i, screen })
            return i
          }
        }
        
        // If we couldn't determine which screen, default to the first one
        return 0
      } else if (typeof window !== 'undefined') {
        // For legacy browsers, try to determine which monitor based on position
        const windowX = window.screenX || window.screenLeft || 0
        const screenWidth = window.screen?.width || window.innerWidth
        
        // Simple heuristic: if window is beyond screen width, it's likely on the second monitor
        const monitorIndex = windowX >= screenWidth ? 1 : 0
        log('Legacy monitor detection', { windowX, screenWidth, monitorIndex })
        return monitorIndex
      }
      return 0 // Default if running in SSR or similar environment
    } catch (error) {
      log('Error detecting current monitor', error)
      return 0 // Default to first monitor
    }
  }
  
  // Open window using the modern getScreenDetails API
  const openWithScreenDetailsAPI = async (path: string): Promise<Window | null> => {
    try {
      if (typeof window === 'undefined') return null;
      
      // Request permission to access screen details
      // @ts-ignore - TypeScript doesn't know about this API yet
      const screenDetails = await window.getScreenDetails()
      const screens = screenDetails.screens
      
      log('Available screens', screens)
      
      if (!screens || screens.length <= 1) {
        log('Only one screen detected, using current screen')
        return openRegularWindow(path)
      }
      
      // Find which monitor the parent window is currently on
      const currentMonitorIndex = await findCurrentMonitorIndex()
      log('Current monitor index', currentMonitorIndex)
      
      // Find the next screen (or use preferred screen if specified)
      let targetScreenIndex
      
      if (preferredScreen !== undefined && screens[preferredScreen]) {
        targetScreenIndex = preferredScreen
        log('Using preferred screen', { index: preferredScreen })
      } else {
        // Use the next screen in sequence, wrapping around if necessary
        targetScreenIndex = (currentMonitorIndex + 1) % screens.length
        log('Using next screen in sequence', { 
          current: currentMonitorIndex, 
          next: targetScreenIndex 
        })
      }
      
      const targetScreen = screens[targetScreenIndex]
      log('Target screen', targetScreen)
      
      // Get the bounds of the target screen
      // @ts-ignore - TypeScript doesn't know about this API yet
      const { width, height, left, top } = targetScreen.availWidth ? 
        // Use availWidth/Height if available
        {
          // @ts-ignore
          width: targetScreen.availWidth,
          // @ts-ignore
          height: targetScreen.availHeight,
          // @ts-ignore
          left: targetScreen.availLeft,
          // @ts-ignore
          top: targetScreen.availTop
        } : 
        // Otherwise use bounds
        // @ts-ignore
        targetScreen.bounds

      log('Target screen dimensions', { width, height, left, top })
      
      // Open the window with precise positioning
      const features = fullscreen
        ? `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=yes,status=no,directories=no,scrollbars=yes,resizable=yes`
        : `width=${Math.min(800, width)},height=${Math.min(600, height)},left=${left + (width - Math.min(800, width))/2},top=${top + (height - Math.min(600, height))/2},menubar=no,toolbar=no,location=yes,status=no,directories=no,scrollbars=yes,resizable=yes`
      return finalizeWindowOpening(path, features)
    } catch (error) {
      log('Error with getScreenDetails', error)
      // Fall back to legacy method
      return openWithLegacyScreenAPI(path)
    }
  }
  
  // Open window using the older Screen API (less accurate for multi-monitor)
  const openWithLegacyScreenAPI = async (path: string): Promise<Window | null> => {
    if (typeof window === 'undefined' || !window.screen) {
      log('Screen API not available')
      return openRegularWindow(path)
    }

    try {
      // Find which monitor the parent window is currently on
      const currentMonitorIndex = await findCurrentMonitorIndex()
      log('Current monitor index (legacy)', currentMonitorIndex)
      
      // Try to detect multiple monitors using non-standard properties
      // This is a best effort approach and might not work in all browsers
      
      // Get current window position
      const windowX = window.screenX || window.screenLeft || 0
      const windowY = window.screenY || window.screenTop || 0
      
      // Get screen dimensions
      const screenWidth = window.screen.width || window.innerWidth
      const screenHeight = window.screen.height || window.innerHeight
      
      // Calculate position for next monitor
      // If current window is on monitor 0, place new window on monitor 1 (to the right)
      // If current window is on monitor 1, place new window on monitor 0 (to the left)
      let newWindowLeft
      
      if (currentMonitorIndex === 0) {
        // Place on the right monitor
        newWindowLeft = screenWidth
      } else {
        // Place on the left monitor
        newWindowLeft = -screenWidth
      }
      
      log('Legacy screen positioning', { 
        windowX, 
        windowY,
        screenWidth, 
        screenHeight,
        currentMonitorIndex,
        newWindowLeft
      })
      
      // Open the window
      const features = fullscreen
        ? `width=${screenWidth},height=${screenHeight},left=${newWindowLeft},top=0,menubar=no,toolbar=no,location=no,status=no`
        : `width=800,height=600,left=${newWindowLeft + (screenWidth - 800)/2},top=${(screenHeight - 600)/2},menubar=no,toolbar=no,location=no,status=no`
      
      return finalizeWindowOpening(path, features)
    } catch (error) {
      log('Error with legacy screen detection', error)
      return openRegularWindow(path)
    }
  }
  
  // Open a regular window without special positioning
  const openRegularWindow = (path: string): Window | null => {
    if (typeof window === 'undefined') return null;
    
    log('Opening regular window without special positioning')
    const features = fullscreen
      ? 'menubar=no,toolbar=no,location=no,status=no,directories=no,scrollbars=yes,resizable=yes'
      : 'width=800,height=600,menubar=no,toolbar=no,location=no,status=no,directories=no,scrollbars=yes,resizable=yes'
    return finalizeWindowOpening(path, features)
  }
  
  // Request fullscreen for a window
  const requestFullscreenForWindow = (targetWindow: Window | null) => {
    if (!targetWindow || targetWindow.closed) {
      log('Cannot request fullscreen for null or closed window')
      return
    }

    try {
      // Send a message to the child window to request fullscreen
      targetWindow.postMessage('REQUEST_FULLSCREEN', childOrigin.value || window.location.origin)
      log('Sent fullscreen request message to child window')
    } catch (error) {
      log('Error sending fullscreen message', error)
    }
  }
  
  // Maximize a window
  const maximizeWindow = (targetWindow: Window | null) => {
    if (!targetWindow || targetWindow.closed) {
      log('Cannot maximize null or closed window')
      return
    }

    try {
      // Send a message to the child window to maximize
      targetWindow.postMessage('MAXIMIZE_WINDOW', childOrigin.value || window.location.origin)
      log('Sent maximize request message to child window')
    } catch (error) {
      log('Error sending maximize message', error)
    }
  }
  
  // Function to receive messages from child window
  const receiveMessage = (event: MessageEvent) => {
    // Verify origin for security
    if (childOrigin.value && event.origin !== childOrigin.value) {
      log('Ignored message from untrusted origin', { 
        expected: childOrigin.value, 
        received: event.origin 
      })
      return
    }

    // Check if child window is ready to be maximized
    if (event.data === 'READY_FOR_MAXIMIZE' && childWindow.value) {
      log('Child window is ready to be maximized')
      maximizeWindow(childWindow.value)
    } else if (event.data === 'READY_FOR_FULLSCREEN' && childWindow.value && fullscreen) {
      // If we still want fullscreen functionality
      log('Child window is ready for fullscreen')
      requestFullscreenForWindow(childWindow.value)
    }
    
    log('Received data from child window', event.data)
    receivedData.value = event.data
    
    // Emit an event or call a callback when data is received
    if (typeof window !== 'undefined' && window.document) {
      window.document.dispatchEvent(
        new CustomEvent('multi-window-data', { detail: event.data })
      )
    }
  }
  
  // Function to send data from child window to parent
  const sendDataToParent = (data: any) => {
    if (typeof window === 'undefined') return;
    
    try {
      // If we're in a child window and we have a parent opener
      if (window.opener) {
        log('Sending data to parent window', data)
        
        // Convert Vue reactive objects to plain objects
        const plainData = typeof toRaw === 'function' 
          ? toRaw(data) 
          : JSON.parse(JSON.stringify(data))
        
        // Send the data to the parent window
        window.opener.postMessage(plainData, window.opener.location.origin)
        log('Data sent to parent', plainData)
      } else {
        log('No parent window found')
      }
    } catch (error) {
      log('Error sending data to parent', error)
    }
  }

  const sendDataToChild = (data: any) => {
    if (typeof window === 'undefined') return;
    
    try {
      if (childWindow.value && !childWindow.value.closed) {
        log('Sending data to child window', data)
        
        // Convert Vue reactive objects to plain objects
        const plainData = typeof toRaw === 'function' 
          ? toRaw(data) 
          : JSON.parse(JSON.stringify(data))
        
        // Send the data to the child window
        childWindow.value.postMessage(plainData, childOrigin.value || '*')
        log('Data sent to child window', plainData)
      } else {
        log('No child window found or window is closed')
      }
    } catch (error) {
      log('Error sending data to child window', error)
    }
  }
  
  // Function to close the child window from the parent
  const closeChildWindow = () => {
    if (childWindow.value && !childWindow.value.closed) {
      log('Closing child window')
      childWindow.value.close()
      childWindow.value = null
      isChildWindowOpen.value = false
    }
  }
  
  // Function to check if this is a child window
  const isChildWindow = () => {
    return typeof window !== 'undefined' && !!window.opener
  }
  
  // Function to request fullscreen for the current window (called by child window)
  const requestFullscreenForSelf = () => {
    if (typeof window === 'undefined' || !window.document) return
    
    log('Attempting to make this window fullscreen')
    
    try {
      const element = window.document.documentElement
      
      // Try different fullscreen methods
      const requestFullscreen = element.requestFullscreen || 
        // @ts-ignore
        element.webkitRequestFullscreen || 
        // @ts-ignore
        element.mozRequestFullScreen || 
        // @ts-ignore
        element.msRequestFullscreen
      
      if (requestFullscreen) {
        // @ts-ignore
        requestFullscreen.call(element)
        log('Requested fullscreen via API')
      } else {
        log('Fullscreen API not supported in this browser')
      }
    } catch (error) {
      log('Error requesting fullscreen', error)
    }
  }
  
  // Helper function to finalize window opening
  const finalizeWindowOpening = (path: string, features: string): Window | null => {
    if (typeof window === 'undefined') return null;
    
    try {
      // Build the full URL
      const fullUrl = new URL(path, window.location.origin).href
      log('Opening window with URL', fullUrl)
      
      // Close any existing child window
      if (childWindow.value && !childWindow.value.closed) {
        log('Closing existing child window')
        childWindow.value.close()
      }
      
      // Open the new window
      childWindow.value = window.open(fullUrl, '_blank', features)
      
      if (!childWindow.value) {
        log('Failed to open window - likely blocked by popup blocker')
        return null
      }
      
      // Store the origin of the child window for security
      childOrigin.value = new URL(fullUrl).origin
      log('Child window origin', childOrigin.value)
      
      // Set up event listener for messages from the child window
      if (typeof window.removeEventListener === 'function') {
        window.removeEventListener('message', receiveMessage)
      }
      window.addEventListener('message', receiveMessage)
      
      // Set flag to indicate child window is open
      isChildWindowOpen.value = true
      
      // Try to move to the correct position after a short delay
      // This can help in some browsers where the initial positioning doesn't work
      setTimeout(() => {
        try {
          if (childWindow.value && !childWindow.value.closed) {
            childWindow.value.focus()
            
            // Set up maximize handling if fullscreen option is enabled
            if (fullscreen) {
              try {
                const maximizeScript = `
                  try {
                    // Set up event listener for maximize request message
                    window.addEventListener('message', function(event) {
                      if (event.data === 'MAXIMIZE_WINDOW') {
                        console.log('[MultiWindow] Received maximize request');
                        try {
                          // Some browsers support window.maximize()
                          if (window.maximize) {
                            window.maximize();
                          } 
                          // For browsers that don't support maximize, try moveTo and resizeTo
                          else {
                            // Get the screen dimensions
                            const screenWidth = window.screen.availWidth || window.screen.width;
                            const screenHeight = window.screen.availHeight || window.screen.height;
                            
                            // Move to top-left of the screen
                            window.moveTo(0, 0);
                            
                            // Resize to maximum available size
                            window.resizeTo(screenWidth, screenHeight);
                          }
                          console.log('[MultiWindow] Window maximized');
                        } catch(e) {
                          console.error('[MultiWindow] Error maximizing window:', e);
                        }
                      } else if (event.data === 'REQUEST_FULLSCREEN') {
                        console.log('[MultiWindow] Received fullscreen request');
                        try {
                          const element = document.documentElement;
                          
                          // Try different fullscreen methods
                          const requestFullscreen = element.requestFullscreen || 
                            element.webkitRequestFullscreen || 
                            element.mozRequestFullScreen || 
                            element.msRequestFullscreen;
                          
                          if (requestFullscreen) {
                            requestFullscreen.call(element);
                            console.log('[MultiWindow] Requested fullscreen via API');
                          } else {
                            console.log('[MultiWindow] Fullscreen API not supported');
                          }
                        } catch(e) {
                          console.error('[MultiWindow] Error requesting fullscreen:', e);
                        }
                      }
                    });
                  } catch(e) {
                    console.error('[MultiWindow] Error in initialization script:', e);
                  }
                `
                // Execute the script in the child window
                // Use Function constructor as a safer alternative to direct eval
                if (childWindow.value) {
                  try {
                    // @ts-ignore - Ignoring type check for eval which is needed for this functionality
                    childWindow.value.eval(maximizeScript);
                  } catch (evalError) {
                    // Fallback if eval is not available
                    const scriptEl = childWindow.value.document.createElement('script');
                    scriptEl.textContent = maximizeScript;
                    childWindow.value.document.head.appendChild(scriptEl);
                  }
                }
                log('Injected maximize/fullscreen handling script')
              } catch (error) {
                log('Error injecting maximize script', error)
              }
            }
          }
        } catch (error) {
          log('Error during window positioning', error)
        }
      }, 100)
      
      return childWindow.value
    } catch (error) {
      log('Error opening window', error)
      return null
    }
  }
  
  // Cleanup function
  const cleanup = () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('message', receiveMessage)
    }
    closeChildWindow()
  }

  // Setup event handlers when in a child window
  if (typeof window !== 'undefined' && window.opener) {
    // Set up event listener for messages from the parent window
    window.addEventListener('message', (event) => {
      if (event.source === window.opener) {
        if (event.data === 'REQUEST_FULLSCREEN') {
          requestFullscreenForSelf()
        } else {
          // Handle regular data received from parent
          log('Received data from parent window', event.data)
          receivedData.value = event.data
          
          // Emit an event when data is received
          if (window.document) {
            window.document.dispatchEvent(
              new CustomEvent('multi-window-data', { detail: event.data })
            )
          }
        }
      }
    })
    
    // Clean up event listeners when the window is closed
    window.addEventListener('beforeunload', () => {
      try {
        window.removeEventListener('message', receiveMessage)
      } catch (e) {
        // Ignore errors during window closing
      }
    })
  }
  
  return {
    // State
    childWindow,
    isChildWindowOpen,
    receivedData, // Contains data received from parent (if child window) or child (if parent window)
    
    // Methods
    openWindowOnSecondMonitor,
    sendDataToParent, // Send data from child to parent
    sendDataToChild,  // Send data from parent to child
    closeChildWindow,
    isChildWindow,
    requestFullscreenForSelf,
    cleanup
  }
} 