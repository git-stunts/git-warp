---
blocked_by: []
blocks: []
id: HYGIENE_contamination-scanner-dynamic-imports
parent_cycle: 0025
feature: runtime-boundaries
---

# Contamination scanner misses dynamic `node:*` imports

Surfaced during cycle 0025D (import-law remediation). The P6.5
contamination-map scanner and the ESLint `no-restricted-imports`
rule both only detect **static** `node:*` imports of the form
`from 'node:crypto'`. Neither catches:

- `await import('node:crypto')`
- `typeof import('node:crypto').createHash`
- `const x: typeof import('node:foo') = ...`

Two files currently exploit this blindspot in `src/domain/utils/`:

- **`src/domain/utils/defaultTrustCrypto.ts`** — uses
  `typeof import('node:crypto').createHash` and
  `await import('node:crypto')`.
- **`src/domain/utils/roaring.ts`** — uses
  `const { createRequire } = await import('node:module')`.

Both are real import-law violations (domain code reaching Node
platform APIs directly). They did not appear in the cycle 0025D
quarantine because the scanner regex required `from '...'` form.

## Related

Cycle 0025D itself converted `src/domain/utils/defaultCrypto.ts`
from a static `node:crypto` importer to a dynamic-import-of-adapter
pattern (`await import('../../infrastructure/adapters/NodeCryptoAdapter.ts')`).
That pattern also exploits the same scanner blindspot, but the
adapter is confined to one file and the delegation is explicit.

The broader question — "should dynamic imports count as static
imports for import-law purposes?" — is a policy decision. If yes,
the scanner and ESLint rule need extending. If no (dynamic imports
remain an escape hatch for composition roots), document that
explicitly in `docs/ANTI_SLUDGE_POLICY.md` and enumerate the
authorized call sites.

## Fix options

### Option A — Tighten the scanner

Extend `scripts/contamination-map.ts` detection patterns to match
dynamic-import forms:

- `import\s*\(\s*['"]node:[\w-]+`
- `typeof\s+import\s*\(\s*['"]node:[\w-]+`
- Same for `src/infrastructure/**` paths.

Extend Semgrep rules to mirror. ESLint `no-restricted-imports`
does not support dynamic imports natively; a custom
`no-restricted-dynamic-imports` rule or a Semgrep equivalent is
needed.

Then:
- `defaultTrustCrypto.ts` and `roaring.ts` get added to the 0025D
  manifest and graduate via per-file refactor.
- `defaultCrypto.ts` (the 0025D-rewritten version) also appears
  in the manifest and needs a different strategy (see Option B
  below, or the WarpRuntime.open composition-root pattern).

### Option B — Explicit composition-root carve-out

Document that `await import('<infrastructure path>')` is the
sanctioned composition-root pattern — as long as:
- The importer is structurally a composition root (e.g.
  `WarpRuntime.open`, `defaultCrypto` singleton).
- The dynamic-imported module is clearly marked as an adapter.
- No domain logic lives between the import and the call.

List the authorized files in the policy doc. Non-compositional
domain code should still fail the check.

## Scope

- One commit to extend the contamination scanner regex.
- N commits to graduate the two currently-hidden violations.
- One commit to document the decision in `ANTI_SLUDGE_POLICY.md`.

## Related files

- `scripts/contamination-map.ts` (detection patterns)
- `semgrep/typescript-anti-sludge.yml` (mirror rules)
- `eslint.config.js` (no-restricted-imports)
- `src/domain/utils/defaultTrustCrypto.ts` (hidden violation)
- `src/domain/utils/roaring.ts` (hidden violation)
- `src/domain/utils/defaultCrypto.ts` (relies on the blindspot post-0025D)
- `src/domain/WarpRuntime.ts` (existing composition-root pattern)
