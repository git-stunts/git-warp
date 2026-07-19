# Git performance

Use this page when changing how git-warp or git-cas reads, writes, batches, or
retains data in a Git repository.

## Verdict

Do not implement a Git object database in git-warp or git-cas. Do not replace
stock Git with NodeGit, a libgit2 binding, or isomorphic-git as the canonical
backend.

The measured design is:

1. git-warp owns causal history semantics and asks git-cas to retain or cache
   immutable artifacts. git-warp does not manage Git CAS objects, packfiles, or
   a second artifact cache.
2. git-cas owns long-lived Git object sessions behind its persistence port.
3. Reads use one persistent `git cat-file --batch-command --buffer` process,
   bounded request windows, and bounded Git pack mappings.
4. Bulk writes use a backpressured `git fast-import` session followed by
   persistent `git mktree --batch` tree construction.
5. Ref publication, RootSet changes, commits, and multi-ref compare-and-swap
   continue to use stock Git's purpose-built commands.
6. Isolated writes may keep the existing one-shot path. The bulk path must be an
   explicit storage-neutral git-cas operation, not a public fast-import API.

This is not a compromise made for portability. On the page-shaped workload that
matches WARP materialization, persistent stock Git was faster than NodeGit and
used substantially less memory.

## What was actually slow

The hot path does not need `git --version`. Exploratory measurements used it
only as a process-startup control; the retained harness invokes it once after
timed scenarios to record the exact Git build in result metadata. No production
recommendation invokes it.

Before git-cas v6.5.2, the adapter started a fresh process for each blob write,
tree write, blob stream, tree lookup, and uncached object-info lookup:

- `hash-object -w --stdin` is invoked per blob. [cite: `git-cas/src/infrastructure/adapters/GitPersistenceAdapter.js#57-65@49b7d5cb9d589d73fa17d393e48d40bd6f139e57`]
- `mktree` is invoked per tree. [cite: `git-cas/src/infrastructure/adapters/GitPersistenceAdapter.js#68-79@49b7d5cb9d589d73fa17d393e48d40bd6f139e57`]
- `cat-file blob` is invoked per blob stream. [cite: `git-cas/src/infrastructure/adapters/GitPersistenceAdapter.js#120-132@49b7d5cb9d589d73fa17d393e48d40bd6f139e57`]
- `ls-tree` is invoked per uncached tree entry. [cite: `git-cas/src/infrastructure/adapters/GitPersistenceAdapter.js#150-165@49b7d5cb9d589d73fa17d393e48d40bd6f139e57`]
- `cat-file --batch-check` is already the right protocol, but a new process is
  created for one OID at a time. [cite: `git-cas/src/infrastructure/adapters/GitPersistenceAdapter.js#215-228@49b7d5cb9d589d73fa17d393e48d40bd6f139e57`]

On the measured Apple M1 Pro, one Git process had an approximately 18-20 ms
startup floor. The problem is therefore both process overhead and our use of
the process boundary: paying that floor once per object is self-inflicted.

git-cas v6.5.2 shipped bounded persistent object sessions, and v6.5.3 corrected
their visibility/retirement policy: `cat-file` survives successful immutable
writes, `mktree` survives loose writes, and `mktree` is retired after a bounded
`fast-import` pack write. The original process-per-object measurements below
remain the diagnosis and baseline, not a description of the current adapter.
[cite: `git-cas/src/infrastructure/adapters/GitPersistenceAdapter.js#93-175@7bdcbf1f9eccd16acd324c94d576e1ecd2e11d98`]

The 128-operation profile makes the distinction concrete:

| Packed workload               | One process per operation | Persistent Git | NodeGit |
| ----------------------------- | ------------------------: | -------------: | ------: |
| Object info                   |                2,255.7 ms |         3.1 ms |  4.8 ms |
| Blob read                     |                2,140.6 ms |         4.6 ms |  5.1 ms |
| Tree entry, uncached          |                2,169.7 ms |         6.2 ms |  2.7 ms |
| Tree entry, parsed-tree cache |                2,169.7 ms |        0.13 ms |  2.7 ms |

The complete loose and packed matrix is in the
[backend profile](../../spikes/git-access/results/2026-07-19T06-17-15-818Z.md).
Persistent Git matches or beats libgit2 for object metadata and packed blob
reads. Parsing one bounded tree page and caching its immutable entry index beats
re-entering either Git implementation for every path lookup.

### Published v6.5.3 consumer checkpoint

