# 0117 v17 Plumber Recovery Contract

- Status: `design-only contract hill`
- Release lane: `v17.0.0`
- Source: `0117-v17-plumber-recovery-contract`
- Design role: name recovery semantics before more optic implementation
- Review audience: maintainers and future agents
- Depends on: `0113-v17-checkpoint-tail-optic-read-basis`

## Sponsor Human

James.

## Sponsor Agent

Codex.

## Hill

When a bounded optic read fails, the system exposes named recovery
operations instead of leaving callers to guess.

This cycle defines recovery operation names and applicability only. It does
not implement Plumber behavior.

## Why This Exists

The v17 checkpoint-tail optic path now has real capabilities and deliberate
fail-closed behavior:

```text
worldline.optic().node(id).read()
worldline.optic().node(id).prop(key).read()
```

The implementation refuses to guess when no bounded basis exists, when a tail
node remove would require raw liveness witnesses, when a tail property value
needs a parser the reducer does not own, or when a tail scan exceeds budget.
That is correct.

The gap is recovery. A failure without a named next operation is only half a
protocol. v17 needs failure modes that point to explicit Plumber work, never
hidden materialization.

## Playback Questions

Agent-facing:

- Can a future agent list the recovery operation identifiers for v17 optic
  failures without reading implementation code?
- Can a future agent tell which recovery applies to
  `E_OPTIC_NO_BOUNDED_BASIS` versus `E_OPTIC_TAIL_BUDGET_EXCEEDED`?
- Can a future agent preserve the no-materialization fallback rule while
  adding recovery hints later?

Human-facing:

- Can a maintainer explain what an operator should do after a bounded optic
  read fails?
- Can a maintainer reject ad hoc helper APIs that invent different recovery
  names?
- Can a maintainer tell that this cycle names contracts, not implementation
  scope?

## Accessibility / Assistive Reading Posture

This is a protocol naming document. The primary reading model is linear text
with short tables and exact operation identifiers. No visual layout or diagram
is required to understand the contract.

## Localization / Directionality Posture

Recovery operation identifiers are ASCII protocol names and are not localized.
Human-facing explanatory strings can be localized later, but the stable
operation identifiers and error codes remain direction-neutral tokens.

## Agent Inspectability / Explainability Posture

Every recovery operation below includes:

- identifier
- applies-to condition
- preconditions
- expected effect on bounded optic reads
- non-effect, where confusion is likely

Future implementation must preserve those fields in tests or docs before
exposing public Plumber APIs.

## Recovery Operation Identifiers

### `plumber.checkpoint.createIndexedBasis`

Creates a new indexed checkpoint basis for the target graph or worldline.

Applies when:

- no checkpoint ref exists
- the latest checkpoint is not schema 4 / index-tree backed
- checkpoint index shard maps are missing
- the bounded basis is stale in a way that leaves unsupported tail facts in
  the live suffix
- a node remove tail requires raw liveness witnesses
- an object or array property value appears only in the live tail and the v17
  reducer cannot parse it from tail witnesses
- tail scan budget exhaustion should be resolved by shortening the suffix

Preconditions:

- caller has write authority for the graph or selected worldline
- caller accepts that checkpoint creation is operational work
- current history can be read by the checkpoint builder's own explicit
  operational path

Expected effect:

- moves more history into a retained indexed checkpoint basis
- shortens or eliminates the live tail suffix for subsequent optic reads
- can turn previously unsupported tail facts into checkpoint-basis facts

Non-effect:

- does not change graph truth
- does not license hidden `_materializeGraph()` fallback inside optic reads
- does not broaden the v17 tail reducer

### `plumber.checkpoint.prewarmIndex`

Ensures an already-existing indexed checkpoint basis is locally available and
ready for targeted shard reads.

Applies when:

- checkpoint and index artifacts exist but are cold, remote, or not locally
  ready
- a caller wants to pay index-read setup cost before latency-sensitive optic
  reads
- an error contract later reports that a bounded basis exists but local
  artifacts need operational preparation

Preconditions:

- a usable checkpoint/index basis already exists
- the caller has read access to checkpoint and index payload storage
- missing blob storage or remote artifact access is an operator-visible
  configuration problem, not an optic fallback path

Expected effect:

