---
title: "Binary blake3(elementId) route-key derivation and routing helpers"
cycle: "0022-blake3-route-key"
design_doc: "docs/design/0022-blake3-route-key/blake3-route-key.md"
outcome: hill-met
drift_check: yes
---

# Cycle 0022 Retro — blake3 Route Key

**Status:** HILL MET

## Hill

Derive a uniformly distributed 32-byte route key from an element ID
via blake3. Extract nibbles at arbitrary depth for trie navigation.
Pure functions, no I/O.

## What ground was taken

### Code (three new files)

- `src/domain/errors/RouteKeyError.ts` — WarpError subclass with four
  codes (E_ROUTE_KEY_BYTES, E_ROUTE_KEY_EMPTY_ELEMENT,
  E_ROUTE_KEY_DEPTH, E_ROUTE_KEY_NIBBLE_BITS).
- `src/domain/orset/route/RouteKey.ts` — frozen class with:
  - Constructor validating 32-byte input, cloning to prevent mutation
  - `RouteKey.fromElement(element)` static factory using blake3
  - `nibbleAt(depth, nibbleBits)` with MSB-first extraction and bounds
    validation
  - `toHex()` helper for logging/tests
  - Supported nibble widths: 1, 2, 4, 8 bits
- `test/unit/domain/orset/route/RouteKey.test.ts` — 27 tests covering
  construction, derivation, extraction at all 4 nibble widths,
  boundary validation, and property-based distribution.

### Dependency added

`@noble/hashes@^2.2.0` — audited, pure JS, SSR-safe blake3
implementation. Selected over dedicated `blake3` npm package because
@noble has the stronger maintenance track record and broader runtime
compatibility (Node/Bun/Deno/browser).

### Seam README updated

`src/domain/orset/README.md` now marks `route/` as complete
(cycle 0022). Other planned subdirs remain pending.

## Playback

### Agent

1. *Is `RouteKey.fromElement(element)` deterministic for identical
   inputs?* Yes, verified by property-based test.
2. *Are different element IDs hashed to different keys?* Yes,
   sampled by 500 random pairs with no collisions.
3. *Is the first-nibble distribution roughly uniform across 1024
   samples?* Yes, all 16 buckets between 16 and 160 (expected ~64).
4. *Does `nibbleAt` extract bits MSB-first at all 4 supported widths
   (1, 2, 4, 8)?* Yes, byte-level tests confirm.
5. *Does the constructor freeze the instance?* Yes.
6. *Does the constructor clone input bytes?* Yes, verified by mutation
   test.
7. *Does out-of-range depth throw RouteKeyError?* Yes, with
   E_ROUTE_KEY_DEPTH code.

### Human

Deferred to review.

## Design decisions locked

- **blake3 via `@noble/hashes`**, not a dedicated blake3 package.
- **32-byte output, 256 bits total** — no shorter variant.
- **Supported nibble widths: 1, 2, 4, 8** — these divide 8 evenly so
  extraction never straddles a byte boundary.
- **MSB-first extraction** — depth 0 reads the most-significant
  bits of byte 0. This matches the conventional trie traversal order.
- **Validation in a helper** — `validateNibbleAtArgs` separates
  argument validation from extraction logic to satisfy the per-method
  complexity cap (max 5) and line cap (max 30).
- **Route keys live at `src/domain/orset/route/`**, per the seam
  README from cycle 0021.

## Drift

- None. The implementation stayed inside the backlog item's scope.
  The only new dependency is the one the design doc called for.

## New debt

- None. The module has no external coupling beyond `@noble/hashes`
  and the `RouteKeyError` error class.

## What comes next

`RouteKey` is a direct dependency of:
- `PROTO_trie-codec-and-geometry` — uses route keys to index trie
  entries
- `PROTO_shadow-trie-orset` — uses `RouteKey.fromElement(element)` to
  navigate the trie

Both are unblocked now. `PROTO_orsetlike-contract` (the ORSet seam
interface) is also unblocked and can proceed in parallel.

## Backlog maintenance

- [x] Seam README reflects the completed `route/` subdir
- [x] New dependency (`@noble/hashes`) recorded in package.json
- [x] No dead backlog refs
