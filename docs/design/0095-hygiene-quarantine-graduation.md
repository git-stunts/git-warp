# 0095 Hygiene Quarantine Graduation

- Status: `hill met`
- Release lane: `v17.0.0`
- Source: v17 branch quarantine-graduate blocker, cycle 0054 hygiene residue,
  and `policy/quarantines/HYGIENE-*.json`
- Sponsor human: James Ross
- Sponsor agent: Codex

## Hill

Both HYGIENE quarantine manifests are graduated to empty `files` arrays
without inline suppressions, and the remaining `lint:quarantine-graduate`
failure no longer includes any HYGIENE accusations.

## Why This Exists

Cycle 0054 activated two ESLint hygiene rules and left finite,
rule-scoped residue in quarantine manifests:

- `policy/quarantines/HYGIENE-consistent-type-imports.json`
- `policy/quarantines/HYGIENE-restrict-template-expressions.json`

That was a truthful bridge at the time. It is now blocking the v17
release branch because `scripts/quarantine-graduate-check.ts` is
branch-scoped: if `release/v17.0.0` touches a quarantined file relative
to `origin/main`, the file must be graduated or narrowed.

This cycle graduates the hygiene bridge. It does not pretend the full
branch gate is green. It removes the HYGIENE portion of that failure and
leaves the 0025A/B/C/D anti-sludge families as the next blockers.

## Current Evidence

The current branch diff against `origin/main` touches 2,575 files.
Before this cycle, quarantine graduation reports 165 manifest
accusations across 139 unique files. The HYGIENE subset is:

| Manifest | Manifest files | Branch accusations |
|---|---:|---:|
| `HYGIENE-consistent-type-imports.json` | 9 | 8 |
| `HYGIENE-restrict-template-expressions.json` | 13 | 13 |

One consistent-type-imports entry is stale because
`src/domain/warp/_internal.ts` no longer exists.

When the HYGIENE ESLint overrides are disabled in a temporary config,
the remaining live rule violations are:

| Rule | Live violations |
|---|---:|
| `@typescript-eslint/consistent-type-imports` | 13 |
| `@typescript-eslint/restrict-template-expressions` | 19 |

The live violations cluster into two repair shapes:

- replace inline `import()` type annotations with explicit
  `import type` declarations
- normalize nullish, `unknown`, and impossible values before template
  interpolation

## Playback Questions

### Agent

- After GREEN, do both HYGIENE manifests still exist with `files: []`?
- If the HYGIENE ESLint overrides are disabled, do the two rules report
  zero violations on the former manifest file set?
- Does `npm run lint:quarantine-graduate` either pass or fail only on
  non-HYGIENE manifests?
- Can I explain every code change as one of: type-import graduation,
  template-expression normalization, or stale manifest cleanup?

### Human

- Is it obvious that the 0054 hygiene bridge has been paid down rather
  than hidden behind broader anti-sludge work?
- Is it obvious why this cycle does not finish the full v17 branch
  quarantine blocker by itself?
- Are the remaining release blockers named clearly enough to continue
  the purge without relying on chat history?

## Accessibility / Assistive Reading Posture

Relevant. The outcome must be legible from files and command output
alone. A reader should not need color, UI state, or chat context to
understand which quarantine family was graduated and which families
remain.

## Localization / Directionality Posture

Low relevance. This is repository hygiene and lint-policy work. Error
message changes should keep plain, direct English and avoid punctuation
or formatting tricks that would make future localization harder.

## Agent Inspectability / Explainability Posture

High relevance. Agents need exact nouns:

- `HYGIENE-consistent-type-imports` means inline `import()` type
  annotations are no longer exempted.
- `HYGIENE-restrict-template-expressions` means interpolation operands
  are normalized before entering template strings.
- "Graduated" means the manifest entry is removed because the code now
  satisfies the rule.
- "Narrowed" means a file-level manifest entry is replaced with an
  inline suppression. This cycle should not narrow; it should graduate.

