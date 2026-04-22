---
id: PROTO_warpruntime-open-as-builder
blocked_by: []
blocks: []
feature: api-capabilities
---

# WarpRuntime.open() as a Builder pattern

**Effort:** M

## Idea

`open()` already does the honest thing — resolve all dependencies, then
construct. But it's a 150-line function that mixes dependency resolution,
validation, default wiring, and construction into a single procedural
blob. The reader has to trace the whole function to know what's
configured and what's defaulted.

What if `open()` were a Builder?

```js
const runtime = WarpRuntime.builder()
  .persistence(gitAdapter)
  .codec(cborCodec)
  .clock(ClockAdapter.global())
  .crypto(webCryptoAdapter)
  .withDefaultLogger()
  .withDefaultPorts()
  .build();
```

Each `.with*()` method validates its argument immediately — wrong type,
missing capability, incompatible combination — and stores it. The
builder accumulates a complete, validated configuration. `.build()`
constructs the runtime with all dependencies finalized. No surprises.

The builder is the honest factory. It shows you exactly what's been
configured, in what order, with what values. It's self-documenting. It
makes the 30-field options bag unnecessary — you see the chain and know
the shape.

Testing becomes trivial:

```js
const runtime = WarpRuntime.builder()
  .persistence(mockPersistence)
  .withDefaultPorts()
  .build();
```

No hunting through options to figure out which fields the test needs.
No "forgot to pass codec" errors 40 lines into a test setup. The
builder tells you what's missing at `.build()` time with a clear error:
"Cannot build WarpRuntime: missing required capability 'persistence'."

## Why cool

The builder pattern turns an opaque factory function into a transparent,
incremental, self-validating construction process. Every test in the
repo that calls `open()` with a bag of options would become clearer.
Every new developer reading the builder chain would understand the
dependency graph without reading the implementation.
