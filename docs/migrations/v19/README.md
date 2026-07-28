# v19 Public API Migration Guide

> **Status:** The public grammar shipped in `v19.0.0`. The retained-state
> migration described below requires `v19.0.1`; do not use the `v19.0.0`
> migrator on an authoritative repository. General generated-SDK publication
> remains future work.

v19 replaces the transitional storage- and timeline-shaped facade with one
application grammar:

```text
Write intents. Observe lanes. Keep receipts.
```

## Migrate Retained v18 State First

v19 does not read or append to an unmarked v18 retained substrate. Opening a
non-empty lane before migration fails with
`E_SUBSTRATE_MIGRATION_REQUIRED`; it does not write a v19 commit onto the v18
writer chain.

Stop every process that can write to the repository, make a normal repository
backup, and identify the graph name used by the application. Graph names are
not fixed: one Git repository may contain several independent WARP graphs.

Run the migration once:

```bash
npm exec --package=@git-stunts/git-warp@19.0.1 -- git-warp-v18-to-v19 \
  --repo /path/to/repository \
  --graph <graph-name>
```

The command first discovers every graph namespace in the repository. If the
requested name does not exist, it stops with `Graph not found` and lists each
graph it did find, its version posture, writer count, and ref count.

In an interactive terminal, a framed summary asks for confirmation before the
inventory begins. After confirmation, the command completes the migration in
one pass. It reports the current phase, writer, item count, and progress bar.
Use `--yes` for non-interactive automation and `--json` for a machine-readable
final report. Before confirmation, the summary also reports current Git object
storage, the scratch path, free space on the scratch and source Git volumes,
and whether scratch free space meets the operating budget.

### What the command does

The source repository is read-only until the final ref transaction:

```mermaid
flowchart LR
  source["Source repository<br/>authoritative refs"]
  inventory["Inventory<br/>refs + writer commits"]
  scratch["Scratch repository<br/>translated objects"]
  verify["Scratch verification<br/>reopen + append + read"]
  compare["Recheck source heads"]
  promote["Atomic ref transaction"]
  recovery["Recovery refs<br/>old objects retained"]

  source --> inventory
  inventory --> scratch
  scratch --> verify
  verify --> compare
  compare -->|all OIDs unchanged| promote
  compare -->|any OID changed| abort["Abort without cutover"]
  promote --> source
  promote --> recovery
```

At the Git level, migration does not edit commits in place. Git objects are
immutable:

1. It inventories refs below `refs/warp/<graph>/` and walks every writer
   commit from its ref toward its root.
2. It creates new blobs and trees for v19 git-cas asset handles.
3. It writes a new commit chain. Preserved author, committer, timestamp, tree,
   and message bytes can still produce a different commit OID because a
   translated commit names a different parent OID.
4. It builds a bounded v19 checkpoint and substrate marker in the scratch
   repository.
5. It proves that the scratch graph can reopen, accept a disposable append,
   return a bounded public reading, and produce a valid receipt.
6. It fetches the verified scratch objects into private import refs in the
   source repository.
7. One `git update-ref --stdin` transaction compares every original ref with
   its inventoried OID, archives the original refs, and promotes the verified
   refs. If any expected OID moved, the transaction fails as a unit.
8. It verifies the promoted graph. If that proof fails, another guarded ref
   transaction restores the original authoritative refs while retaining
   recovery refs for diagnosis.

Current v18 audit, intent, strand, overlay, braid, and trust publication refs
are carried through unchanged and included in the compare-and-swap inventory.
If one of those refs still targets a retired pre-v18 blob or tree shape, the
command fails before scratch work. Run the older one-shot migration first;
production v19 contains no fallback reader for that substrate.

The old refs and blob-backed state-cache payload roots remain reachable below:

```text
refs/warp/<graph>/recovery/v18-to-v19/<run-id>/
```

Keep those recovery refs until application reads, writes, and backups have
been independently confirmed. They are deliberately additive: migration does
not immediately reclaim old objects.

### Time, memory, and disk

Migration time scales mainly with writer-commit count, retained checkpoint
size, and Git process overhead. The command may look idle while Git is writing
or packing objects; follow the phase and progress display instead of the size
of the source repository alone.

The scratch and disposable verification repositories default to the operating
system's temporary volume. Use `--scratch-root <path>` to place all of them on
a volume with more space.

The preflight operating budget is the greater of:

