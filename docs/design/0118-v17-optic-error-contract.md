# 0118 v17 Optic Error Contract

- Status: `design-only contract hill`
- Release lane: `v17.0.0`
- Source: `PROTO_v17-optic-error-contract`
- Design role: stable machine-readable failure shape for v17 optics
- Review audience: maintainers and future agents
- Depends on: `0117-v17-plumber-recovery-contract`

## Sponsor Human

James.

## Sponsor Agent

Codex.

## Hill

Define the stable machine-readable error contract for v17 optic failures so
future runtime code can connect failures to explicit Plumber recovery
operations without inventing ad hoc recovery behavior.

This cycle is contract-only. It does not implement the runtime shape.

## Current Convention Audit

The existing domain error convention is:

```text
WarpError {
  name: string
  message: string
  code: string
  context: object
}
```

`QueryError` follows that convention and supplies a default `QUERY_ERROR`
code. The v17 optic implementation currently uses `QueryError` with:

- `E_OPTIC_NO_BOUNDED_BASIS`
- `E_OPTIC_TAIL_BUDGET_EXCEEDED`
- `E_OPTIC_READ_IDENTITY`

Current optic errors place machine-readable detail in `context`, usually with
`graphName` and sometimes `reason` or budget fields.

This design preserves that repo style. It defines required `context` fields
and recovery hint identifiers. It does not require a new top-level error
property or a new error subclass before a later implementation hill explicitly
chooses one.

Cause identifiers use the existing kebab-case reason vocabulary as the source
of truth. Future implementation must not grow parallel `reason` and `cause`
vocabularies. If both fields appear during migration, they must carry the same
stable identifier until one is retired or aliased by an explicit contract
update.

## Why This Exists

0117 named recovery operations:

```text
plumber.checkpoint.createIndexedBasis
plumber.checkpoint.prewarmIndex
plumber.optic.retryWithExtendedBudget
```

Those names are not useful enough unless optic failures can carry stable
machine-readable causes and recovery hints. A caller should not parse prose,
match error messages, or infer recovery from incidental implementation details.

The contract must also avoid flattening every problem into a vague
`E_OPTIC_NO_BOUNDED_BASIS`. The public code can stay coarse where v17 tests
already pinned it, but the structured cause must be precise.

## Playback Questions

Agent-facing:

- Can a future agent add runtime error-contract tests without inventing field
  names?
- Can a future agent distinguish missing checkpoint basis, shard failure,
  budget exhaustion, reducer unsupported, and read-identity failure from
  structured fields alone?
- Can a future agent attach recovery hints without auto-running Plumber
  operations?

Human-facing:

- Can a maintainer explain which optic failures are operator-recoverable?
- Can a maintainer reject message-string parsing and one-off recovery helpers?
- Can a maintainer see which current implementation reasons must be migrated
  or preserved by a future GREEN slice?

## Accessibility / Assistive Reading Posture

This is a protocol contract. The primary reading model is linear text plus
tables. Error and recovery identifiers are written as literal tokens so screen
reader output remains unambiguous.

## Localization / Directionality Posture

Error codes, cause identifiers, optic kinds, and recovery operation identifiers
are ASCII protocol tokens and are not localized. Human-facing messages may be
localized later, but callers must branch only on stable machine-readable
fields.

## Agent Inspectability / Explainability Posture

Every failure class below names:

- public error code
- cause identifiers
- required context fields
- optional context fields
- allowed recovery hints
- automatic retry posture

Future implementation must be able to generate tests directly from these
tables.

## Stable Context Shape

The v17 optic error contract is:

```text
error.code = <optic error code>
error.context = {
  graphName,
  opticKind,
  target,
  cause,
  recoveryHints,
  ...code-specific fields
}
```

Required fields for every optic failure:

| Field | Required | Meaning |
| --- | --- | --- |
| `graphName` | yes | Graph/worldline name the read targeted. |
| `opticKind` | yes | One of the v17 optic kind identifiers. |
| `target` | yes | Exact entity/aspect target of the read. |
| `cause` | yes | Stable cause identifier from this contract. |
| `recoveryHints` | yes | Ordered recovery hint list; empty when none applies. |

V17 optic kind identifiers:

| Identifier | Meaning |
| --- | --- |
| `node` | `worldline.optic().node(id).read()` |
| `node-property` | `worldline.optic().node(id).prop(key).read()` |

Target shape by optic kind:

| `opticKind` | Required target fields |
| --- | --- |
| `node` | `nodeId` |
| `node-property` | `nodeId`, `propertyKey` |

Field stability rules:

- Required fields may not be removed or renamed during v17.
- Optional fields may be added when they are stable tokens or numeric facts.
- Future code must not require callers to parse `message`.
- Future code must not require callers to parse nested exception text.
- A missing recovery path is represented by `recoveryHints: []`, not by
  omitting the field.

## Error Code Taxonomy

### `E_OPTIC_NO_BOUNDED_BASIS`

