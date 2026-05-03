# 0119 v17 Tail Budget Semantics

- Status: `design-only contract hill`
- Release lane: `v17.0.0`
- Source: `PROTO_v17-tail-budget-semantics`
- Design role: define bounded optic tail scan budget semantics
- Review audience: maintainers and future agents
- Depends on: `0118-v17-optic-error-contract`

## Sponsor Human

James.

## Sponsor Agent

Codex.

## Hill

Define exact semantics for v17 optic tail budgets so bounded reads fail
closed predictably instead of growing magic-number or auto-retry behavior.

This cycle is contract-only. It does not implement runtime behavior.

## Current Convention Audit

The current checkpoint-tail scanner has one runtime budget:

```text
maxTailPatches
```

It counts the number of live suffix patch entries loaded after the checkpoint
frontier across discovered writers. It is checked before entity/aspect
filtering, so unrelated tail patches still count against the budget. That is
the right default: the scanner must pay to inspect them before it can know
whether they touch the requested fact.

The current implementation uses an inclusive limit:

```text
scanned > maxTailPatches
```

So `maxTailPatches = N` permits exactly `N` scanned tail patches and fails on
the next observed excess. This design preserves that convention.

The v17 plan also names:

```text
maxTailBytes
maxTailMs
```

They are not implemented today. This design reserves their meanings before
runtime code appears.

## Why This Exists

Bounded reads are only meaningful if the bounds mean something stable.
Without a budget contract, future code can quietly turn tail scanning into:

- a release-local magic number
- adaptive retry by default
- partial success when the scan was incomplete
- hidden checkpoint creation
- hidden materialization
- host-local timing behavior inside deterministic domain code

Budgets are part of the optic protocol. They are not tuning knobs hidden in a
helper.

## Playback Questions

Agent-facing:

- Can a future agent implement `maxTailBytes` without inventing what counts as
  a byte?
- Can a future agent produce `E_OPTIC_TAIL_BUDGET_EXCEEDED` context fields
  from this document without naming drift?
- Can a future agent reject auto-budget increase and auto-retry behavior?

Human-facing:

- Can a maintainer explain why budget exhaustion returns no partial value?
- Can a maintainer tell when to use
  `plumber.optic.retryWithExtendedBudget` versus
  `plumber.checkpoint.createIndexedBasis`?
- Can a maintainer see which budgets are deterministic and which are
  host-local?

## Accessibility / Assistive Reading Posture

This is a protocol contract. The primary reading model is linear text and
small tables. Budget names, units, and error fields are literal tokens.

## Localization / Directionality Posture

Budget identifiers and error context fields are ASCII protocol tokens and are
not localized. Human-facing messages may be localized later, but callers must
branch on stable fields.

## Agent Inspectability / Explainability Posture

Every budget below names:

- what it counts
- unit
- whether enforcement is deterministic
- inclusive limit rule
- when it is checked
- required error context
- forbidden shortcuts

Future implementation tests should be directly derivable from these fields.

## Budget Names

The v17 tail budget object has these fields:

| Field | Unit | Status |
| --- | --- | --- |
| `maxTailPatches` | patch entries | implemented today |
| `maxTailBytes` | payload bytes | reserved by this contract |
| `maxTailMs` | milliseconds | reserved as host-local guard |

All budget values must be finite non-negative integers.

`0` is valid. It means the read may use the checkpoint basis only and must
fail if any live suffix work is required for the measured budget.

## `maxTailPatches`

Counts live suffix patch entries loaded after the checkpoint frontier.

Counting scope:

- all discovered writers
- all lane/writer suffix entries not covered by the checkpoint frontier
- entries counted before entity/aspect filtering
- entries counted whether or not they touch the requested node or property

Not counted:

- checkpoint commit message reads
- checkpoint frontier payload reads
- checkpoint index shard reads
- checkpoint property shard reads
- tail witness records emitted after filtering

Limit rule:

- inclusive
- `maxTailPatches = N` permits `N` scanned tail patch entries
- the read fails when accounting observes more than `N`

Determinism:

- deterministic when writer discovery and patch ordering are deterministic
- domain-safe
- suitable for core enforcement

Required exceeded context:

