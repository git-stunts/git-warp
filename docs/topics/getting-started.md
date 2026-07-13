# Getting Started

The v19 application API opens timelines, writes intents, and returns receipts.
It does not expose the graph-first compatibility API from earlier releases.

## Install

```bash
npm install @git-stunts/git-warp @git-stunts/plumbing
```

## Open WARP

```typescript
import { openWarp } from '@git-stunts/git-warp';
import { GitStorageAdapter } from '@git-stunts/git-warp/storage';
import GitPlumbing from '@git-stunts/plumbing';

const warp = await openWarp({
  storage: new GitStorageAdapter({
    plumbing: new GitPlumbing({ cwd: './security-repo' }),
  }),
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
  console.log(receipt.patchSha);
} else {
  console.error(receipt.reason);
}
```

Every call writes one intent and returns a `WriteReceipt`. Treat
`receipt.outcome` as the settlement result instead of treating a returned SHA
as the only success signal.

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
the answer. An accepted receipt carries checkpoint-tail evidence. If no bounded
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