The read cannot establish a bounded checkpoint-tail basis for the requested
optic.

This code remains intentionally broad in v17 because existing characterization
tests already pin fail-closed behavior for missing basis, tail node removes,
and unsupported object tail property values with this code. Precision lives in
`context.cause`.

Allowed causes:

- `missing-optic-source`
- `unsupported-worldline-selector`
- `missing-checkpoint`
- `checkpoint-without-index-tree`
- `checkpoint-missing-index-shards`
- `checkpoint-payload-pointer-without-storage`
- `checkpoint-payload-pointer-empty`
- `checkpoint-shard-unavailable`
- `checkpoint-shard-invalid`
- `tail-node-remove-needs-raw-liveness-witnesses`
- `tail-property-value-needs-parser`

Required context fields:

- `graphName`
- `opticKind`
- `target`
- `cause`
- `recoveryHints`

Optional context fields:

- `checkpointSha`
- `checkpointFrontier`
- `checkpointIndexShards`
- `shardPath`
- `shardOid`
- `storageOid`
- `selector`
- `writerId`
- `tailWitnessSha`
- `tailWitnessLamport`

### `E_OPTIC_TAIL_BUDGET_EXCEEDED`

The read had a usable checkpoint basis but scanning the live suffix exceeded
an explicit budget.

Allowed cause:

- `tail-budget-exceeded`

Required context fields:

- `graphName`
- `opticKind`
- `target`
- `cause`
- `recoveryHints`
- `budgetKind`
- `budgetLimit`
- `budgetObserved`

Allowed `budgetKind` identifiers:

- `maxTailPatches`
- `maxTailBytes`
- `maxTailMs`

The exact semantics of those budget kinds are defined by the future tail
budget contract. This error contract reserves the field names now so callers
do not receive different shapes later.

### `E_OPTIC_READ_IDENTITY`

The read cannot construct an honest evidence identity for the result or
failure.

Allowed causes:

- `read-identity-missing-field`
- `read-identity-evidence-unavailable`
- `read-identity-invalid-frontier`
- `read-identity-invalid-tail-witness`

Required context fields:

- `graphName`
- `opticKind`
- `target`
- `cause`
- `recoveryHints`

Optional context fields:

- `field`
- `checkpointSha`
- `checkpointFrontier`
- `checkpointIndexShards`
- `tailWitnesses`

This error must not carry fake `stateHash` or claim a complete read identity
when the evidence is incomplete.

## Cause-To-Recovery Matrix

| Cause | Error code | Recovery hints |
| --- | --- | --- |
| `missing-optic-source` | `E_OPTIC_NO_BOUNDED_BASIS` | none |
| `unsupported-worldline-selector` | `E_OPTIC_NO_BOUNDED_BASIS` | none |
| `missing-checkpoint` | `E_OPTIC_NO_BOUNDED_BASIS` | `plumber.checkpoint.createIndexedBasis` |
| `checkpoint-without-index-tree` | `E_OPTIC_NO_BOUNDED_BASIS` | `plumber.checkpoint.createIndexedBasis` |
| `checkpoint-missing-index-shards` | `E_OPTIC_NO_BOUNDED_BASIS` | `plumber.checkpoint.createIndexedBasis` |
| `checkpoint-payload-pointer-without-storage` | `E_OPTIC_NO_BOUNDED_BASIS` | `plumber.checkpoint.prewarmIndex` |
| `checkpoint-payload-pointer-empty` | `E_OPTIC_NO_BOUNDED_BASIS` | none |
| `checkpoint-shard-unavailable` | `E_OPTIC_NO_BOUNDED_BASIS` | `plumber.checkpoint.prewarmIndex` |
| `checkpoint-shard-invalid` | `E_OPTIC_NO_BOUNDED_BASIS` | `plumber.checkpoint.createIndexedBasis` |
| `tail-node-remove-needs-raw-liveness-witnesses` | `E_OPTIC_NO_BOUNDED_BASIS` | `plumber.checkpoint.createIndexedBasis` |
| `tail-property-value-needs-parser` | `E_OPTIC_NO_BOUNDED_BASIS` | `plumber.checkpoint.createIndexedBasis` |
| `tail-budget-exceeded` | `E_OPTIC_TAIL_BUDGET_EXCEEDED` | `plumber.checkpoint.createIndexedBasis`, `plumber.optic.retryWithExtendedBudget` |
| `read-identity-missing-field` | `E_OPTIC_READ_IDENTITY` | none |
| `read-identity-evidence-unavailable` | `E_OPTIC_READ_IDENTITY` | none |
| `read-identity-invalid-frontier` | `E_OPTIC_READ_IDENTITY` | none |
| `read-identity-invalid-tail-witness` | `E_OPTIC_READ_IDENTITY` | none |

## Recovery Hint Shape

`context.recoveryHints` is an ordered array. Each entry has:

