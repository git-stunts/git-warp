# 0095 Hygiene Quarantine Graduation

- Outcome: `hill met`
- Cycle doc: [docs/design/0095-hygiene-quarantine-graduation.md](../../../design/0095-hygiene-quarantine-graduation.md)
- Release lane: `v17.0.0`

## Conclusion

The two HYGIENE quarantine manifests are now paid down to empty
`files` arrays:

- `policy/quarantines/HYGIENE-consistent-type-imports.json`
- `policy/quarantines/HYGIENE-restrict-template-expressions.json`

This removes the hygiene portion of the branch-level
`lint:quarantine-graduate` failure. It does not complete the full v17
quarantine blocker; that gate still fails honestly on the remaining
0025 anti-sludge manifests.

## What Changed

- Added `test/conformance/hygieneQuarantineGraduation.test.ts` as the
  executable spec for empty HYGIENE manifests.
- Replaced inline `import()` type annotations with explicit type imports
  in the former `consistent-type-imports` manifest files.
- Normalized nullable, optional, impossible, and raw-display values
  before template interpolation in the former
  `restrict-template-expressions` manifest files.
- Removed the stale `src/domain/warp/_internal.ts` manifest entry
  because that file no longer exists.
- Fixed strict-rule collateral exposed by emptying file-level HYGIENE
  overrides instead of preserving the exemptions.
- Updated the prior 0094 retro wording so the branch-level quarantine
  failure is described as a real branch blocker, not an externality.

## Witness

| Command | Result |
|---|---|
| `npx vitest run test/conformance/hygieneQuarantineGraduation.test.ts` | RED failed for the intended manifest-not-empty reason |
| `npx vitest run test/conformance/hygieneQuarantineGraduation.test.ts test/unit/scripts/type-import-hygiene-shape.test.ts` | GREEN passed, 2 files / 4 tests |
| `npx eslint <former HYGIENE manifest file set>` | passed, zero messages |
| `npm run typecheck` | passed |
| `npm run lint:semgrep` | passed, 941 quarantined hits suppressed |
| `npm run lint:sludge` | passed |
| `npm run lint:quarantine-graduate` | expected fail, 144 non-HYGIENE accusations |
| `git diff --check` | passed |

Final quarantine-graduate family counts:

| Manifest | Accusations |
|---|---:|
| `0025A-casts` | 13 |
| `0025B-boundary` | 115 |
| `0025C-fake-models` | 12 |
| `0025D-import-law` | 4 |
| `HYGIENE-consistent-type-imports` | 0 |
| `HYGIENE-restrict-template-expressions` | 0 |

## Playback

Agent perspective:

- The HYGIENE manifests are empty and still present as historical rule
  artifacts.
- The former manifest file set passes ESLint without HYGIENE overrides.
- The branch-level quarantine gate now fails only for non-HYGIENE
  anti-sludge manifests.

Human perspective:

- The 0054 hygiene bridge is visibly paid down in repo files.
- The remaining v17 blocker is clearer: finish `0025A`, `0025B`,
  `0025C`, and `0025D`, with `0025B-boundary` as the largest shard.
- The prior "external failure" framing was corrected; the branch gate is
  real and release-relevant.

## Drift

No negative drift. The cycle stayed inside the HYGIENE scope.

Positive drift: emptying file-level HYGIENE exemptions exposed unrelated
strict-rule failures in a few former manifest files. Those failures were
fixed immediately, preserving the meaning of empty manifests.

## Follow-Ups

No new backlog items were created. The existing v17 0025 purge cards
already own the remaining branch-level quarantine blocker:

- `PROTO_purge-cast-hacks`
- `PROTO_purge-boundary-leaks`
- `PROTO_purge-fake-models`
- `PROTO_purge-import-law`
