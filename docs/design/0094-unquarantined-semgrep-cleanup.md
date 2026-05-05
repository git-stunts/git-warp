# 0094 Unquarantined Semgrep Cleanup

- Status: hill met
- Trigger: `npm run lint:semgrep` reported 25 unquarantined anti-sludge hits
- Release lane: `v17.0.0`

## Hill

Drive the unquarantined Semgrep anti-sludge count to zero without adding
new suppressions.

## What Failed

The gate reported four kinds of sludge:

- `unknown` text in domain comments, error messages, and loose helper
  types.
- `as unknown as` text in comments documenting prior cast removal.
- `*Like` names in comments describing transitional operation records.
- a stale comment in `defaultCrypto.ts` that still named a dynamic
  `node:crypto` import even though the file now imports the adapter.

Several files were also still listed in hygiene quarantines for
`consistent-type-imports` or `restrict-template-expressions`. Because
this slice touched those files, the hygiene residue had to be fixed and
the files graduated from the hygiene manifests.

## Decisions

- Replaced prose-level "unknown" with "loose", "raw",
  "unrecognized", or "unresolved" depending on context.
- Kept the legitimate type-guard boundary in
  `descriptorNormalization.isRawBag(value: unknown): value is RawBag`;
  the Semgrep rule explicitly permits that form.
- Replaced import-type annotations with named type imports in touched
  strand/controller files.
- Replaced the HookInstaller unreachable strategy interpolation with an
  exhaustiveness variable so `restrict-template-expressions` can stay
  enabled.
- Narrowed `RuntimePatchCollector` checkpoint provenance from a loose
  top type to `object | null`.

## Result

`npm run lint:semgrep` now passes with only quarantined hits suppressed.
The touched hygiene-quarantined files now pass their active ESLint rules
and were removed from the corresponding hygiene manifests.
