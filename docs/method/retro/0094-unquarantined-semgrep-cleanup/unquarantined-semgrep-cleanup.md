# 0094 Unquarantined Semgrep Cleanup

- Outcome: `hill met`
- Cycle doc: [docs/design/0094-unquarantined-semgrep-cleanup.md](/Users/james/git/git-stunts/git-warp/docs/design/0094-unquarantined-semgrep-cleanup.md)

## What changed

- removed the 25 unquarantined Semgrep anti-sludge hits
- graduated touched files out of hygiene quarantines after fixing their
  active ESLint violations
- kept the legitimate `value: unknown): value is RawBag` type-guard
  boundary intact
- updated the HookInstaller test for the new non-interpolated error
  message

## Witness

- `npm run lint:semgrep`
- `npx eslint src/domain/services/HookInstaller.ts src/domain/services/ReceiptBuilder.ts src/domain/services/Worldline.ts src/domain/services/controllers/CheckpointController.ts src/domain/services/controllers/ComparisonSelector.ts src/domain/services/controllers/PatchDiscovery.ts src/domain/services/strand/conflictCandidateAnalysis.ts src/domain/services/strand/createStrandCoordinator.ts src/domain/services/strand/descriptorNormalization.ts src/domain/trust/reasonCodes.ts src/domain/types/conflict/validation.ts src/domain/utils/defaultCrypto.ts src/domain/warp/RuntimePatchCollector.ts`
- `npx vitest run test/unit/domain/services/HookInstaller.test.ts`
- `npm run typecheck`
- `npm run lint:sludge`
- `npx markdownlint docs/design/0094-unquarantined-semgrep-cleanup.md docs/method/retro/0094-unquarantined-semgrep-cleanup/unquarantined-semgrep-cleanup.md`
- `git diff --check`

## Known Branch-Level Failure

- `npm run lint:quarantine-graduate` still fails at the branch level
  because `release/v17.0.0` touches many quarantined files relative to
  `origin/main`. This is a real v17 release blocker, not an external
  failure. The files graduated in this slice were removed from the
  relevant hygiene manifests.
