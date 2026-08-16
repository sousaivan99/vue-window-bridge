import { useWindowBridge } from '/src/index.ts'

window.testBridge = useWindowBridge({ checkInterval: 25 })
