# Getting Started

Applications write validated Intents through `Warp`, consume Readings from
generated Observers, and retain Receipts. Reads use the retained `Runtime` and
`Lane.observe()` path until
[#1052](https://github.com/git-stunts/git-warp/issues/1052) adds Optic reads.
Lanes are read-only.

## Install

```bash
npm install @git-stunts/git-warp
```

Generate your domain SDK with Wesley and an application-owned renderer. The
generated module supplies validated `*.intents` and `*.observers`; git-warp
owns their execution. The
[v19 migration guide](../migrations/v19/README.md#generated-domain-sdks)
explains what Wesley owns, installs the pinned compiler, shows the exact
two-stage generation scripts and expected files, and runs the small executable
`users` reference.

## Open a Warp and write

v21 writes go through `Warp`
([#1054](https://github.com/git-stunts/git-warp/issues/1054)). `Warp.open`
requires a `WarpAccessPort` that your application implements. Opening a Warp
grants nothing: the port decides each write.

```typescript
import {
  GitStorage, RetainedWriteReceipt, Runtime, Warp, WarpAccessPort,
  WarpAddress, WarpWriteGrant,
} from '@git-stunts/git-warp';
import type { WarpWriteRequest } from '@git-stunts/git-warp';
import { users } from './users.generated.js';

class LocalAccess extends WarpAccessPort {
  override authorizeWrite(request: WarpWriteRequest): Promise<WarpWriteGrant> {
    return Promise.resolve(new WarpWriteGrant({
      authority: `local:${request.writer}`,
      budget: { records: 256, bytes: 1_048_576, work: 10_000 },
    }));
  }
}

const warp = await Warp.open(
  WarpAddress.of(GitStorage.at('./application-repo'), 'users'),
  new LocalAccess(),
);
try {
  const receipt = await warp.as('local').execute([
    users.intents.registerUser({ subject: 'user:alice' }),
    users.intents.assignRole({ subject: 'user:alice', role: 'admin' }),
  ]);
  console.log(receipt instanceof RetainedWriteReceipt);
} finally {
  await warp.close();
}
```

Use a stable writer identity for each independent clone or process that writes
to the same graph.

A graph supports at most 4,096 writers. Use a bounded pool of writer IDs, not
one writer ID for each end user. A writer ID counts from its first write, and
nothing removes one yet. A new writer ID on a graph that already has 4,096 gets
an `UnpublishedWriteReceipt` with cause `writer-limit-reached`; the writers the
graph already has keep writing.

`execute` accepts one Intent or one non-empty ordered array. The array lowers
through one patch publication: either all of its edits become visible, or none
do. Atomicity never crosses graphs or separate `execute` calls.

`execute` returns one `WriteReceipt`: a `RetainedWriteReceipt`,
`UnretainedWriteReceipt`, `UnpublishedWriteReceipt` or
`IndeterminateWriteReceipt`. Narrow the variant with `instanceof` before you
read its fields. Only `RetainedWriteReceipt` carries a `Coordinate`. Its
`outcome.kind` is `derived` or `plural`, and its `occurrences` list the
subject of each `entity.add` by intent position.

## Observe bounded values

Until [#1052](https://github.com/git-stunts/git-warp/issues/1052) adds the
Optic read, reads use `Runtime.open()`, `runtime.lane()` and `lane.observe()`.
A Lane has no writes.

Prepare a missing local basis explicitly:

```bash
git warp repair \
  --repo ./application-repo \
  --lane users \
  --writer local \
  --action materialization
```

Then run a generated Observer:

```typescript
const runtime = await Runtime.open({
  at: './application-repo',
  writer: 'local',
});

try {
  const lane = await runtime.lane('users');
  const observation = lane.observe(
    users.observers.roleOf({ subject: 'user:alice' }),
  );

  const reading = await observation.one();
  const receipt = await observation.receipt;

  console.log(reading.value);
  console.log(receipt.status);
} finally {
  await runtime.close();
}
```

`lane.observe(observer)` constructs one dormant Observation synchronously.
Iterator demand, convenience methods such as `one()`, and awaiting `receipt`
share exactly one execution.

For multi-value Observers, consume the Observation as an async iterable:

```typescript
const observation = lane.observe(
  users.observers.rolesOf({
    subjects: ['user:alice', 'user:bob'],
  }),
);

for await (const reading of observation) {
  console.log(reading.value);
}

console.log((await observation.receipt).status);
```

## Keep Receipts

Receipts are the stable operational record of writes and observations. Application code should retain them when it needs auditability,
support evidence, or a later diagnostic handoff.

## Next steps

- [v19 API](api/README.md)
- [Generated SDK fixture](../../test/fixtures/generated-sdk/README.md)
- [CLI](cli.md)
- [Strands and Settlement](strands.md)
- [v18-to-v19 migration](../migrations/v19/README.md)