git-warp consumed the published npm artifact `@git-stunts/git-cas@6.5.3` with
`@git-stunts/plumbing@3.2.0` and repeated the temporary 128-node cold retained
materialization diagnostic three times. The injected plumbing counter began
after repository initialization, so it observed 398 workload Git children per
run; adding the excluded `git init` and two `git config` setup commands yields
the same 401 total recorded for the release candidate.

Every run produced the same major command counts:

| Command        | Processes |
| -------------- | --------: |
| `hash-object`  |       140 |
| `rev-parse`    |        87 |
| `symbolic-ref` |        43 |
| `update-ref`   |        43 |
| `commit-tree`  |        39 |
| `rev-list`     |        37 |
| `cat-file`     |         4 |
| `mktree`       |         1 |

The three local cold-materialization timings were 7.02 s, 7.18 s, and 6.67 s.
They are diagnostics only: this rerun used Node 26, did not capture process-tree
CPU/RSS, and intentionally did not reproduce the old timing harness. The
structural process counts are the comparable result. Focused real-Git retained
materialization, materialization-store, and trie integration tests passed 11/11
against the registry artifact.

This checkpoint proves that npm v6.5.3 matches the audited session topology. It
does not satisfy the versioned cold/warm/incremental benchmark contract in
[#759](https://github.com/git-stunts/git-warp/issues/759): that issue still
requires a committed corpus, process-tree CPU/RSS, repeated base/head CI runs,
and blocking regression thresholds.

## Bounded page reads

The resource workload used random 4 KiB objects so compression could not hide
I/O volume. Each backend ran in an isolated Node 24 worker with a 64 MiB V8
old-space limit. The profiler recorded operation wall time, aggregate process
CPU, the worker's maximum RSS, and a 20 ms sampled sum of RSS across Node and
its Git children.

Every write is read back through stock Git and byte-compared with the source
corpus after the timed region. Resource reads verify the embedded per-object
sequence and recompute each complete Git blob OID; the microprofile independently
byte-compares each backend's complete blob output.

For 65,536 pages totaling 256 MiB:

| Backend                              | Read window |     Wall | Peak process-tree RSS |      Throughput |
| ------------------------------------ | ----------: | -------: | --------------------: | --------------: |
| Persistent Git, default mmap         |  one object |   1.99 s |             347.7 MiB |  32,915 pages/s |
| Persistent Git, bounded mmap         |  one object |   1.89 s |             123.2 MiB |  34,621 pages/s |
| Persistent Git, bounded and buffered |     256 KiB | 634.8 ms |             179.7 MiB | 103,236 pages/s |
| NodeGit                              |  one object |   2.66 s |             420.2 MiB |  24,603 pages/s |

Evidence:

- [unbuffered Git comparison](../../spikes/git-access/results/2026-07-19T06-06-33-852Z-resources.md)
- [bounded buffered Git](../../spikes/git-access/results/2026-07-19T06-12-26-522Z-resources.md)
- [NodeGit page read](../../spikes/git-access/results/2026-07-19T06-06-53-334Z-resources.md)

The buffered stock-Git path was about 4.2 times faster than NodeGit and used
about 57% less peak RSS. It was about 3.0 times faster than the bounded
unbuffered path in this full-corpus scan.

The same bounded buffered path scanned 262,144 pages totaling 1 GiB in 5.63 s
with 158.7 MiB peak process-tree RSS. The corpus was 16 times the configured V8
old-space limit and more than six times the measured total RSS. See the
[1 GiB profile](../../spikes/git-access/results/2026-07-19T06-12-52-837Z-resources.md).

That result demonstrates that the path does not materialize the complete corpus
in memory. It does not mean a full-corpus scan is a normal optic. A bounded
observer should read only its causal support slice.

### Pack mapping policy

Git defaults to a 1 GiB pack mapping window and an effectively unlimited 32 TiB
simultaneous mapping limit on 64-bit platforms. A sequential scan can therefore
make a persistent `cat-file` child resident over most of a large pack. The spike
used:

```text
core.packedGitWindowSize=8m
core.packedGitLimit=32m
```

On a 256 MiB large-object scan, that setting reduced peak process-tree RSS from
about 379 MiB to 166-169 MiB for a roughly 12% wall-time cost. A 1 MiB mmap
window reduced RSS to 143-150 MiB while making the scan about 66% slower. See the
[mmap matrix](../../spikes/git-access/results/2026-07-19T06-06-10-981Z-resources.md).

These are per-process limits. A reader pool multiplies mapped memory, so the
default architecture should begin with one serialized reader and add a bounded
pool only after concurrent-observation benchmarks justify it. Git documents the
[pack window and limit tradeoff](https://git-scm.com/docs/git-config).

### Buffered read policy

Git documents `--batch-command --buffer` specifically as the efficient path for
large object batches; `flush` executes the bounded request window. See
[git-cat-file](https://git-scm.com/docs/git-cat-file.html).

The measured page-window curve was:

|  Window | Wall for 256 MiB |  Peak RSS |
| ------: | ---------------: | --------: |
|  64 KiB |         712.9 ms | 162.6 MiB |
| 256 KiB |         634.8 ms | 179.7 MiB |
|   1 MiB |         611.6 ms | 201.0 MiB |

The 256 KiB window is the current knee. Moving to 1 MiB improved wall time by
only about 4% while increasing peak RSS by about 12%; moving down to 64 KiB saved
about 10% RSS while increasing wall time by about 12%. The production API must
accept a byte budget, not merely an object count, because one object can be much
larger than a page.

## Bulk writes

The page-write workload used 65,536 random 4 KiB objects totaling 256 MiB:

| Backend                                    |    Wall |  Peak RSS | Resulting object layout             |
| ------------------------------------------ | ------: | --------: | ----------------------------------- |
| `fast-import`, normal compression          | 10.54 s |  94.7 MiB | one pack, about 259 MiB             |
| `fast-import`, no delta and no compression |  7.29 s |  95.6 MiB | one pack, about 259 MiB             |
| NodeGit                                    | 49.96 s | 123.2 MiB | 65,536 loose objects, about 512 MiB |
| Node-API libgit2                           | 49.07 s |  99.6 MiB | 65,536 loose objects, about 512 MiB |
| isomorphic-git                             | 28.87 s | 144.3 MiB | 65,536 loose objects, about 512 MiB |

Evidence:

- [all page-write backends](../../spikes/git-access/results/2026-07-19T06-07-10-515Z-resources.md)
- [uncompressed fast-import](../../spikes/git-access/results/2026-07-19T06-15-46-212Z-resources.md)

The fast-import path is the clear materialization writer. It is 4.0-6.9 times
faster than the alternatives after tuning for incompressible data, uses bounded
memory, avoids loose-object explosion, and remains stock Git.

The conclusion is workload-specific. At git-cas's default 256 KiB chunk size,
random-looking data produced this result:

| Backend                           | Wall for 1,024 chunks |  Peak RSS |
| --------------------------------- | --------------------: | --------: |
| `fast-import`, normal compression |               11.66 s |  98.8 MiB |
| `fast-import`, no compression     |                7.28 s | 103.6 MiB |
| NodeGit                           |                6.20 s | 123.2 MiB |
| Node-API libgit2                  |                6.39 s | 105.2 MiB |
| isomorphic-git                    |                6.14 s | 124.2 MiB |

See the [256 KiB random-chunk profile](../../spikes/git-access/results/2026-07-19T06-13-49-188Z-resources.md).
The non-Git implementations are about 12-16% faster in this narrow loose-write
case. That advantage is not enough to make one of them the canonical backend:
they defer pack creation, do not preserve the full required semantics, and add
another implementation and distribution surface.

git-cas currently defaults to 256 KiB fixed chunks, and its CDC profile targets
256 KiB over a 64 KiB to 1 MiB range.
[cite: `git-cas/src/domain/services/CasService.js#51-68@49b7d5cb9d589d73fa17d393e48d40bd6f139e57`]
[cite: `git-cas/src/infrastructure/chunkers/CdcChunker.js#255-289@49b7d5cb9d589d73fa17d393e48d40bd6f139e57`]

### Compression policy

Compression must follow content posture:

- encrypted or already-compressed chunks are random-looking; use a
  no-compression bulk session after confirming object identity is independent of
  storage compression;
- materialization pages and plaintext metadata may be compressible; compare
  Git's default delta policy with a no-delta, level-1 compression session;
- mixed-posture stores should not share a write session whose compression policy
  is wrong for half its objects.

For 256 MiB of repetitive 256 KiB chunks, Git's default delta and compression
policy completed in 2.28 s and produced an approximately 315 KiB pack. A
no-delta, level-1 compression session completed in 1.95 s and produced an
approximately 1.2 MiB pack. No compression took 3.43 s and produced an
approximately 256 MiB pack. See the
[compressible profile](../../spikes/git-access/results/2026-07-19T06-16-04-863Z-resources.md).

Git documents fast-import's checkpoint, pack threshold, delta-depth, and
large-blob controls in [git-fast-import](https://git-scm.com/docs/git-fast-import/2.51.0.html).

## Semantic compatibility

Fast is not sufficient for git-cas. The backend must coexist with ordinary Git
and preserve object-format, alternate-ODB, ref, and maintenance behavior.

| Capability                         | Stock Git sessions | NodeGit              | Node-API libgit2               | isomorphic-git |
| ---------------------------------- | ------------------ | -------------------- | ------------------------------ | -------------- |
| SHA-256 repository read/write      | yes                | no                   | no                             | no             |
| Alternate object database read     | yes                | yes                  | API missing                    | no             |
| Packed arbitrary ref read          | yes                | yes                  | API missing for arbitrary refs | yes            |
| Arbitrary raw object metadata/read | yes                | yes                  | API incomplete                 | yes            |
| Tree write                         | yes                | yes                  | API missing                    | yes            |
| Multi-ref transactional CAS        | yes                | no equivalent tested | no                             | no             |

The executable matrix is in
[semantic compatibility](../../spikes/git-access/results/2026-07-19T06-56-00-883Z-semantics.md).
Notable observations:

- stock Git read and write sessions worked in SHA-256 repositories; every
  alternative failed the SHA-256 probe;
- NodeGit honored alternates and packed refs, but its tested alpha emitted a
  deprecated `Buffer()` warning and its generated `Odb.write` binding rejected
  the documented buffer argument, requiring a different blob API in the spike;
- the Node-API wrapper is promising for deployment, but its current surface has
  no arbitrary blob read/object-info API, no tree writer, no arbitrary custom-ref
  lookup, and no expected-old multi-ref transaction;
- isomorphic-git failed SHA-256 and alternates, and packed reads were much slower
  and more memory-intensive than persistent Git.

git-cas already depends on guarded single-ref mutation and a transactional
`verify` plus `create` operation for RootSet anchoring.
[cite: `git-cas/src/infrastructure/adapters/GitRefAdapter.js#110-136@49b7d5cb9d589d73fa17d393e48d40bd6f139e57`]
[cite: `git-cas/src/infrastructure/adapters/GitRefAdapter.js#138-169@49b7d5cb9d589d73fa17d393e48d40bd6f139e57`]
Keeping stock Git avoids reimplementing or weakening those guarantees.

## Write-session invariants

`fast-import` introduces explicit lifecycle obligations:

1. Marks return OIDs before other Git processes can read them.
2. A checkpoint closes and indexes the current pack; only then are its objects
   externally visible.
3. Retention publication must happen after checkpoint visibility and before a
   caller receives a durable retained result.
4. Graceful cancellation should finish or checkpoint the valid protocol when
   possible. A hard kill can leave an unreachable `tmp_pack_*` plus a
   `fast_import_crash_*` report; another run exited before creating either.
   Doctor must report crash residue when present before repair.
5. Normal concurrent `git gc` survived in the spike. Concurrent
   `git gc --prune=now` deleted an active temporary pack and caused checkpoint to
   fail. Object-write sessions and aggressive maintenance therefore require a
   shared exclusive lease. External prune-now GC is unsupported while a write
   session is active.
6. Checkpoint cadence must be bounded by bytes, object count, and elapsed time.
   This limits crash residue and maximum pack size without creating one pack per
   page.
7. Doctor must report active/abandoned import residue, pack count, pack age, and
   unreachable bytes. Repair may remove an abandoned temporary pack only when no
   live writer owns it.

Two concurrent fast-import sessions completed without corruption in the spike,
but allowing arbitrary parallel sessions creates extra packs and complicates
maintenance. Start with one git-cas-owned writer per repository.

## Target implementation boundary

### git-cas

git-cas should own these internal components:

- a persistent object reader over `cat-file --batch-command --buffer`;
- a byte-bounded `readMany` path and a single-object streaming path that drains
  unread bytes before releasing the protocol slot;
- bounded pack mapping configuration;
- a bounded immutable tree-page index keyed by tree OID;
- a bulk object writer over fast-import with backpressure, checkpoint receipts,
  compression posture, and a repository maintenance lease;
- a persistent `mktree --batch` writer;
- existing stock-Git ref and commit operations;
- doctor inspection and repair for abandoned import artifacts.

The public API must stay storage-neutral. Prefer a contract such as `storeMany`
or workspace-scoped ingestion over exposing `FastImportWriter`, pack options, or
Git marks. Existing staging workspaces are the natural lifetime for a bulk
session because they already own in-progress retention and promotion.

### git-warp

git-warp should not gain a Git object optimization API. Its materialization and
checkpoint adapters should submit bounded artifact streams to git-cas and retain
the returned handles. WARP refs and causal history remain behind the history
adapter; immutable pages, bundles, snapshots, and caches remain behind git-cas.

The raw tree-record parser belongs inside the git-cas Git adapter. Parsing Git's
stable tree object framing is not an object database implementation. Hashing,
compression, deltas, pack indexes, alternates, object formats, refs, and GC stay
owned by Git.

## Rollout sequence

1. Land persistent, bounded git-cas reads with protocol lifecycle tests.
2. Add buffered multi-read with a 256 KiB default byte window and caller budget.
3. Replace per-entry `ls-tree` lookups with bounded raw-tree page indexes.
4. Add workspace-scoped bulk writes, persistent mktree, checkpoint receipts,
   and the maintenance lease.
5. Add doctor findings and repair for abandoned fast-import artifacts.
6. Release git-cas and bump git-warp.
7. Route WARP page/property/checkpoint publication through the bulk git-cas
   contract without adding CAS management to git-warp.
8. Re-run application-level cold and warm observer benchmarks and remove any
   remaining process-per-object paths.

## Merge gates

The production change needs both performance and semantic gates:

- no process-per-object regression for object info, page reads, tree entry
  lookup, or bulk materialization writes;
- CPU, wall, and process-tree RSS reported separately;
- a repository corpus larger than the memory threshold, with a gate that proves
  successful bounded observation under the configured limit;
- loose and packed repositories, SHA-1 and SHA-256, alternates, packed refs, and
  linked-worktree coverage;
- reader/repack and reader/new-object concurrency;
- normal GC/write coexistence plus explicit rejection or serialization of
  prune-now maintenance;
- checkpoint visibility, graceful cancellation, hard-crash residue reporting,
  and doctor repair;
- output OID and byte equality checked against stock Git outside the timed
  region;
- Linux CI calibration before enforcing absolute thresholds. Use relative
  regression thresholds until the runner class is stable.

An initial local memory gate can use the measured 1 GiB page corpus and require
less than 192 MiB peak process-tree RSS with a 256 KiB request window. Treat that
as a calibration target, not a portable constant.

## Rejected directions

- **Implement our own Git:** rejected. The work would include object formats,
  packs, deltas, indexes, alternates, refs, transactions, worktrees, and GC
  safety. None of that is git-warp's product.
- **NodeGit as the canonical backend:** rejected. It does not support the tested
  SHA-256 repository, uses a native ABI surface, and did not beat persistent Git
  on WARP page reads or bulk page writes.
- **Node-API libgit2 as the canonical backend:** rejected for now. Distribution
  is better than NodeGit, but the required ODB, tree, custom-ref, and transaction
  surface is incomplete and SHA-256 failed.
- **isomorphic-git as the canonical backend:** rejected. It is another Git
  implementation, failed SHA-256 and alternates, and performed poorly on packed
  reads.
- **One Git process per object:** rejected for hot loops. Keep one-shot commands
  for low-frequency operations where a dedicated batch protocol does not exist.
- **Unbounded Git mmap defaults:** rejected for long-lived readers over large
  packs.
- **A git-warp memory or disk cache:** rejected. git-cas is the artifact cache;
  git-warp owns only semantic operation state and causal coordinates.

## Measurement limits

- Results are local measurements from an Apple M1 Pro, Node 24.12.0, and Apple
  Git 2.50.1. Linux CI must reproduce the ordering and establish runner-specific
  gates.
- The RSS sampler runs every 20 ms and can miss shorter peaks.
- `/usr/bin/time` provides aggregate process CPU using BSD output on macOS and
  GNU output on Linux; it is useful for relative comparison but does not
  attribute CPU between Node and Git.
- Random and repetitive corpora bracket compression behavior but do not replace
  benchmarks over actual encoded WARP pages and encrypted git-cas chunks.
- The spike validates one reader and bounded request batches. Production
  cancellation, backpressure, timeout, and process-restart behavior still need
  fault-injection tests.
- A full-corpus scan is a stress test. Ordinary optics must continue to select a
  bounded causal support set rather than making the faster scan an excuse to
  read everything.

## Reproduce

The isolated harness lives in [`spikes/git-access`](../../spikes/git-access/).
It creates disposable bare repositories outside the git-warp object database.

```sh
cd spikes/git-access
mise exec node@24.12.0 -- npm ci
mise exec node@24.12.0 -- npm run smoke
mise exec node@24.12.0 -- npm run profile
mise exec node@24.12.0 -- npm run profile:resources -- --quick
NODE_NO_WARNINGS=1 mise exec node@24.12.0 -- npm run semantics
```

## See also

- [Git substrate](git-substrate.md)
- [WARP state-cache materialization](cas-first-memoized-materialization.md)
- [Content and CAS](content-and-cas.md)
- [Optic reads](optic-reads.md)
