# Getting Started

git-warp v19 has one root runtime value:

```text
Runtime
```

Applications write validated Intents to Lanes, run generated Observers, consume
Readings, and retain Receipts.

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

## Open a Runtime and Lane

```typescript
import { Runtime } from '@git-stunts/git-warp';
import { users } from './users.generated.js';

const runtime = await Runtime.open({
  at: './application-repo',
  writer: 'local',
});

try {
  const lane = await runtime.lane('users');

  const writeReceipt = await lane.write(
    users.intents.registerUser({ subject: 'user:alice' }),
  );

  console.log(writeReceipt.outcome.kind);
} finally {
  await runtime.close();
}
```

Use a stable writer identity for each independent clone or process that writes
to the same Lane.

## Write Intents

Each `lane.write(intent)` admits one validated Intent and returns a
`WriteReceipt`. The closed admission outcomes are:

- `derived`
- `plural`
- `conflict`
- `obstruction`

Operational outcomes and epistemic support are separate. Do not infer that an
accepted write has settled a strand.

## Observe bounded values

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

Receipts are the stable operational record of writes, observations, and
settlements. Application code should retain them when it needs auditability,
support evidence, or a later diagnostic handoff.

## Next steps

- [v19 API](api/README.md)
- [Generated SDK fixture](../../test/fixtures/generated-sdk/README.md)
- [CLI](cli.md)
- [Strands and Settlement](strands.md)
- [v18-to-v19 migration](../migrations/v19/README.md)