```text
4 × current Git object-storage bytes

current Git object-storage bytes
  + current object count × scratch-filesystem allocation block size
```

The second term matters because migration writes many small loose objects. A
packed source object may occupy only a few bytes in a pack delta, while its
replacement still consumes at least one filesystem allocation block before
later Git maintenance packs it.

The preflight deliberately counts the complete object database, even when only
one of several graph namespaces is selected: shared and blob-indirected
objects cannot always be attributed reliably to one graph before inventory.
That makes the estimate conservative for multi-graph repositories.

In the 11,708-commit Think rehearsal, the source object database was about
78.5 MiB across 172,644 objects. A naive 2× estimate reported only 157 MiB,
but scratch exceeded 300 MiB while the new objects were loose. The
count-and-allocation formula recommends about 753 MiB on a 4 KiB-block
filesystem.

The budget is an operating minimum, not a mathematical upper bound. Object
reuse, pack layout, retained checkpoint state, and repository-local Git
configuration all affect the result.

The source repository can also grow because recovery refs keep the old graph
reachable while the promoted graph becomes authoritative. Do not expect the
source repository to shrink during migration. A later, separately approved
retention and garbage-collection decision is what can make old objects
collectable.

Production v19 public reads are bounded and do not decode a full graph state.
The one-shot migration has one explicit legacy bridge: it may decode a
monolithic v18 checkpoint, with a 64 MiB encoded-byte ceiling plus depth and
item limits, to seed bounded v19 indexes. Repositories without a usable
checkpoint fall back to replaying the complete writer history.

### Rehearse only when you mean to

The normal command performs the scratch proof and promotion in one invocation.
Use `--dry-run` only when you explicitly want a rehearsal whose result will be
discarded:

```bash
npm exec --package=@git-stunts/git-warp@19.0.1 -- git-warp-v18-to-v19 \
  --repo /path/to/repository \
  --graph <graph-name> \
  --dry-run
```

Because the scratch repository is intentionally deleted, a later normal run
must repeat the work. `--apply` remains accepted as a compatibility alias for
the normal one-pass behavior; it is no longer required.

For an encrypted v18 substrate, provide the passphrase through
`GIT_WARP_MIGRATION_PASSPHRASE`; never place it in command-line arguments or
the migration report.

The command is idempotent. Once the exact v19 substrate marker exists, reruns
verify the current repository and report `already-current`.

## Breaking Boundary

The package root has exactly one runtime value:

```typescript
import { Runtime } from '@git-stunts/git-warp';
```

The following root values are removed:

- `openWarp`
- `intent`
- `reading`

The following transitional root types are also removed:

- `Warp`
- `Timeline`
- `TimelineView`
- `DraftTimeline`
- `ReadingResult`
- `ReadReceipt`
- `JoinResult`
- `JoinReceipt`
- `WarpStorage`

They do not remain beside the v19 vocabulary. Source files supporting the
transition may still exist inside the repository, but package consumers cannot
import them through the package export map.

## Runtime Composition

Before:

```typescript
import { openWarp } from '@git-stunts/git-warp';
import { GitStorage } from '@git-stunts/git-warp/storage';

const storage = await GitStorage.open({ cwd: '.' });
const warp = await openWarp({ storage, writer: 'agent-1' });
const events = await warp.timeline('events');
```

After:

```typescript
import { Runtime } from '@git-stunts/git-warp';

const runtime = await Runtime.open({
  at: '.',
  writer: 'agent-1',
});
const events = await runtime.lane('events');
```

`Runtime.open()` owns production history, artifact, git-cas, and local Git
composition. Application code does not construct those dependencies.

`Runtime.close()` releases local resources only. It does not delete lanes,
rewrite history, revoke receipts, or change retention policy. Closing is
idempotent, waits for already-started local operations to reach their defined
terminal state, and rejects new work.

## Generated Domain SDKs

A generated "user" is an application-facing domain SDK module. It is not a
human account, login, authorization record, WARP writer, or Git identity. The
example module is named `users` because its application domain manages user
roles; another application might generate `orders`, `devices`, or
`deployments`.

Generic root builders are gone. Application code imports its generated domain
module:

```typescript
import { users } from './generated/users.generated.js';

const assignRole = users.intents.assignRole({
  subject: 'user:alice',
  role: 'admin',
});

const roleOfAlice = users.observers.roleOf({
  subject: 'user:alice',
});
```

