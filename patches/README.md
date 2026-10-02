# Patches

This directory contains local modifications to dependencies, managed by [`patch-package`](https://github.com/ds300/patch-package).

## Rationale

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
