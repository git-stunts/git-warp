---
id: INFRA_policy-as-port-streaming-resilience
blocked_by: []
blocks: []
feature: runtime-boundaries
---

# Policy-as-a-port for retries, timeouts, and streams

## Problem

`git-warp` currently imports Alfred directly in a few runtime and
infrastructure paths. That makes Alfred look like the policy model instead of
one provider of a `PolicyPort`.

The bigger issue is streaming. A plain `execute(() => Promise<T>)` wrapper is
not enough for `readBlobStream()`, patch scans, index shard streams, sync body
streams, and future git-cas streaming APIs. Resilience needs to preserve stream
lifetime, cancellation, backpressure, and partial-consumption behavior.

## Direction

Define a port owned by git-warp, for example:

```ts
interface OperationPolicyPort {
  execute<T>(operation: () => Promise<T>): Promise<T>;
  stream<T>(operation: () => Promise<AsyncIterable<T>>): Promise<AsyncIterable<T>>;
}
```

Alfred becomes an infrastructure adapter that implements the promise side and,
only where the semantics are honest, stream setup retries/timeouts. Runtime code
depends on the port, not on Alfred directly.

## Constraints

- Do not retry after a stream has yielded user-visible bytes unless the stream
  protocol is explicitly replayable and idempotent.
- Cancellation must be carried by an explicit signal or stream return path.
- CAS compare-and-swap failures must not be retried.
- Stream policies must be tested with partial consumption, thrown iterators,
  cancellation, and slow consumers.
- The old v17 `INFRA_git-cas-adapter-parity` successor is complete and
  archived; this card stands on the current git-cas adapter surface.

## Acceptance Criteria

- Domain and port code do not import `@git-stunts/alfred`.
- Infrastructure adapters receive a `PolicyPort` or a named null policy.
- `GitGraphAdapter`, sync HTTP clients, and git-cas adapters use the port.
- Streaming APIs have tests proving no hidden buffering and no unsafe retry
  after bytes are emitted.
