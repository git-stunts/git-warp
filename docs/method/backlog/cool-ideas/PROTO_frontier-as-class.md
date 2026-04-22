---
id: PROTO_frontier-as-class
blocked_by: []
blocks: []
---

# Frontier as a proper class — the last great typedef

**Effort:** M

## Idea

Frontier is `Map<string, string>` with 9 free functions scattered
across the codebase. It's the most widely used typedef-only domain
concept we have. Every consumer imports the map, then imports the
functions, then calls `updateFrontier(frontier, 'alice', newSha)` like
it's 2003 and we're writing C with Maps.

A `Frontier` class would own everything:

```js
const frontier = Frontier.create();
frontier.advanceWriter('alice', newSha);
frontier.getWriters();          // string[]
frontier.get('alice');           // string | null
frontier.merge(otherFrontier);  // new Frontier
frontier.fingerprint();         // deterministic hash
frontier.clone();               // deep copy
```

The constructor enforces invariants: writer IDs are non-empty strings,
SHAs are 40-character hex. You can't accidentally put `undefined` in a
frontier. You can't silently merge two frontiers with incompatible
writers. The class tells you what's wrong and where.

Serialization moves to infrastructure (P5). The codec knows how to
encode a Frontier; the Frontier doesn't know it's being encoded. Clean
boundary.

This is arguably the single change that would most improve domain
readability. Every function that takes `frontier` as a `Map<string,
string>` parameter would instead take `Frontier` — and the reader
would know exactly what contract that parameter satisfies without
reading the implementation.

## Why cool

Nine free functions become seven methods. A typedef becomes a class.
A `Map<string, string>` becomes a domain concept with invariants.
The codebase gets measurably more honest at every callsite that
touches frontier data. This is what P1 was written for.