| Field | Required | Meaning |
| --- | --- | --- |
| `operation` | yes | Recovery operation identifier from 0117. |
| `retryMaySucceedAfterRecovery` | yes | Whether retrying after completed recovery can be meaningful. |
| `requiresCallerConsent` | yes | Whether the caller must explicitly request it. |

Allowed `operation` identifiers:

- `plumber.checkpoint.createIndexedBasis`
- `plumber.checkpoint.prewarmIndex`
- `plumber.optic.retryWithExtendedBudget`

Rules:

- `requiresCallerConsent` is always `true` in v17.
- Recovery hints are suggestions, not actions.
- The runtime must not auto-run hinted recovery operations.
- The runtime must not auto-increase budgets.
- The first hint is the preferred recovery for the cause.
- Later hints are valid alternatives, not fallback branches.

## Retry Rules

No v17 optic failure may perform automatic retry.

Caller-controlled retry may be meaningful only after:

- `plumber.checkpoint.createIndexedBasis` has created a fresher indexed basis
- `plumber.checkpoint.prewarmIndex` has made required artifacts available
- `plumber.optic.retryWithExtendedBudget` has been explicitly requested with
  a concrete budget

Errors that must not be auto-retried:

- all `E_OPTIC_NO_BOUNDED_BASIS` causes
- all `E_OPTIC_TAIL_BUDGET_EXCEEDED` causes
- all `E_OPTIC_READ_IDENTITY` causes

`retryMaySucceedAfterRecovery` never means "retry now in a loop." It means "a
retry can be meaningful after the named recovery operation has completed with
caller consent."

## Partial Evidence Identity

When safely available, failures may include partial evidence fields in
`context`.

Allowed partial evidence fields:

- `checkpointSha`
- `checkpointFrontier`
- `checkpointIndexShards`
- `tailWitnesses`

Rules:

- Partial evidence must be labeled only as context, not as `readIdentity`.
- Partial evidence must not include fake `stateHash`.
- Partial evidence must not imply the read result is complete.
- Missing partial evidence must not hide the primary failure cause.

## Mapping Current Implementation Reasons

Current implementation reason strings are already close to this contract. The
future implementation hill should preserve or migrate them deliberately:

| Current reason or context | Contract cause |
| --- | --- |
| `missing-optic-source` | `missing-optic-source` |
| non-live selector context | `unsupported-worldline-selector` |
| `missing-checkpoint` | `missing-checkpoint` |
| `checkpoint-without-index-tree` | `checkpoint-without-index-tree` |
| `checkpoint-missing-index-shards` | `checkpoint-missing-index-shards` |
| `checkpoint-payload-pointer-without-storage` | `checkpoint-payload-pointer-without-storage` |
| `empty-checkpoint-payload-pointer` | `checkpoint-payload-pointer-empty` |
| index shard missing errors | `checkpoint-shard-unavailable` |
| index shard malformed errors | `checkpoint-shard-invalid` |
| `tail-node-remove-needs-raw-liveness-witnesses` | `tail-node-remove-needs-raw-liveness-witnesses` |
| `tail-property-value-needs-parser` | `tail-property-value-needs-parser` |
| tail budget context | `tail-budget-exceeded` |
| `field` from read identity construction | `read-identity-missing-field` |

## Forbidden Shortcuts

- Do not branch on `message`.
- Do not parse nested exception text.
- Do not add one-off recovery helper names.
- Do not omit `recoveryHints`; use an empty array.
- Do not auto-run Plumber operations.
- Do not auto-retry with larger budgets.
- Do not widen reducer support while implementing this error contract.
- Do not claim object, array, edge, attachment, neighbor, or recursive WARP
  support.
- Do not call `_materializeGraph()` from optic reads.
- Do not call `materialize()` from optic reads.
- Do not read `state.cbor` from optic reads.
- Do not invent fake `stateHash`.

## Non-Goals

- No runtime implementation.
- No new error subclass.
- No base `WarpError` change.
- No Plumber implementation.
- No recovery helper implementation.
- No budget semantics beyond reserved field names.
- No reducer capability broadening.
- No Continuum wire packet.
- No Echo interop.
- No release artifact, tag, or version bump.

## Follow-On Work

Implementation must be pulled separately after this design is accepted. The
next design hills remain:

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

- Pattern: typed error codes without stable context semantics.
  Status: contract defines required fields and cause identifiers.
- Pattern: recovery names without machine-readable attachment point.
  Status: `context.recoveryHints` defined as ordered stable identifiers.
- Pattern: implementation pressure to add helper behavior.
  Status: rejected; this is contract-only.

### 2. Sludge Fixed

- Defined the v17 optic error context shape.
- Classified current optic failure causes.
- Connected failure causes to explicit Plumber recovery hints.
- Preserved repo convention of `code` plus `context`.

### 3. Sludge Rejected

- Rejected message parsing.
- Rejected automatic recovery.
- Rejected broadening reducer behavior.
- Rejected fallback materialization.

### 4. Sludge Deferred

- Runtime error-contract implementation.
- Tail budget semantics.
- Reducer capability boundary.