Generated builders return validated, runtime-backed `Intent` and `Observer`
objects. Loose JSON envelopes are not accepted at Lane boundaries.

### What Wesley owns

[Wesley](https://github.com/flyingrobots/wesley) is a domain-free
GraphQL-to-IR compiler. "Domain-free" is the important boundary: Wesley reads
GraphQL structure, preserves directive arguments, and emits deterministic
TypeScript request types and operation metadata. It does not decide what an
intent means, how a Lane executes, or how git-warp stores data. See the pinned
[Wesley quick start](https://github.com/flyingrobots/wesley/blob/v0.3.0-alpha.1/README.md#quick-start)
for its compiler-level commands.

The application owns the semantic step. Its application-owned renderer checks
the directives it supports and binds them to the runtime-backed constructors
under `@git-stunts/git-warp/advanced`. The resulting domain module exposes only
validated `*.intents` and bounded `*.observers` to ordinary application code.

```mermaid
flowchart LR
  schema["Authored GraphQL schema<br/>domain operations + directives"]
  wesley["Wesley<br/>structure to deterministic metadata"]
  metadata["Generated request types<br/>and operation metadata"]
  renderer["Application-owned renderer<br/>validate + assign git-warp meaning"]
  sdk["Generated domain SDK<br/>intents + observers"]
  runtime["Runtime and Lane<br/>execute validated values"]

  schema --> wesley
  wesley --> metadata
  metadata --> renderer
  renderer --> sdk
  sdk --> runtime
```

This two-stage boundary prevents either tool from claiming knowledge it does
not have: Wesley owns structure, while the application renderer owns domain
meaning.

### Prerequisites

Use Node.js 22 or newer, install `@git-stunts/git-warp@19.0.1` in the
application, and install the exact Wesley version used by the executable
reference. Wesley is a native Rust CLI; install the
[Rust toolchain and Cargo](https://rustup.rs/) first when `cargo` is not
already available:

```bash
cargo install wesley-cli --version 0.3.0-alpha.1 --locked
wesley --version
```

The second command must report `0.3.0-alpha.1`. Pinning matters because Wesley
is pre-1.0 and its emitted metadata remains release-scoped.

### Reproduce the small reference first

The repository contains a small, non-Think example with two intents and two
observers:

- authored schema:
  `test/fixtures/generated-sdk/users.graphql`
- Wesley output:
  `test/fixtures/generated-sdk/users.wesley.generated.ts`
- application renderer:
  `scripts/generated-sdk/RenderUsersSdkFixture.ts`
- generated domain SDK:
  `test/fixtures/generated-sdk/users.generated.ts`
- write consumer:
  `test/fixtures/generated-sdk/consumer-write.ts`
- read consumer:
  `test/fixtures/generated-sdk/consumer-read.ts`
- packed-package, disposable-Git proof:
  `scripts/smoke-generated-sdk.sh`

From a git-warp checkout, reproduce and verify every generated byte:

```bash
npm ci
npm run generate:sdk-fixture
npm run check:sdk-fixture
npm run test:sdk-fixture
```

The final command packs git-warp, installs that tarball in a temporary Node
project, creates a disposable Git repository, writes through generated Intents,
repairs its bounded materialization basis, and reads through generated
Observers. It does not use or copy the Think database.

### Add the same workflow to an application

Keep one authored schema and one application renderer beside two checked-in
generated files:

```text
scripts/
  RenderUsersSdk.ts                    # authored application semantics
src/
  warp/
    users.graphql                      # authored domain structure
  generated/
    users.wesley.generated.ts          # generated by Wesley
    users.generated.ts                 # generated by the renderer
```

Add deterministic scripts to the application's `package.json`:

```json
{
  "scripts": {
    "generate:users:wesley": "wesley emit typescript --schema src/warp/users.graphql --out src/generated/users.wesley.generated.ts",
    "generate:users:sdk": "node scripts/RenderUsersSdk.ts --out src/generated/users.generated.ts",
    "generate:users": "npm run generate:users:wesley && npm run generate:users:sdk",
    "check:users": "npm run generate:users && git diff --exit-code -- src/generated"
  }
}
```

Start the application's schema and renderer from the executable reference
above:

1. Copy the directive vocabulary and required operations from
   `test/fixtures/generated-sdk/users.graphql`, then rename and extend them for
   the application domain.
2. Copy the pattern from
   `scripts/generated-sdk/RenderUsersSdkFixture.ts` into
   `scripts/RenderUsersSdk.ts`.
3. Change the renderer's Wesley-metadata import to the application's
   `src/generated/users.wesley.generated.ts`.
4. Keep explicit contract checks for every supported intent kind, reading kind,
   field binding, cardinality, decoder, and maximum reading count.
5. Emit runtime validation and only the supported root and `/advanced`
   imports shown by the reference.
6. Run generation and commit both generated files:

   ```bash
   npm run generate:users
   npm run check:users
   ```

git-warp v19.0.1 does not ship a universal renderer that guesses arbitrary
application semantics. The renderer is deliberately application-owned. The
checked-in reference supports `NODE_ADD`, `PROPERTY_SET`, bounded `PROPERTY`
Observers, string decoding, and the exact `registerUser`, `assignRole`,
`roleOf`, and `rolesOf` contracts. Add a new renderer mapping only when its
runtime meaning and bounds are explicit.

Application code consumes only the final generated module:

```typescript
import { Runtime } from '@git-stunts/git-warp';
import { users } from './generated/users.generated.js';

const runtime = await Runtime.open({
  at: './application-repo',
  writer: 'local',
});

try {
  const lane = await runtime.lane('users');
  await lane.write(
    users.intents.registerUser({
      subject: 'user:alice',
    }),
  );
  await lane.write(
    users.intents.assignRole({
      subject: 'user:alice',
      role: 'admin',
    }),
  );

  const observation = lane.observe(
    users.observers.roleOf({ subject: 'user:alice' }),
  );

  console.log((await observation.one()).value);
  console.log((await observation.receipt).status);
} finally {
  await runtime.close();
}
```

### Code generation is not retained-data migration

These are two separate migrations:

- the retained-substrate command rewrites Git objects and refs once; it does
  not modify application source;
- the Wesley and renderer path produces TypeScript source and does not open or
  mutate a retained WARP graph.

Application SDK generation may be completed and tested in a source branch
before the maintenance window. For cutover:

1. Build and test the v19 application and its generated SDK without opening the
   authoritative retained repository.
2. Stop every v18 and v19 process that can write the repository.
3. Back up the repository and run the one-shot retained-substrate migration.
4. Verify that the selected graph is current and keep its recovery refs.
5. Deploy the already-tested v19 application, then verify one application read,
   write, and Receipt.

Never start the v19 application against retained v18 data and expect source
generation to migrate it. Conversely, rerunning source generation never
rewrites Git refs or graph history.

## Write Migration

Before:

```typescript
const receipt = await timeline.write(
  intent.property.set({
    subject: 'user:alice',
    key: 'role',
    value: 'admin',
  })
);
```

After:

```typescript
const receipt = await events.write(
  users.intents.assignRole({
    subject: 'user:alice',
    role: 'admin',
  })
);
```

Write admission is a closed, witnessed causal classification:

```typescript
switch (receipt.outcome.kind) {
  case 'derived':
    break;
  case 'plural':
    preservePlurality(receipt.outcome.witness);
    break;
  case 'conflict':
    proposeResolution(receipt.outcome.witness);
    break;
  case 'obstruction':
    repairOrStop(receipt.outcome.witness);
    break;
}
```

`derived` and `plural` are both admitted but describe different topology.
`conflict` and `obstruction` are different recovery classes. Runtime failures
remain outside this four-way causal union.

## Observation Migration

Before:

```typescript
const result = await timeline.read(
  reading.property({ subject: 'user:alice', key: 'role' })
);

console.log(result.value);
console.log(result.receipt);
```

After:

```typescript
const observation = events.observe(
  users.observers.roleOf({ subject: 'user:alice' })
);

for await (const reading of observation) {
  console.log(reading.value);
}

const receipt = await observation.receipt;
```

The nouns are deliberately distinct:

- An `Observer` is a reusable executable plan.
- An `Observation` is one bounded execution against one Lane.
- A `Reading` is one emitted semantic value.
- A `Receipt` is the terminal operational record.

`Lane.observe()` is synchronous and returns a dormant Observation. Execution
starts on the first iterator advance, lawful convenience consumption, or
receipt demand. These paths share one execution.

Receipt-first demand drains Reading values with backpressure and discards them.
It does not collect the stream. A later Reading consumer is rejected because
each Observation has exactly one delivery owner.

`observation.one()` means exactly one Reading. It is not an alias for the first
available item. An unresolved bounded basis therefore leaves an obstructed
receipt and causes `one()` to report cardinality failure.

## Reading Shape

`Reading.value` is canonical. `payload` is reserved for encoded transport
envelopes.

```typescript
for await (const reading of observation) {
  consume(reading.value);
  audit(reading.coordinate, reading.support, reading.witnessRefs);
}
```

Operational result and epistemic support remain separate. An admitted write
does not automatically prove an observed claim, and a supported claim does not
change an admission conflict into a derived result.

## Admission And Settlement

Admission classifies how a proposed history meets a destination history:

```text
derived | plural | conflict | obstruction
```

Settlement is a later cross-lane operation. It is not another spelling of
admission and it does not automatically linearize lawful plurality.

The final v19 settlement contract is:

```typescript
const preview = await runtime.previewSettlement({
  source: draft,
  target: events,
});

inspect(preview);
const receipt = await runtime.settle(preview.plan);
```

The preview is non-authoritative. Its immutable plan is bound to exact source
and target frontiers, proposal, law, and policy. `settle()` revalidates those
bindings and must obstruct or reclassify a stale plan.

This settlement surface is still open implementation work. Do not ship code
that calls it until the corresponding v19 source and conformance evidence has
landed.

## Expert Subpaths

The intended v19 expert surfaces are:

```text
@git-stunts/git-warp/advanced
@git-stunts/git-warp/charts
@git-stunts/git-warp/diagnostics
@git-stunts/git-warp/testing
```

`/charts` provides graph-shaped derived observations. It does not describe the
durable ontology as a graph. Its first shipped Observer is a one-hop, bounded,
cursor-page neighborhood chart. `/testing` provides an isolated real-Git
`Runtime` harness without exposing storage construction at package root.

There is no public `/graph`, `/browser`, `/legacy`, or `/storage` package.
Production storage composition belongs to `Runtime.open()`; tests use the
explicit `/testing` harness.

## Symbol Map

| Before                         | v19 replacement                         |
| ------------------------------ | --------------------------------------- |
| `openWarp(options)`            | `Runtime.open({ at, writer })`          |
| `warp.timeline(name)`          | `runtime.lane(name)`                    |
| `timeline.write(intent.*)`     | `lane.write(generated.intents.*)`       |
| `timeline.read(reading.*)`     | `lane.observe(generated.observers.*)`   |
| `ReadingResult.value`          | streamed `Reading.value`                |
| `ReadingResult.receipt`        | `await Observation.receipt`             |
| `timeline.draft(name)`         | `runtime.fork(lane, { name })`          |
| `timeline.previewJoin(draft)`  | `runtime.previewSettlement(...)`        |
| `timeline.join(draft)`         | `runtime.settle(preview.plan)`           |
| `GitStorage.open({ cwd })`     | internal to `Runtime.open({ at })`       |
| `storage.close()`              | `runtime.close()`                        |
| `accepted` write status        | `derived` or `plural` admission          |
| `conflicted` write status      | `conflict` admission with witness        |
| `obstructed`/`rejected` write  | `obstruction` admission with reason      |
| root graph/query builders      | generated SDK or `/charts` observer      |

## Upgrade Sequence

1. Replace storage construction and `openWarp()` with `Runtime.open()`.
2. Rename application timeline variables and types to Lane.
3. Generate domain intent and observer builders with Wesley.
4. Replace generic root intent builders with generated intents.
5. Replace eager `read()` calls with streaming `observe()` consumption.
6. Move receipt handling from each Reading to the Observation terminal path.
7. Match all four admission variants exhaustively.
8. Keep existing cross-lane join code isolated until settlement plans land.
9. Replace graph-shaped reads with bounded `/charts` observers.
10. Verify that no import from the removed `/storage` subpath remains.

## Validation

Run the package and declaration gates before treating a migration as complete:

```bash
npm run typecheck
npm run typecheck:consumer
npm run typecheck:surface
npm run test:local
```

The source-backed root tests reject competing factories, transitional root
nouns, star exports, and substrate vocabulary in the generated declaration
closure.

## Related Reading

- [v19 public vocabulary checkpoint](../../topics/api/README.md)
- [Optic reads](../../topics/optic-reads.md)
- [Public API reference](../../topics/reference.md)
