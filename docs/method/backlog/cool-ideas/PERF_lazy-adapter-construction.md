# Lazy adapter construction for cold-start optimization

**Effort:** M

## Idea

`WarpRuntime.open()` constructs ALL adapters eagerly — patchJournal,
checkpointStore, indexStore, the works. But plenty of graphs never
checkpoint. Some never use indexes. A read-only consumer that just
wants to materialize and query is paying for adapter construction it
will never use.

What if adapters were lazy? `open()` validates all dependencies upfront
(the capability checks still run, the wiring is still proven correct)
but defers actual adapter construction until first use. The adapter slot
holds a thunk:

```js
this._checkpointStore = lazy(() => new CborCheckpointStoreAdapter(deps));
```

First access resolves the thunk, caches the result, returns the adapter.
Subsequent accesses return the cached instance. The thunk captures all
validated deps at construction time — no late binding surprises.

For a simple read-only graph that just materializes and queries, this
could skip 3 adapter constructions on cold start. For a graph that
never checkpoints, the checkpoint adapter never allocates. The boot
path stays honest — all deps validated, all capabilities proven — but
allocation is deferred to the moment of need.

The `lazy()` helper is trivial: a closure that replaces itself on first
call. Maybe 10 lines. The type signature is transparent: `lazy<T>(() =>
T): () => T`. No magic, no proxy, no framework.

## Why cool

Cold start for the common case (open, materialize, query, close) gets
faster without sacrificing any validation guarantees. The boot order
stays deterministic. The only thing that changes is when memory is
allocated — and "when you need it" is always the right answer.
