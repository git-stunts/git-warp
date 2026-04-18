# runtimeHelpers imports infrastructure adapters and branches on plumbing presence

**Effort:** M

## What's Wrong

`runtimeHelpers.ts` auto-constructs `CasBlobAdapter` and
`CborIndexStoreAdapter` from domain-side helpers and uses
`persistence.plumbing` presence to choose the path. This is another
domain-to-infrastructure composition leak.

## Why It Matters

The helper is effectively a hidden composition root inside
`src/domain/**`. That makes the domain depend on adapter details and
invites more `.plumbing` peeking over time.

## Evidence

- `src/domain/runtimeHelpers.ts:25`
- `src/domain/runtimeHelpers.ts:29`
- `src/domain/runtimeHelpers.ts:32`
- `src/domain/runtimeHelpers.ts:69`

## Suggested Fix

1. Remove infrastructure adapter imports from
   `src/domain/runtimeHelpers.ts`.
2. Push blob storage and index store construction into a composition
   root or explicit factory.
3. Replace plumbing-presence inference with explicit injected
   capabilities.