## Non-Goals

- Do not work the 0025A casts manifest in this cycle.
- Do not work the 0025B boundary manifest in this cycle.
- Do not work the 0025C fake-model manifest in this cycle.
- Do not work the 0025D import-law manifest in this cycle.
- Do not add inline suppressions for HYGIENE rules.
- Do not use casts, `any`, `unknown` in core, or shape theater to
  satisfy lint.
- Do not claim the full branch-level quarantine-graduate gate is green
  unless it actually is.

## Design

### 1. Add The Executable Spec

Add a conformance test that asserts both HYGIENE manifests have empty
`files` arrays. This test is the RED witness. It should fail before the
cleanup because the manifests currently list 22 total entries.

The test should remain small and concept-named. It should not become a
generic JSON helper drawer.

### 2. Graduate `consistent-type-imports`

For each live violation, replace inline `import()` type annotations with
named type imports. Keep runtime imports and type imports separate.

Expected files:

- `src/domain/runtimeHelpers.ts`
- `src/domain/services/controllers/SyncController.ts`
- `src/domain/services/provenance/btrOperations.ts`
- `src/domain/services/strand/StrandCoordinator.ts`
- `src/domain/services/strand/StrandDescriptorStore.ts`
- `src/domain/services/strand/StrandPatchService.ts`
- `src/domain/services/strand/conflictTargetIdentity.ts`

The stale entry for `src/domain/warp/_internal.ts` is removed from the
manifest because the file no longer exists.

### 3. Graduate `restrict-template-expressions`

For each live violation, normalize values before interpolation. The
normalization must preserve domain meaning:

- `string | undefined` gets an explicit fallback or prior branch
- `number | undefined` gets an explicit fallback or prior branch
- `number | null` gets an explicit fallback or prior branch
- `unknown` is narrowed before interpolation at the boundary where it is
  handled
- `never` exhaustiveness output is replaced with an explicit impossible
  branch form, not string interpolation theater

Expected files:

- `bin/cli/commands/doctor/checksAux.ts`
- `bin/cli/commands/install-hooks.ts`
- `bin/cli/commands/tree.ts`
- `bin/cli/shared.ts`
- `src/domain/services/MaterializedViewService.ts`
- `src/domain/services/WormholeService.ts`
- `src/domain/services/audit/AuditChainVerifier.ts`
- `src/domain/services/codec/TrailerValidation.ts`
- `src/domain/services/provenance/ProvenanceIndex.ts`
- `src/domain/services/state/checkpointHelpers.ts`
- `src/domain/trust/TrustRecordService.ts`
- `src/domain/utils/bytes.ts`

### 4. Empty The HYGIENE Manifests

After the code passes with the HYGIENE overrides disabled, update both
manifest files to:

```json
"files": []
```

Keep the manifests rather than deleting them so the rule history remains
discoverable and `eslint.config.ts` continues to have a stable, no-op
manifest read path.

### 5. Report The Remaining Gate Honestly

Run the branch-level quarantine ledger again. The expected result after
this cycle is:

- zero HYGIENE accusations
- remaining accusations only in `0025A`, `0025B`, `0025C`, and `0025D`

If the full `npm run lint:quarantine-graduate` command still fails, the
retro must say exactly which non-HYGIENE manifests remain. It must not
call the failure external, false, or irrelevant.

## Test Plan

### RED

- Add `test/conformance/hygieneQuarantineGraduation.test.ts`.
- The test asserts:
  - `HYGIENE-consistent-type-imports.json.files` is empty.
  - `HYGIENE-restrict-template-expressions.json.files` is empty.
- Run:
  - `npx vitest run test/conformance/hygieneQuarantineGraduation.test.ts`
- Expected RED:
  - the test fails because both manifests currently contain file entries.

### GREEN

