# Patches

This directory contains local modifications to dependencies, managed by [`patch-package`](https://github.com/ds300/patch-package).

## Rationale

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
