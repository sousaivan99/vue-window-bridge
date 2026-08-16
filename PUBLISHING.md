# Publishing Guide

This document outlines the steps to publish your `vue-window-bridge` package to npm.

## Preparation

1. Add a Changeset with `bunx changeset`
2. Update dependencies if needed
3. Make sure all changes are committed
4. Run the complete validation suite

## Build the Package

Build the package to ensure everything compiles correctly:

```bash
bun run check
bun run test:e2e
```

This type-checks the source, runs the unit and real-browser tests, and builds both package formats. Install the pinned test browsers once with `bunx playwright install chromium firefox`.

## Login to npm

If you're not already logged in to npm, run:

```bash
npm login
```

Follow the prompts to enter your npm credentials.

## Publishing

### Recommended: automated release

Push the change and its Changeset to `main`. After CI passes, the Changesets workflow creates or updates a release pull request. Merge that pull request to publish the package.

The Changeset updates `package.json`, `CHANGELOG.md`, the Git tag, and the GitHub release for you.

### Manual release

If automation is unavailable, apply the Changeset version first and then publish:

```bash
bunx changeset version
bun run check
npm publish --access public
```

The `prepublishOnly` script runs the same validation again before npm publishes.

## Publishing a Scoped Package

If you want to publish under your npm username or organization (recommended), update the package name in `package.json`:

```json
{
  "name": "@your-username/vue-window-bridge",
  ...
}
```

Then publish with:

```bash
npm publish --access public
```

## After Publishing

1. Confirm the new version on npm and GitHub
2. Test installation in a small Vue app
3. Announce the new version if needed

## Versioning Guidelines

Follow semantic versioning (SemVer):

- **Major version (1.0.0)**: Breaking changes
- **Minor version (0.1.0)**: New features, no breaking changes
- **Patch version (0.0.1)**: Bug fixes and minor changes