```text
budgetKind: "maxTailPatches"
budgetLimit: <configured patch count>
budgetObserved: <scanned patch count at failure>
budgetUnit: "patch"
```

## `maxTailBytes`

Counts tail patch payload bytes read to inspect live suffix patch entries
after the checkpoint frontier.

Counting scope:

- bytes of tail patch payloads fetched or decoded for suffix scanning
- bytes counted before entity/aspect filtering
- bytes counted for every discovered writer suffix visited by the scan

Not counted:

- checkpoint commit messages
- checkpoint frontier payloads
- checkpoint index shard payloads
- checkpoint property shard payloads
- in-memory object overhead
- CBOR decoder allocation overhead
- bytes from Plumber checkpoint creation or prewarming

Limit rule:

- inclusive
- `maxTailBytes = N` permits reading `N` tail patch payload bytes
- the read fails when accounting observes more than `N`

Determinism:

- deterministic only if the payload-byte measurement point is stable
- domain-safe only when the byte count is supplied by the storage/payload
  boundary as a concrete number
- must not estimate JavaScript heap cost

Required exceeded context:

```text
budgetKind: "maxTailBytes"
budgetLimit: <configured byte count>
budgetObserved: <tail payload bytes observed at failure>
budgetUnit: "byte"
```

## `maxTailMs`

Limits elapsed operational time spent scanning the live suffix.

Counting scope:

- host-observed elapsed time for the tail scan operation
- includes writer discovery, writer-tail loading, tail validation, and
  entity/aspect filtering when measured by the host boundary

Not counted:

- deterministic causal cost
- checkpoint creation
- caller time before invoking the read
- caller time after the read rejects

Limit rule:

- inclusive
- `maxTailMs = N` permits the scan to continue while elapsed time is less
  than or equal to `N`
- the read fails when host-observed elapsed time exceeds `N`

Determinism:

- host-local operational guard only
- must not read wall-clock time inside `src/domain/**`
- may be enforced only by a future adapter, host boundary, or explicit clock
  port design
- must not affect graph truth or read identity semantics

Required exceeded context:

```text
budgetKind: "maxTailMs"
budgetLimit: <configured millisecond count>
budgetObserved: <elapsed millisecond count at failure>
budgetUnit: "millisecond"
```

## Multiple Budgets

When multiple budgets are set, all active budgets apply.

Rules:

- the read fails closed as soon as any active budget is exceeded
- no partial value is returned
- the reported `budgetKind` is the budget that caused failure
- if one accounting step exceeds multiple deterministic budgets, report in
  this priority order:
  1. `maxTailPatches`
  2. `maxTailBytes`
  3. `maxTailMs`
- if a host-local `maxTailMs` guard aborts independently, report
  `maxTailMs`

This priority rule exists to keep tests stable. It does not make
`maxTailMs` deterministic.

## Default Budget Source

The default v17 tail budget is a release parameter, not graph truth.

Current default:

```text
maxTailPatches = 10000
```

Rules:

- default budgets must be documented constants
- defaults must not depend on ambient machine state
- defaults must not silently change during a read
- defaults must not auto-increase after failure
- runtime code must not choose a larger default because a read is important

Future default values for `maxTailBytes` and `maxTailMs` must be added by a
separate implementation or contract update. This design reserves semantics
only.

## Caller Overrides

Caller-supplied budget overrides must be explicit.

Future shape, expressed as contract rather than implementation:

```text
{
  maxTailPatches?: integer,
  maxTailBytes?: integer,
  maxTailMs?: integer
}
```

Rules:

- omitted fields use defaults
- supplied fields replace defaults for that read or explicit retry only
- overrides must be finite non-negative integers
- overrides must be visible in failure context when they are the exceeded
  budget
- overrides must not mutate global defaults
- overrides must not persist unless an explicit configuration API later says
  so

## `E_OPTIC_TAIL_BUDGET_EXCEEDED`

Budget exhaustion fails with:

```text
E_OPTIC_TAIL_BUDGET_EXCEEDED
```

Required context fields from 0118:

- `graphName`
- `opticKind`
- `target`
- `cause`
- `recoveryHints`
- `budgetKind`
- `budgetLimit`
- `budgetObserved`

Budget contract additions:

- `budgetUnit`

Required values:

