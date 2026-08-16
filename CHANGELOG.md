# vue-window-bridge

## 2.0.0

### Major Changes

- Replaced `useMultiWindow()` with the beginner-friendly `useWindowBridge()` API.
- Renamed window actions to `openWindow()`, `closeWindow()`, `sendToWindow()`, `sendToMainWindow()`, and `enterFullscreen()`.
- Added typed open results, typed two-way messages, screen and size customization, secure same-origin message validation, and automatic Vue lifecycle cleanup.
- Updated multi-screen behavior for the current Window Management API, with exact placement in supported Chromium browsers and a safe current-screen fallback elsewhere.
- Added complete v2 documentation, migration guidance, tests, ESM/CJS package verification, and updated build and release tooling.

## 1.1.3

### Patch Changes

- ddf6841: fix isChildWindowOpen reactivity

## 1.1.2

### Patch Changes

- 30f129a: fix unload child window script

## 1.1.1

### Patch Changes

- efae13c: fix isChildWindowOpen to be false when its closing

## 1.1.0

### Minor Changes

- 03f39f3: Added support for sending data to child

## 1.0.15

### Patch Changes

- 5a92db1: fix publishing
- f82947b: fix publishing script
- bbe7d78: change publish script
- 7d3feb1: fix build

## 1.0.8

### Patch Changes

- ba6d43f: fix publishing

## 1.0.7

### Patch Changes

- 445842c: fix publishing scope

## 1.0.6

### Patch Changes

- 6d19898: fix publishing

## 1.0.5

### Patch Changes

- 0f5595b: added publish script

## 1.0.4

### Patch Changes

- 6b2d438: fixed Typescript build
