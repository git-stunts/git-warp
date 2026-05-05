# ADR 3 — Readiness Gates for EdgePropSet Wire-Format Cutover

## Status

Proposed

## Date

2026-02-28

## Related

- ADR 1 — Canonicalize Edge Property Operations Internally
- ADR 2 — Defer Persisted EdgePropSet Wire-Format Migration Until Explicit Graph Capability Cutover

## Context

ADR 1 makes edge property operations honest internally by introducing canonical `NodePropSet` and `EdgePropSet` semantics while preserving the legacy persisted wire format.

ADR 2 defers the persisted wire-format migration. That deferral is intentional: changing the raw persisted patch format is a distributed compatibility event in a system with immutable Git commits, independent writers, and fail-closed unknown-op handling.

The remaining risk is governance drift: once the internal model is clean, future work may try to introduce persisted raw `EdgePropSet` prematurely because the code now makes that change appear easy.

This ADR exists to prevent that mistake.

## Decision

ADR 2 must not be implemented or activated based on judgment calls, convenience, or aesthetic preference alone.

Instead, the persisted `EdgePropSet` wire-format cutover is governed by two explicit readiness gates:

1. **Implementation Readiness Gate** — determines when work on ADR 2 may begin behind a disabled graph capability.
2. **Activation Readiness Gate** — determines when raw persisted `EdgePropSet` may be enabled for real graphs.

Until both gates are satisfied for their respective stage:

- writers must continue lowering canonical `EdgePropSet` to legacy raw `PropSet`
- sync must continue rejecting canonical-only ops on the wire
- older graphs must not observe raw persisted `EdgePropSet`

## Why this ADR exists

This ADR makes three things binding:

1. Internal cleanup is not permission for wire-format migration.
2. Implementation and activation are separate decisions.
3. The cutover must be evidence-based, not vibes-based.

## Gate 1 — Implementation Readiness

ADR 2 implementation work may begin only if all of the following are true.

### 1. ADR 1 is merged and stable

All ADR 1 invariants must already hold in mainline:

- canonical internal property ops are in use
- raw/canonical boundaries are explicit
- sync rejects canonical-only ops on the wire
- reserved-byte validation is enforced for new writes

### 2. Post-ADR-1 verification is clean

The following must be green:

- full unit test suite
- full integration test suite
- no-coordination / mixed-writer regression suite
- lint and static checks

### 3. Historical identifier audit is complete

A repo-level or graph-level audit must have been run against historical data to detect ambiguous legacy identifiers, including at minimum:

- node IDs beginning with `\x01`
- identifiers containing `\0`

Any discovered violations must be either:

- absent, or
- documented with an explicit handling plan approved before ADR 2 work starts

### 4. Version namespaces are separated

Patch schema versioning and checkpoint schema versioning must be clearly distinct in code and documentation.

There must be no overloaded generic "schema version" concept that can ambiguously refer to both.

### 5. Graph capability design is approved

A concrete design must exist for the future cutover mechanism, including:

- where capability state lives
- how capability state is discovered
- whether activation is explicit or automated
- monotonic ratchet rules
- unsupported-reader behavior
- checkpoint/load behavior
- debug/observability surfaces

### 6. Observability plan exists

Before implementation begins, there must be an agreed plan to measure:

- count of legacy raw edge-property ops encountered during read/apply
- count of canonical `EdgePropSet` writes lowered to legacy raw `PropSet`
- count of sync-time raw-op rejections
- graph-level capability state visibility

### 7. Rollout playbook exists

A written operational playbook must exist before implementation starts. At minimum it must cover:

- upgrade prerequisites
- cutover prerequisites
- failure modes
- expected old-reader behavior
- operator communication
- rollback posture

### 8. ADR 2 tripwire tests are written first

Tests for the future cutover behavior must exist before implementation begins, even if they initially fail.

At minimum these must cover:

- pre-cutover graphs do not emit raw `EdgePropSet`
- post-cutover graphs do emit raw `EdgePropSet`
- unsupported readers fail closed
- supported readers materialize mixed pre-cutover and post-cutover history correctly
- sync does not rewrite committed patch payloads per peer
- checkpoint schema and patch schema remain distinct

## Gate 2 — Activation Readiness

