---
id: HEX_domain-utils-misplaced
blocked_by: []
blocks: []
feature: trie-state-storage
---

# Adapter and native bindings living in src/domain/utils/

**Effort:** M

## What's Wrong

- `defaultBlobStorage.js` defines `InMemoryBlobStorageAdapter` -- an
  adapter class living in domain, not infrastructure.
- `roaring.js` loads native C++ bindings / WASM in domain with a
  top-level `await` side effect.

Both violate hexagonal architecture: domain must not depend on
infrastructure, native bindings, or host-specific loading mechanisms.

## Suggested Fix

Move `InMemoryBlobStorageAdapter` to `src/infrastructure/adapters/`.
Move `roaring.js` to `src/infrastructure/` with lazy injection into
domain consumers via a port.
