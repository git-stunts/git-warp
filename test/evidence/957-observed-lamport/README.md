# Public observed-Lamport regression: issue 957

Source base: `ceb58e656ec5bc85f0ae5991bf2a55599693bbb3` (v20.0.0).
The test uses public Runtime exports in fresh Node processes and independent CLI repair.
It uses the copied source package, not a registry-installed consumer. Packed-consumer validation remains required before completion.

[Lossless raw RED output](red.txt.gz) records the actual outcomes.
In SHA-1, writer a's tip is Lamport 21. Writer b observes A19, exits, and writes through a new process.
Writer b's published Lamport is 1. The assertion fails: expected 1 to be greater than 21.

In SHA-256, substrate-marker publication fails before any Lamport assertion.
The history adapter supplies a 40-digit null old OID to a SHA-256 repository.
Issue [#985](https://github.com/git-stunts/git-warp/issues/985) owns that prerequisite.
It is a separate bootstrap failure, not a Lamport RED witness.

## Reproduction

Run the copied source in the shared guarded Docker worker:

```sh
bash scripts/run-in-docker.sh node node_modules/vitest/vitest.mjs run test/integration/application/Runtime.observedLamport.integration.test.ts --maxWorkers=1
```

The command above executes inside the admitted container.
On the host, use the enforced project guard and canonical host/heavy-work plus host/docker/git-warp-tests/ reservation.
Do not use the host test process or bypass the Docker guard.

[Launch contract](red-launch.json) records the image, source archive hash, bounds, and command.
[RED resources](red-resources.json) records measured storage, backing free space, output, and guard outcome.
The worker uses COPY input, a read-only root, one owned build volume, and quota-limited temporary filesystems.
The build volume has a monitored 20 GiB bound; it is not a filesystem quota.
The runtime tmpfs quota is 3 GiB, within the project's aggregate 4 GiB data budget.
The owned container stops before its reservation releases. Dependency caches remain in the reusable owned volume.

## Validation limits

Both regression cases fail on the baseline for the distinct reasons above.
The new test and process fixture passed targeted ESLint in that same guarded worker.
[Lint resources](lint-resources.json) records that check's guard outcome.
No production fix, GREEN witness, coverage result, full-suite result, or approval is claimed.
The required unseen-concurrency, stale-CAS, and complete compatibility cases remain open.

Manual SSJS review of the new fixtures: no new domain concept; boundary checks at process input;
behavior stays in the fixture; no message-text branching; no domain time or entropy; no trust casts.

The archived output retains the exact original bytes, including terminal escape sequences and trailing newlines.
Raw output SHA-256: `4df865a1583a95a84ccac89c06d73bdbea6f84d1ae46a6bae474b78ac9dedfd5`.

Public JSON receipts replace the guest home mount label with `<CONTAINER_HOME>` to satisfy the path policy.
Each records the original receipt SHA-256. Raw JSON remains preserved in the owned run-evidence store.
The normalization changes no numeric result, command, limit, source digest, or guard outcome.
