# Publishing Guide

This document outlines the steps to publish your `vue-multi-window` package to npm.

## Preparation

1. Update the package version in `package.json`
2. Update any dependencies if needed
3. Make sure all your changes are committed
4. Make sure all tests pass (if you add tests later)

## Build the Package

Build the package to ensure everything compiles correctly:

```bash
npm run build
```

This will compile the TypeScript files into JavaScript in the `dist` folder.

## Login to npm

If you're not already logged in to npm, run:

```bash
npm login
```

Follow the prompts to enter your npm credentials.

## Publishing

There are two ways to publish:

### 1. Using npm publish directly

```bash
npm publish
```

### 2. Using the prepublishOnly script

Since the `prepublishOnly` script is set up in your package.json, you can simply run:

```bash
npm publish
```

The build will run automatically before publishing.

## Publishing a Scoped Package

If you want to publish under your npm username or organization (recommended), update the package name in `package.json`:

```json
{
  "name": "@your-username/vue-multi-window",
  ...
}
```

Then publish with:

```bash
npm publish --access public
```

## After Publishing

1. Create a new GitHub release/tag
2. Announce the new version on relevant platforms
3. Update any documentation or examples if necessary

## Versioning Guidelines

Follow semantic versioning (SemVer):

- **Major version (1.0.0)**: Breaking changes
- **Minor version (0.1.0)**: New features, no breaking changes
- **Patch version (0.0.1)**: Bug fixes and minor changes 