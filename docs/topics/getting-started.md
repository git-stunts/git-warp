# Getting Started With The Transitional Facade

This page documents the currently implemented transitional v19 facade. The
accepted [v19 public vocabulary checkpoint](api/) replaces timelines and
direct readings with Runtime, Lane, Observer, Observation, Reading, and Receipt
before release. This page remains runtime-honest while that implementation is
in progress; it is not the final v19 API contract.

The transitional facade opens timelines, writes intents, and returns receipts.
It does not expose the graph-first compatibility API from earlier releases.

## Install

```bash
npm install @git-stunts/git-warp
```

## Open WARP

```typescript
import { openWarp } from '@git-stunts/git-warp';
import { GitStorage } from '@git-stunts/git-warp/storage';

const storage = await GitStorage.open({ cwd: './security-repo' });
const warp = await openWarp({
  storage,
  writer: 'local',
});

const audit = await warp.timeline('security-audit');
```

Use a stable writer identity for each independent clone or process that writes
to the same timeline.

## Write Intents

```typescript
import { intent } from '@git-stunts/git-warp';

await audit.write(
  intent.node.add({
    subject: 'finding:oauth-state-mismatch',
  })
);

const receipt = await audit.write(
  intent.property.set({
    subject: 'finding:oauth-state-mismatch',
    key: 'severity',
    value: 'critical',
  })
);

if (receipt.outcome === 'accepted') {
  console.log(receipt.evidence?.basis.id);
} else {
  console.error(receipt.reason);
}
```

Every call writes one intent and returns a `WriteReceipt`. Treat
`receipt.outcome` as the settlement result. Accepted writes carry opaque causal
evidence handles; substrate identities are not part of normal control flow.

## Read A Bounded Value

```typescript
import { reading } from '@git-stunts/git-warp';

const severity = await audit.read(
  reading.property({
    subject: 'finding:oauth-state-mismatch',
    key: 'severity',
  })
);

const exists = await audit.read(
  reading.node.exists({
    subject: 'finding:oauth-state-mismatch',
  })
);

console.log(severity.value, severity.receipt);
console.log(exists.value, exists.receipt);
```

Readings ask bounded questions. The receipt records how the runtime supported
the answer. An accepted receipt carries opaque causal evidence. If no bounded
basis exists, `read()` returns an `obstructed` receipt with repair hints instead
of materializing the whole timeline.

Create or repair the operator-owned basis before retrying:

```bash
git warp checkpoint create --repo ./security-repo --graph security-audit
git warp doctor --repo ./security-repo --repair-state-cache
```

Read a bounded neighborhood with the same result-and-receipt shape:

```typescript
const related = await audit.read(
  reading.neighborhood({
    subject: 'finding:oauth-state-mismatch',
    direction: 'out',
    limit: 50,
  })
);
```

Use `readValue()` only when unresolved readings should throw instead of
participating in receipt-based control flow.

## Read At A Tick

```typescript
const tick = await audit.tick();
const historical = await audit.at(tick).read(
  reading.property({
    subject: 'finding:oauth-state-mismatch',
    key: 'severity',
  })
);
```

`TimelineView` is read-only. Formal coordinate and optic access lives under the
`advanced` subpath.

## Work In A Draft

```typescript
const draft = await audit.draft('review-severity');

await draft.write(
  intent.property.set({
    subject: 'finding:oauth-state-mismatch',
    key: 'severity',
    value: 'high',
  })
);

const preview = await audit.previewJoin(draft);
console.log(preview.receipt);
if (preview.receipt.outcome === 'accepted') {
  const joined = await audit.join(draft);
  console.log(joined.receipt);
}
```

Draft writes stay separate until joined. `previewJoin` and `join` are separate
methods so there is no boolean dry-run mode.

## Git Storage

`GitStorage` is one opaque repository-scoped handle. It composes timeline
history and git-cas services internally; application code does not construct
plumbing, CAS, cache, or retention adapters. Close it when the application is
finished to release local Git and git-cas processes. Closing storage does not
delete timelines, rewrite history, or change retention anchors.

WARP history lives under `refs/warp/**`, separate from source branches such as
`refs/heads/main`. Writing a timeline does not create a source-tree commit on
the checked-out branch.

## Removed Imports

The `@git-stunts/git-warp/browser` and `@git-stunts/git-warp/legacy` subpaths
are not part of v19. Migrate graph-first consumers before upgrading.

## Next Steps

- [v19 Public API](api/)
- [Querying](querying.md)
- [Content and CAS](content-and-cas.md)
- [Git substrate](git-substrate.md)
- [v19 migration guide](../migrations/v19/)