Even after ADR 2 is implemented, raw persisted `EdgePropSet` must not be enabled for real graphs until all of the following are true.

### 1. Graph capability exists and is monotonic

The cutover mechanism must be implemented as a graph-scoped capability or minimum schema ratchet.

It must be:

- explicit
- discoverable
- monotonic
- non-reversible in normal operation

### 2. Raw persisted EdgePropSet is still disabled by default

Support in code is not sufficient. Activation requires deliberate graph-level enablement.

### 3. Compatibility behavior is proven

Passing tests must prove that:

- supporting readers accept both historical legacy edge-property ops and raw `EdgePropSet`
- unsupported readers fail immediately and loudly
- no peer-specific patch transcoding occurs
- materialization remains deterministic across pre-cutover and post-cutover histories

### 4. Target graph fleet is operationally ready

For any graph where the capability will be activated:

- all active writers are upgraded
- all critical readers are upgraded
- operators accept that older binaries will be blocked
- deployment sequencing is documented

### 5. Observability is live

The metrics and debug surfaces described in the implementation gate must be live before activation.

### 6. Activation review is approved

Activation requires explicit review with recorded approval from the maintainers responsible for:

- storage/schema
- sync/replication
- graph runtime/materialization
- operational rollout

## Non-negotiable constraints

The following constraints apply regardless of stage.

### No per-peer patch rewriting

Committed patch payloads must not be rewritten based on remote peer version or capability.

A patch must not have multiple alternate wire encodings depending on who is syncing with whom.

### Fail closed on unsupported readers

Older readers encountering unsupported persisted raw ops must reject loudly. Silent ignore is forbidden.

### No silent widening of wire compatibility

Canonical internal op types must not be accepted at raw wire boundaries before graph capability cutover.

### No checkpoint/patch schema confusion

Checkpoint format constants and patch schema constants must remain separate namespaces.

## Required evidence for Gate 1 review

A proposal to begin ADR 2 implementation must include all of the following artifacts:

1. ADR 1 completion note
2. green CI links or equivalent evidence for unit/integration/no-coordination suites
3. historical identifier audit report
4. graph capability design document
5. rollout playbook draft
6. observability plan
7. ADR 2 tripwire test list or implementation
8. explicit statement that peer-specific patch transcoding is out of scope

## Required evidence for Gate 2 review

A proposal to activate raw persisted `EdgePropSet` for any graph must include:

1. proof that Gate 1 was satisfied
2. proof that ADR 2 implementation is complete
3. passing compatibility test evidence
4. confirmation of target-graph fleet upgrade status
5. operational activation plan
6. confirmation that capability state is monotonic and discoverable
7. confirmation that observability is live

## Consequences

### Positive

- Prevents accidental schema migration by enthusiasm
- Separates implementation readiness from activation readiness
- Forces concrete evidence before compatibility boundaries move
- Keeps old-reader failure behavior explicit
- Makes future cutover a governed event instead of a refactor side-effect

### Negative

- Adds process around what might otherwise look like a small technical change
- Slows down implementation of the persisted wire-format migration
- Requires operational documentation before code is enabled

### Intended tradeoff

This ADR deliberately prefers slower, explicit migration over fast, ambiguous migration.

## Rejected alternatives

### 1. "We'll know when we know"

Rejected.

This invites subjective decision-making and weakens the deferral established by ADR 2.

### 2. Treat internal support as de facto approval for wire-format support

Rejected.

Internal canonical ops solve a code-structure problem, not a distributed compatibility problem.

### 3. Let implementation and activation happen in one step

Rejected.

These are separate risk events and must remain separately gated.

## Enforcement

If any Gate 1 condition is not satisfied, ADR 2 implementation must remain deferred.

If any Gate 2 condition is not satisfied, raw persisted `EdgePropSet` must remain disabled for real graphs.

Until activation is explicitly approved, canonical `EdgePropSet` continues to lower to legacy raw `PropSet`.

## Decision summary

ADR 2 becomes eligible only through explicit readiness gates.

The project will not implement or activate persisted raw `EdgePropSet` because it feels tidy, inevitable, or "basically done." It will happen only when the technical, compatibility, and operational evidence says it is safe.