```text
cause: "tail-budget-exceeded"
recoveryHints: [
  {
    operation: "plumber.checkpoint.createIndexedBasis",
    retryMaySucceedAfterRecovery: true,
    requiresCallerConsent: true
  },
  {
    operation: "plumber.optic.retryWithExtendedBudget",
    retryMaySucceedAfterRecovery: true,
    requiresCallerConsent: true
  }
]
```

The first hint is preferred because creating a fresher indexed basis reduces
future tail work. Extended-budget retry is explicit caller-owned operational
work.

## `plumber.optic.retryWithExtendedBudget`

Allowed meaning:

- re-execute the same optic intent with an explicit caller-provided larger
  budget
- preserve bounded-read semantics
- preserve reducer capability limits
- preserve no-materialization rules
- return a normal read result only if the retried read completes within the
  new budget and reducer capability

Must not mean:

- automatic retry
- hidden budget increase
- mutation of default budgets
- fallback to `_materializeGraph()`
- fallback to `materialize()`
- checkpoint creation
- prewarming
- partial success
- bypassing unsupported reducer cases

The retry operation is a Plumber recovery operation because it is explicit
operational work. It is not a behavior that optic reads perform by themselves.

## Why Exhaustion Fails Closed

A budget-exceeded scan has incomplete evidence. Returning a value would claim
the reducer saw enough witnesses when it did not.

Therefore:

- no `NodeOpticReadResult` is returned
- no `NodePropertyOpticReadResult` is returned
- no complete `readIdentity` is returned
- partial evidence may appear only as error context if safely available
- callers must choose explicit recovery

This is the same rule as unsupported reducer capability: incomplete evidence
is not a smaller answer. It is no answer.

## Relationship To Recovery Operations

Use `plumber.checkpoint.createIndexedBasis` when:

- the suffix is long enough that repeated extended-budget reads would be
  wasteful
- many callers are likely to read nearby facts
- unsupported tail facts can become checkpoint-basis facts
- the caller has write authority and accepts operational checkpoint work

Use `plumber.optic.retryWithExtendedBudget` when:

- the caller needs this specific read now
- the caller accepts the explicit larger scan cost
- the suffix is expected to remain small enough for bounded retry
- checkpoint creation is not the chosen recovery

Use `plumber.checkpoint.prewarmIndex` only when:

- the failure is artifact readiness, not scan length
- a usable checkpoint/index basis already exists

## Forbidden Shortcuts

- Do not auto-retry.
- Do not auto-increase budgets.
- Do not mutate defaults after a failure.
- Do not return partial success.
- Do not call `_materializeGraph()` from optic reads.
- Do not call `materialize()` from optic reads.
- Do not read `state.cbor` from optic reads.
- Do not use wall-clock reads inside deterministic domain code.
- Do not use `maxTailMs` as graph truth.
- Do not hide checkpoint creation behind an optic read.
- Do not widen reducer support while implementing budget behavior.
- Do not treat `retryMaySucceedAfterRecovery` as "retry now."

## Non-Goals

- No runtime implementation.
- No helper APIs.
- No Plumber implementation.
- No benchmark or RSS recalibration.
- No CAS slice cache.
- No Roaring implementation.
- No reducer capability broadening.
- No Continuum packet format.
- No Echo interop.
- No release artifact, tag, or version bump.

## Follow-On Work

The next design hill remains:

- `PROTO_v17-reducer-capability-boundary.md`

Runtime implementation of this budget contract must be pulled separately.

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

- Pattern: `maxTailPatches` as a real bound but not a full protocol.
  Status: patch count semantics defined.
- Pattern: future byte/time budgets named without meanings.
  Status: units, scopes, and determinism posture defined.
- Pattern: retry temptation after budget failure.
  Status: retry is explicit Plumber recovery only.

### 2. Sludge Fixed

- Defined inclusive limit behavior.
- Defined multi-budget failure priority.
- Defined budget-exceeded error context.
- Defined caller override rules.

### 3. Sludge Rejected

- Rejected auto-retry.
- Rejected auto-budget increase.
- Rejected partial success.
- Rejected host wall-clock reads in deterministic domain code.
- Rejected materialization fallback.

### 4. Sludge Deferred

- Runtime implementation.
- Tail byte accounting.
- Host-local time budget enforcement.
- Reducer capability boundary.
