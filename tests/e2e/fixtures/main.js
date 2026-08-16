import { useWindowBridge } from '/src/index.ts'

const bridge = useWindowBridge({ checkInterval: 25 })

window.testBridge = bridge
window.lastOpenResult = null

document.querySelector('#open-window').addEventListener('click', async () => {
  window.lastOpenResult = await bridge.openWindow(
    '/tests/e2e/fixtures/child.html',
  )
})
