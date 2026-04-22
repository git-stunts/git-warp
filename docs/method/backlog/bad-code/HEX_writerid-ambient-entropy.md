---
id: HEX_writerid-ambient-entropy
blocked_by: []
blocks: []
---

# WriterId.js uses crypto.getRandomValues in domain

**Effort:** S

`WriterId.js:76-78` uses `globalThis.crypto.getRandomValues()` to
generate random writer IDs. This is ambient entropy in the domain
layer, violating the `no-ambient-entropy` invariant.

Writer IDs become persisted identity (ref paths, patch metadata).
If two replays generate different writer IDs, they produce different
ref layouts and different patch provenance.

## Suggested fix

Accept a pre-generated writer ID or an entropy source via parameter.
The CLI or application layer generates the ID using infrastructure
crypto; the domain only receives it.