- Fix the 13 live `consistent-type-imports` violations.
- Fix the 19 live `restrict-template-expressions` violations.
- Empty both HYGIENE manifest `files` arrays.
- Run:
  - `npx vitest run test/conformance/hygieneQuarantineGraduation.test.ts`
  - targeted ESLint over the former manifest file set
  - `npm run typecheck`
  - `npm run lint:semgrep`
  - `npm run lint:quarantine-graduate`
  - `git diff --check`

### Edge Cases

- Deleted files must be removed from manifests; they are not
  suppressions.
- CLI code may handle boundary-adjacent data, but interpolation of
  `unknown` still requires narrowing.
- Domain code must not use `String(value)` as a cheap way to hide
  missing modeling if the value has domain meaning.
- Type imports must not create runtime import cycles.

### Known Failure Modes

- Removing manifest entries before fixing code exposes lint failures.
- Adding inline suppressions would miss the hill.
- Replacing template violations with casts would violate the
  anti-sludge policy.
- A final `lint:quarantine-graduate` failure is acceptable only if the
  failure has zero HYGIENE accusations and names the remaining 0025
  blockers.

## RED Witness

Command:

```sh
npx vitest run test/conformance/hygieneQuarantineGraduation.test.ts
```

Result: failed for the intended reason. The test expected
`"files": []`, but `HYGIENE-consistent-type-imports.json` still listed
file entries.

## GREEN Witness

Commands:

```sh
npx vitest run test/conformance/hygieneQuarantineGraduation.test.ts test/unit/scripts/type-import-hygiene-shape.test.ts
npx eslint <former HYGIENE manifest file set>
npm run typecheck
npm run lint:semgrep
npm run lint:sludge
npm run lint:quarantine-graduate
git diff --check
```

Results:

| Command | Result |
|---|---|
| `npx vitest run test/conformance/hygieneQuarantineGraduation.test.ts test/unit/scripts/type-import-hygiene-shape.test.ts` | pass, 2 files / 4 tests |
| `npx eslint <former HYGIENE manifest file set>` | pass, zero messages |
| `npm run typecheck` | pass |
| `npm run lint:semgrep` | pass, 941 quarantined hits suppressed |
| `npm run lint:sludge` | pass |
| `npm run lint:quarantine-graduate` | expected fail, 144 non-HYGIENE accusations |
| `git diff --check` | pass |

The final quarantine-graduate family counts were:

| Manifest | Accusations |
|---|---:|
| `0025A-casts` | 13 |
| `0025B-boundary` | 115 |
| `0025C-fake-models` | 12 |
| `0025D-import-law` | 4 |
| `HYGIENE-consistent-type-imports` | 0 |
| `HYGIENE-restrict-template-expressions` | 0 |

## Playback

### Agent Answers

- Yes. Both HYGIENE manifests still exist and have `files: []`.
- Yes. With the manifests empty, targeted ESLint over the former
  manifest file set reports zero messages.
- Yes. `npm run lint:quarantine-graduate` fails only on non-HYGIENE
  manifests.
- Yes. The code changes are type-import graduation, template-expression
  normalization, stale manifest cleanup, or strict-rule collateral that
  became visible once file-level HYGIENE exemptions were removed.

### Human Answers

- Yes. The 0054 hygiene bridge is paid down in the manifest files
  themselves, not hidden behind chat or broader 0025 work.
- Yes. The full v17 branch blocker remains because 144 accusations
  still exist across `0025A`, `0025B`, `0025C`, and `0025D`.
- Yes. The next release blockers are now the four remaining 0025
  quarantine families, with `0025B-boundary` dominating the count.

## Drift Check

No negative drift from the hill.

One implementation drift improved the design: the former HYGIENE file
set had collateral strict-rule failures (`no-duplicate-imports`,
`require-await`, `complexity`, `max-lines-per-function`, and
`prefer-template`) that became visible only after the file-level
HYGIENE exemptions were removed. Those were fixed rather than hidden.

`npm run lint:quarantine-graduate` still fails, but that is not drift:
the cycle explicitly scoped the acceptable final failure to non-HYGIENE
manifests.
