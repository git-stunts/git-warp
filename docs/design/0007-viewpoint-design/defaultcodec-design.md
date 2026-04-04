# defaultCodec → infrastructure: Design

## Problem

`src/domain/utils/defaultCodec.js` imports `cbor-x` directly — a
concrete codec dependency inside the domain layer. This violates P5
("Serialization Is the Codec's Problem") and the hexagonal boundary
(domain must not import infrastructure concerns).

24 domain files import `defaultCodec` as a fallback:
`const c = codec || defaultCodec;`

## Current State

Two CBOR codecs exist:

| File | Location | Shape |
|------|----------|-------|
| `defaultCodec.js` | `domain/utils/` | Plain object literal implementing CodecPort |
| `CborCodec.js` | `infrastructure/codecs/` | Class extending CodecPort |

Both do the same thing: recursive key sorting + cbor-x encode/decode.
`CborCodec` is more documented and stricter (validates Map keys).
`defaultCodec` is simpler but functionally equivalent.

## Design

**Move the implementation. Leave a re-export shim.**

1. `git mv` `defaultCodec.js` to
   `infrastructure/codecs/DefaultCodecAdapter.js`
2. Create a one-line re-export shim at `domain/utils/defaultCodec.js`:
   ```javascript
   export { default } from '../../infrastructure/codecs/DefaultCodecAdapter.js';
   ```
3. Update module JSDoc and description in the moved file
4. Update `bin/` and `test/` files that import directly from
   `domain/utils/defaultCodec.js` to import from the infrastructure
   path instead (they're outside domain — no need for the shim)

## Why a shim instead of updating 24 files?

- Zero behavioral change — all 24 domain consumers keep their
  existing import path
- The shim is a one-line bridge that makes the dependency direction
  explicit: domain → (shim) → infrastructure
- Bulk-updating 24 files is mechanical churn that adds risk without
  adding value
- The shim can be removed in a future cycle if we decide to inject
  the codec everywhere

## What about CborCodec?

Keep it. `CborCodec` is the explicit, class-based adapter for
consumers who want to construct a codec with options.
`DefaultCodecAdapter` is the pre-configured singleton for the
fallback pattern. Different use cases, both legitimate.

## Breaking changes

None. Import paths unchanged for domain consumers. `bin/` and `test/`
paths change but those are internal.
