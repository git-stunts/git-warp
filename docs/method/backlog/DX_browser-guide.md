---
id: DX_browser-guide
feature: browser-viz
blocked_by: []
blocks: []
---

# Browser guide and storage adapter documentation


Legend: Observer Geometry

## Problem

`package.json` exports a `/browser` entry point and the codebase has
`InMemoryGraphAdapter`, `sha1sync`, `InMemoryBlobStorageAdapter`, and a
`demo/browsa/` Vite build — but there is no dedicated documentation
explaining how to run `git-warp` in a browser environment.

The editor's report (2026-03-29) flagged this as a missing document:
"If I'm using git-warp in a web app, I need to know the storage adapter
requirements."

## Why this matters

- The `/browser` export exists but consumers don't know what it provides
  or what it excludes.
- `InMemoryGraphAdapter` is the browser-compatible persistence adapter, but
  there's no guide explaining its capabilities and limitations vs
  `GitGraphAdapter`.
- The `demo/browsa/` directory proves browser usage works, but that
  knowledge is locked in demo code rather than published documentation.
- `InsecureCryptoAdapter` exists for plain HTTP contexts — consumers need
  to know when and why to use it.

## Desired outcome

A `docs/BROWSER_GUIDE.md` that covers:

1. What the `/browser` entry point exports and what it excludes
2. How to use `InMemoryGraphAdapter` + `InMemoryBlobStorageAdapter` for
   browser-only graphs
3. How to sync browser graphs with Git-backed remotes (WebSocket via
   `git warp serve`, or HTTP sync)
4. `sha1sync` — when and why to use the pure-JS SHA-1
5. `InsecureCryptoAdapter` — when `crypto.subtle` is unavailable
6. Vite/bundler configuration (stubs for `node:crypto`, `node:stream`,
   `roaring`, etc. — as demonstrated in `demo/browsa/vite.config.js`)
7. Known limitations (no Git object store, no GC, no persistence across
   page reloads without an external sync target)

## Acceptance criteria

1. `docs/BROWSER_GUIDE.md` exists and is linked from the README.
2. A copy-pasteable "hello world" example works in a browser context.
3. The guide honestly states what does NOT work in browsers.
4. Markdown lint and code sample lint pass.

## Non-goals

- No new browser runtime code — just documentation of existing capabilities.
- No OPFS or IndexedDB persistence adapter (that would be a separate item).
