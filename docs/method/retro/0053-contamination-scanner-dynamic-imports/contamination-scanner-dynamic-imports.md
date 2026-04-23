# Retro — 0053 Contamination Scanner Dynamic Imports

## Outcome

`hill met`

The import-law scanner now sees dynamic `node:*` and dynamic
`infrastructure` imports in core code, and the two hidden violations this cycle
targeted are gone.

## What changed

- tightened `scripts/contamination-map.ts` to detect dynamic import-law
  violations with a narrow authorized-loader allowlist
- mirrored the same dynamic-import family in
  `semgrep/typescript-anti-sludge.yml`
- documented the sanctioned dynamic adapter-loader carve-out in
  `docs/ANTI_SLUDGE_POLICY.md`
- moved the roaring fallback loader into
  `src/infrastructure/adapters/RoaringLoaderAdapter.ts`
- refactored `defaultTrustCrypto.ts` and `roaring.ts` so they no longer reach
  directly for `node:*` in core
- recorded the newly surfaced static codec-wrapper leak as
  `HEX_domain-message-codec-wrapper-imports-infrastructure`

## Why this is better

The repo can no longer pretend import-law cleanliness by hiding behind dynamic
import blindspots.

The sanctioned loader carve-out is now explicit, auditable, and small, while
the scanner and Semgrep both agree on what counts as a violation.

## Next

Keep burning down the hygiene tail with
`HYGIENE_type-import-and-template-expression-purge`, then come back for the
commit-message codec hex cleanup as a separate runtime-boundary slice instead of
smearing it into scanner work.
