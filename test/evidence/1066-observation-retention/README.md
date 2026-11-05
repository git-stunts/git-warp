# Observation retention capability witness

[Issue #1066](https://github.com/git-stunts/git-warp/issues/1066) verifies the published storage primitives needed by [shared observation custody #1067](https://github.com/git-stunts/git-warp/issues/1067). This is a finite native dependency witness, not an implementation of public Coordinates or a complete retention guarantee.

On published git-cas 7.0.0 and Plumbing 3.3.3, six cases pass across SHA-1 and SHA-256. Each positive case publishes 129 independent history heads, retains them through three git-cas application publications with 63, 64 and 4 physical parents, removes all fixture source refs, closes the store, expires fixture reflogs, runs Git GC and reopens. Only the retaining application ref remains. Every original history commit and the original evidence bytes survive. A 65-parent control is refused without advancing that ref.

The metadata-only control retains an asset containing an original history OID as text. Its text survives GC while the named commit becomes unavailable. The pinned-cache control accepts two entries under a one-entry policy and preserves both across reopen/GC while reporting `policy.satisfied: false`. This is the published cache contract, not a cache defect; it cannot supply hard pre-publication reservation. [git-cas #157](https://github.com/git-stunts/git-cas/issues/157) owns the missing capacity capability. [Issue #990](https://github.com/git-stunts/git-warp/issues/990) remains the separate checkpoint carrier proof; this witness uses supported git-cas publication calls only.

Reproduce through the repository's COPY-based Docker entrypoint, under its shared-worker resource discipline:

```sh
npm run test:local -- test/integration/infrastructure/adapters/ObservationRetentionCapabilities.integration.test.ts
```

The retained focused phase ran the named file directly inside the existing guarded worker, then the configured test typecheck and targeted ESLint. All three checks exited successfully. The ordinary integration CI command also discovers this file; its additional whole-suite and attachment work is not claimed by the focused receipt.

The test source hash, dependency lock hash, exact source archive identity, toolchain image, command, results and enforced resource peaks are in [receipt.json](receipt.json). [Console output](console.txt) removes terminal color escapes and trailing blank lines; the original console hash is retained. The public resource summary replaces the container home path key with `<CONTAINER_HOME>` to satisfy path hygiene; its numbers and the raw resource hash are preserved. The source archive is a filesystem tar snapshot, not a Git archive hash. Raw legacy launch metadata contains a stale no-lock assertion; the actual outer workstation reservation and native worker queue were used, and the original raw evidence remains preserved.

The fixed cases use one test worker, small payloads and owned temporary repositories with cleanup. The guard enforces the existing 20 GiB build, 3 GiB runtime, generated-data/log and 50 GiB free-space bounds, with 4 CPU/8 GiB/768 PID limits. This witness does not establish asymptotic heap/work bounds, crash reconciliation, concurrent reservation admission, authorization, canonical observation identity or the final public receipt transitions. Those remain obligations of #1067, its upstream prerequisite and the public integration issues.
