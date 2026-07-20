# v19 Public API Migration Guide

> **Status:** Pre-release. The canonical Runtime, worldline Lane, Observer,
> streaming Observation, Reading, Receipt, and write-admission core has landed.
> Fork/settlement, generated SDK publication, charts/testing subpaths, and
> CLI/MCP vocabulary convergence remain tracked by issue #712.

v19 replaces the transitional storage- and timeline-shaped facade with one
application grammar:

```text
Write intents. Observe lanes. Keep receipts.
```

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

Generic root builders are gone. Application code should import a
Wesley-generated domain module:

```typescript
import { users } from './generated/users.js';

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
durable ontology as a graph. `/testing` owns dependency injection and fakes.
Both remain open v19 implementation work at the time of this guide.

There is no public `/graph`, `/browser`, or `/legacy` package. The transitional
`/storage` export remains only until testing and diagnostics no longer require
the explicit handle; ordinary v19 application code must use `Runtime.open()`.

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
9. Replace graph-shaped reads with `/charts` once that subpath ships.
10. Remove imports from `/storage` after diagnostics/testing migration lands.

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
