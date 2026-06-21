# Patches

This directory contains local modifications to dependencies, managed by [`patch-package`](https://github.com/ds300/patch-package).

## Rationale

### `@mapbox/node-pre-gyp@2.0.3`

- **Issue:** Uses deprecated legacy Node.js APIs (`url.parse`, `url.resolve`).
- **Impact:** Causes warnings and potential resolution failures in modern Node.js environments (Node 22+).
- **Why Patch?** Upstream maintenance on `mapbox/node-pre-gyp` is slow, and the package maintains strict backward compatibility with very old Node.js versions, preventing them from adopting the modern `URL` constructor.
- **Status:** Required until upstream releases a version that uses the modern `URL` API or until dependencies (like `roaring`) migrate away from `node-pre-gyp`.

### `@git-stunts/alfred@0.10.3`

- **Issue:** The timeout policy only uses injected clocks, which can leave the
  default runtime path without a real timer.
- **Impact:** Production timeout policies need to race against wall-clock
  timers while tests can still supply deterministic clocks.
- **Why Patch?** git-warp depends on timeout enforcement before the upstream
  package has released equivalent system-clock behavior.
- **Status:** Required until upstream ships the same real-clock fallback and
  timer cleanup semantics.

### `@git-stunts/trailer-codec@2.1.1`

- **Issue:** The package ships JavaScript without bundled TypeScript
  declarations.
- **Impact:** git-warp would otherwise need ambient declarations in its own
  source tree, making dependency runtime drift harder to notice.
- **Why Patch?** Keeping declarations beside the dependency gives the
  TypeScript compiler a package-local contract while preserving the runtime
  dependency.
- **Status:** Required until upstream publishes equivalent package
  declarations.
