# 0113 v17 Checkpoint Tail Optic Read Basis

- Status: `GREEN foundation slice`
- Release lane: `v17.0.0`
- Source: `0113-v17-checkpoint-tail-optic-read-basis`
- Design role: first implementation hill for v17 foundation optics
- Review audience: maintainers and future agents
- Doctrine: `0111-v17-optics-causal-slice-architecture.md`
- Delivery boundary: `0112-v17-foundation-delivery-plan.md`

## Hill

Prove the minimal optic read path can use `CheckpointTailWitnessLocator`
without `_materializeGraph()`.

The first GREEN must satisfy:

```text
worldline.optic().node(id).read()
uses CheckpointTailWitnessLocator
does not call _materializeGraph()
returns honest readIdentity
fails closed if no bounded basis exists
does not assume one writer or one scalar tail
```

This cycle started RED/design, then landed the smallest GREEN foundation slice.
It implements minimal live-worldline node and property optics backed by the
checkpoint-tail basis.

## Why This Exists

0112 names the v17-sized bounded read basis:

```text
latest usable checkpoint/index shard
+ live suffix scan after checkpoint frontier
+ entity/aspect filtering
+ honest readIdentity
```

That basis closes the dangerous gap between doctrine and implementation. Before
this hill, "read witnesses for entity/aspect" was correct but operationally
underspecified. 0113 pins the seam with tests before production code starts.

## RED Witnesses

The RED conformance file is:

```text
test/conformance/v17CheckpointTailOpticReadBasis.test.ts
```

It requires:

- `worldline.optic().node(id).read()` exists.
- Exact node read fails if `_materializeGraph()` is called.
- Exact node read returns `readIdentity`, not fake `stateHash`.
- `worldline.optic().node(id).prop(key).read()` obeys the same
  materialization and identity rules.
- No bounded basis fails closed with `E_OPTIC_NO_BOUNDED_BASIS`.
- The delivery plan forbids scalar-tail assumptions.

The RED is expected to fail today because `Worldline` does not expose
`optic()` yet. That is the point. GREEN should add the smallest real optic read
path and bounded basis; it must not hide a materialization fallback under the
new method.

## GREEN Slice

The GREEN implementation adds:

- `worldline.optic().node(id).read()`
- `worldline.optic().node(id).prop(key).read()`
- `CheckpointTailWitnessLocator`
- `readIdentity` for slice results
- fail-closed `E_OPTIC_NO_BOUNDED_BASIS`

The locator reads:

```text
checkpoint head commit message
checkpoint frontier payload
targeted checkpoint index shard
targeted checkpoint property shard
all writer suffixes after the checkpoint frontier
```

It does not read `state.cbor` and does not call `_materializeGraph()` on the
optic read path.

## Minimal Locator Contract

`CheckpointTailWitnessLocator` answers:

```text
For entity/aspect X at live frontier C, what bounded evidence can I use?
```

The answer is:

```text
base = latest usable checkpoint/index shard reading for entity/aspect
tail = live causal suffix after checkpoint frontier for entity/aspect
result = reduce(base reading + tail witnesses)
```

The checkpoint side may be a retained read basis rather than raw historical
witnesses. The live suffix side is actual tail witness evidence. The
`readIdentity` must name both.

## Causal Tail Rule

Tail after checkpoint frontier is a causal suffix problem.

It means:

```text
all lane/writer suffixes not covered by the checkpoint frontier
```

It does not mean:

```text
current writer tip - checkpoint tip
```

The fixture currently exposes a one-writer stale checkpoint case, but the
implementation must not bake that shape into the domain model.

## Fail-Closed Rule

If no bounded basis exists, fail closed:

```text
E_OPTIC_NO_BOUNDED_BASIS
```

If the live suffix scan exceeds budget, fail closed:

```text
E_OPTIC_TAIL_BUDGET_EXCEEDED
```

Recovery is explicit Plumber work such as prewarming indexes or creating a new
indexed checkpoint. Recovery is never a hidden `_materializeGraph()` call.

The current GREEN fails closed for tail node removals because the retained
checkpoint index basis does not carry raw node liveness dots. It also fails
closed for non-scalar tail property values until that parser boundary is
explicitly widened.

## Non-Goals

- No full Roaring bitmap index system.
- No CAS slice cache.
- No Continuum wire protocol.
- No Echo interop.
- No IPA or commitment work.
- No full traversal algebra.
- No hidden `_materializeGraph()` fallback.

## Validation

Run:

```sh
npx vitest run test/conformance/v17CheckpointTailOpticReadBasis.test.ts
npx eslint test/conformance/v17CheckpointTailOpticReadBasis.test.ts \
  src/domain/services/optic/CheckpointTailWitnessLocator.ts \
  src/domain/services/optic/WorldlineOptic.ts \
  src/domain/services/optic/NodeOptic.ts \
  src/domain/services/optic/NodePropertyOptic.ts \
  src/domain/services/optic/ReadIdentity.ts \
  src/domain/services/optic/NodeOpticReadResult.ts \
  src/domain/services/optic/NodePropertyOpticReadResult.ts \
  src/domain/services/Worldline.ts \
  src/domain/services/controllers/QueryController.ts \
  src/domain/warp/RuntimeHostProduct.ts
npm run typecheck
npx markdownlint docs/design/0113-v17-checkpoint-tail-optic-read-basis.md
git diff --check
npm run lint:sludge
```

Observed RED:

```text
test/conformance/v17CheckpointTailOpticReadBasis.test.ts
  3 failed | 1 passed

failed:
  requires exact node optic reads to avoid _materializeGraph()
  requires property optic reads to avoid _materializeGraph()
  requires missing bounded basis to fail closed without materialization

passed:
  keeps checkpoint tail semantics causal rather than scalar
```

Current failure reason:

```text
optic() must exist for v17 optic RED
```

Observed GREEN:

```text
test/conformance/v17CheckpointTailOpticReadBasis.test.ts
  4 passed
```

## SLUDGE STRIKER SUMMARY

### 1. Sludge Encountered

- Pattern: materialize-first read surface.
  Files: `Worldline`, `Observer`, query/provider paths.
  Status: fixed for the new minimal live-worldline optic path only.
- Pattern: bounded basis handwave.
  Files: future optic read implementation.
  Status: replaced by `CheckpointTailWitnessLocator`.
- Pattern: scalar-tail trap.
  Files: future checkpoint-tail locator.
  Status: rejected by RED/design language.

### 2. Sludge Fixed

- Added a minimal live-worldline optic path that does not call
  `_materializeGraph()`.
- Added checkpoint-tail bounded-basis reads for node liveness and property
  slices.
- Added `readIdentity` for optic results instead of `stateHash`.
- RED now protects the no-materialization, honest-identity, fail-closed, and
  causal-tail requirements.

### 3. Sludge Rejected

- Rejected fake `stateHash`.
- Rejected hidden `_materializeGraph()` fallback.
- Rejected one-writer tail assumptions.
- Rejected full Roaring/CAS cache as v17 foundation scope.
- Rejected Continuum protocol and proof-system work in 0113.

### 4. Sludge Deferred

- Calibrate `maxTailPatches`, `maxTailBytes`, and `maxTailMs`.
- Broaden property tail parsing beyond scalar and byte values.
- Support tail node removals without guessing when checkpoint liveness dots are
  unavailable.
- Decide the explicit Plumber recovery operation names.
