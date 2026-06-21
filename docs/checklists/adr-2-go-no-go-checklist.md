# ADR 2 Go / No-Go Checklist

This checklist enforces ADR 3.

ADR 2 must not be implemented or activated because it feels tidy, inevitable, or "basically done."
It proceeds only when the required evidence exists.

Current executable no-go witness:
`test/unit/domain/services/EdgePropSetWireMigrationGate.test.ts` keeps canonical
`EdgePropSet` lowered to legacy raw `PropSet` storage and prevents accidental
schema v4 claims until the gates below are deliberately satisfied.

---

## Gate 1 — Implementation Readiness

ADR 2 implementation may begin behind a disabled graph capability **only if every item below is true**.

### Core readiness
- [ ] ADR 1 is merged and stable
- [ ] Canonical internal property ops are in use
- [ ] Raw/canonical boundaries are explicit
- [ ] Sync rejects canonical-only ops on the wire
- [ ] Reserved-byte validation is enforced for new writes

### Verification
- [ ] Full unit test suite is green
- [ ] Full integration test suite is green
- [ ] No-coordination / mixed-writer regression suite is green
- [ ] Lint/static checks are green

### History safety
- [ ] Historical identifier audit is complete
- [ ] Audit confirms no unresolved ambiguous legacy identifiers
- [ ] Any discovered violations have an approved handling plan

### Versioning hygiene
- [ ] Patch schema and checkpoint schema are separate namespaces
- [ ] No ambiguous generic "schema version" path remains

### Design readiness
- [ ] Graph capability design is approved
- [ ] Capability location is defined
- [ ] Capability discovery mechanism is defined
- [ ] Ratchet behavior is defined
- [ ] Unsupported-reader behavior is defined
- [ ] Checkpoint/load behavior is defined

### Operational readiness
- [ ] Observability plan exists
- [ ] Rollout playbook exists
- [ ] ADR 2 tripwire tests are written
- [ ] Peer-specific patch transcoding is explicitly forbidden

### Evidence links
- [ ] ADR 1 completion note linked
- [ ] CI evidence linked
- [ ] Historical audit linked
- [ ] Capability design doc linked
- [ ] Rollout playbook linked
- [ ] Observability plan linked
- [ ] ADR 2 tripwire tests linked

**Gate 1 decision**
- [ ] GO — ADR 2 implementation may begin behind a disabled capability
- [ ] NO-GO — ADR 2 implementation remains deferred

---

## Gate 2 — Activation Readiness

Raw persisted `EdgePropSet` may be enabled for real graphs **only if every item below is true**.

### Implementation complete
- [ ] Gate 1 was previously satisfied
- [ ] ADR 2 implementation is complete
- [ ] Raw persisted `EdgePropSet` is still disabled by default before activation

### Capability behavior
- [ ] Graph capability exists
- [ ] Capability is graph-scoped
- [ ] Capability is explicit
- [ ] Capability is discoverable
- [ ] Capability is monotonic
- [ ] Capability is non-reversible in normal operation

### Compatibility proof
- [ ] Supporting readers accept historical legacy edge-property ops
- [ ] Supporting readers accept raw persisted `EdgePropSet`
- [ ] Supporting readers materialize mixed pre-cutover and post-cutover history deterministically
- [ ] Unsupported readers fail immediately and loudly
- [ ] No peer-specific patch transcoding occurs
- [ ] Checkpoint schema and patch schema remain distinct

### Fleet readiness
- [ ] All active writers for target graphs are upgraded
- [ ] All critical readers for target graphs are upgraded
- [ ] Operators accept that older binaries will be blocked
- [ ] Activation sequencing is documented

### Live operations
- [ ] Observability is live
- [ ] Dashboards/metrics for cutover behavior are available
- [ ] Failure handling instructions are available
- [ ] On-call / operator communication is ready

### Evidence links
- [ ] Gate 1 approval linked
- [ ] ADR 2 implementation PR(s) linked
- [ ] Compatibility test evidence linked
- [ ] Fleet upgrade confirmation linked
- [ ] Activation plan linked
- [ ] Observability links linked

### Required approvals
- [ ] Storage / schema maintainer approved
- [ ] Sync / replication maintainer approved
- [ ] Runtime / materialization maintainer approved
- [ ] Operations / rollout owner approved

**Gate 2 decision**
- [ ] GO — raw persisted `EdgePropSet` may be activated for the approved graph scope
- [ ] NO-GO — activation remains blocked

---

## Non-negotiable rules

- [ ] No committed patch payload is rewritten per peer
- [ ] Unsupported readers fail closed
- [ ] Canonical-only ops are not silently accepted on the wire before cutover
- [ ] Patch schema and checkpoint schema remain separate namespaces