- makes targeted checkpoint shard reads more likely to succeed without
  latency spikes
- does not change checkpoint frontier or graph truth

Non-effect:

- does not create a new checkpoint
- does not reduce an overlong live suffix
- does not parse unsupported tail facts

### `plumber.optic.retryWithExtendedBudget`

Retries a bounded optic read with an explicit caller-provided tail budget.

Applies when:

- the read failed with `E_OPTIC_TAIL_BUDGET_EXCEEDED`
- the caller has an explicit reason to pay a larger bounded scan cost
- creating a new indexed checkpoint is not the chosen recovery

Preconditions:

- caller supplies a concrete budget object
- budget semantics are defined by the future tail-budget contract
- retry remains bounded and observable

Expected effect:

- permits a larger but still bounded tail scan
- keeps recovery explicit at the call site

Non-effect:

- does not silently mutate default budgets
- does not turn bounded reads into unbounded materialization
- does not bypass reducer capability limits

## Error-To-Recovery Matrix

| Failure | Primary recovery | Secondary recovery |
| --- | --- | --- |
| `E_OPTIC_NO_BOUNDED_BASIS` / missing checkpoint | `plumber.checkpoint.createIndexedBasis` | none |
| `E_OPTIC_NO_BOUNDED_BASIS` / checkpoint lacks index tree | `plumber.checkpoint.createIndexedBasis` | none |
| `E_OPTIC_NO_BOUNDED_BASIS` / missing index shards | `plumber.checkpoint.createIndexedBasis` | `plumber.checkpoint.prewarmIndex` if artifacts exist |
| `E_OPTIC_NO_BOUNDED_BASIS` / tail node remove needs witnesses | `plumber.checkpoint.createIndexedBasis` | none |
| `E_OPTIC_NO_BOUNDED_BASIS` / tail property value needs parser | `plumber.checkpoint.createIndexedBasis` | none |
| `E_OPTIC_TAIL_BUDGET_EXCEEDED` | `plumber.checkpoint.createIndexedBasis` | `plumber.optic.retryWithExtendedBudget` |

## Binding Rules

- Optic reads must not call recovery operations implicitly.
- Recovery operations are Plumber operations, not fallback branches.
- Error handling may suggest recovery identifiers, but must not perform them.
- Recovery identifiers are stable protocol names once implementation begins.
- Recovery docs must distinguish "creates a better basis" from "retries with
  a larger budget."
- A recovery operation that materializes internally must be explicit
  operational work, never part of `worldline.optic().node(...).read()`.

## Non-Goals

- No Plumber implementation.
- No public API method shape beyond stable operation identifiers.
- No raw liveness witness support.
- No property parser broadening.
- No max-tail budget implementation.
- No Continuum packet format.
- No Echo interop.
- No hidden `_materializeGraph()` fallback.
- No release artifact, tag, or version bump.

## Follow-On Backlog

These are deliberately separate hills:

- `0118-v17-optic-error-contract.md`
- `0119-v17-tail-budget-semantics.md`
- `PROTO_v17-reducer-capability-boundary.md`

## Validation

Run for this design-only cycle:

```sh
npx markdownlint docs/design/0117-v17-plumber-recovery-contract.md \
  docs/design/0118-v17-optic-error-contract.md \
  docs/design/0119-v17-tail-budget-semantics.md \
  docs/method/backlog/up-next/PROTO_v17-reducer-capability-boundary.md
git diff --check
npm run lint:sludge
```

## SLUDGE STRIKER SUMMARY

### 1. Sludge Encountered

- Pattern: fail-closed reads with unnamed recovery.
  Status: recovery identifiers named before implementation.
- Pattern: helper-shaped temptation after tests go green.
  Status: rejected; recovery belongs to Plumber contract.

### 2. Sludge Fixed

- Named the v17 recovery operation identifiers.
- Mapped current optic failure classes to explicit recovery operations.
- Preserved the rule that optic reads never perform hidden recovery.

### 3. Sludge Rejected

- Rejected ad hoc helper APIs.
- Rejected implicit materialization fallback.
- Rejected broadening the reducer while naming recovery.

### 4. Sludge Deferred

- Stable optic error shape.
- Tail budget semantics.
- Reducer capability boundary.
- Actual Plumber implementation.
