# Patches

This directory contains local modifications to dependencies, managed by [`patch-package`](https://github.com/ds300/patch-package).

## Rationale

### `@mapbox/node-pre-gyp@2.0.3`
- **Issue:** Uses deprecated legacy Node.js APIs (`url.parse`, `url.resolve`).
- **Impact:** Causes warnings and potential resolution failures in modern Node.js environments (Node 22+).
- **Why Patch?** Upstream maintenance on `mapbox/node-pre-gyp` is slow, and the package maintains strict backward compatibility with very old Node.js versions, preventing them from adopting the modern `URL` constructor.
- **Status:** Required until upstream releases a version that uses the modern `URL` API or until dependencies (like `roaring`) migrate away from `node-pre-gyp`.
