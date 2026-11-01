# Optic-only public API contract

Status: **Proposed implementation contract; not a shipped API.**

Tracks [#1049](https://github.com/git-stunts/git-warp/issues/1049), under
[#1048](https://github.com/git-stunts/git-warp/issues/1048) for v21.0.0.
The maintainer's [observation amendment](https://github.com/git-stunts/git-warp/issues/1048#issuecomment-6549873844)
and [Coordinate contract](https://github.com/git-stunts/git-warp/issues/1053)
supersede the original plan's identity-free reads and blanket Coordinate ban.
This record specifies their implementation boundary. Its acceptance does not
assert that the implementation or its verification is complete.

## 1. Outcome and boundaries

An application opens a named Warp, authors intents, and asks bounded questions
through an Optic. A new repository can read its own admitted writes without a
repair command, checkpoint, incidental fork, or whole-state fallback.

Every read has an observer standpoint, a declared purpose, a versioned question,
and a resource budget. A saved observation Coordinate identifies that particular
observation. Possessing its token grants no authority. Runtime truth, access
control, retention, and verification remain separate obligations.

The engine is [#1039 / #1040](https://github.com/git-stunts/git-warp/pull/1040).
This design does not replace its reducers, invent an Edict execution guarantee,
implement distributed consensus, or complete retained readings
[#1044](https://github.com/git-stunts/git-warp/issues/1044). Ordinary questions
must stay usable before those broader projects finish.

## 2. Public values and ownership

The following is the target package contract, including values returned by
methods. Hidden constructors do not exempt a returned object's public members
from the export guard. All domain values have validated, immutable runtime
representations; schema generation belongs at transport boundaries.

| Value | Construction and public operations | Failure boundary |
| --- | --- | --- |
| `GitStorage` | `root()` resolves the current repository; `at(path)` selects one explicitly | Host discovery and I/O are adapter-owned; no graph, ref, or cache methods |
| `WarpAddress` | `of(storage, name)` validates the storage/name pair | Reject malformed or reserved names; contains no writer or observer |
| `Warp` | `open(address, access)` opens resources; `forObserver(identity)`, `as(writer)`, `close()` | `access` is an injected `WarpAccessPort`; opening does not grant data access |
| `ObservedWarp` | Returned only by `forObserver`; accepted by `Optic`; `fork(coordinate)` | Binds an observer identity; current rights are checked on execution |
| `AuthoredWarp` | Returned only by `as`; `execute(intent)`, `settle(plan)` | Selects authorship; the access port must authorize that writer and operation |
| `ObserverIdentity` | `of(namespace, subject)` validates a principal name | A name is not an authentication credential or a grant |
| `Purpose` | `of(namespace, name, version)` validates a registered purpose identifier | Unknown or undeclared purposes are refused by policy |
| `ReadBudget` | `of(limits)` validates named finite limits for records, emitted bytes, and work | Invalid limits fail construction; execution accounts for aggregate work |
| `Optic` | `Optic(observedWarpOrStrand)` returns an immutable query builder | An unscoped Warp cannot execute a question |
| `Intent` | Existing validated builders or generated SDK constructors | Preserve actual intent/reducer semantics; no arbitrary callback execution |
| `Observer` | Existing validated/generated query-plan constructors | This names a question plan, not a principal; requires stable identity and version |
| `Observation` | Returned by a query's `read()` | One execution, one reading consumer, terminal receipt, cancellation |
| `Reading` | Emitted only by an Observation | Validated value plus scoped evidence; never a whole-state object |
| `Receipt` variants | Returned by writes, observations, forks, replay, and settlement; `CompletedObservationReceipt` carries a durable Coordinate | Describe the actual operation and its outcome; no caller-created success evidence |
| `Coordinate` | Obtained from a retained receipt; `parse(text)` and `toString()` | Parsing validates syntax only; resolution and authority checks occur at use |
| `Strand` | Returned by `observedWarp.fork(coordinate)` or `observedStrand.fork(coordinate)` | Fork authorization and retained origin are required; no fork from a raw cut |
| `ObservedStrand` / `AuthoredStrand` | `strand.forObserver(identity)` provides `fork(coordinate)` and `previewSettlement(targetView)`; `strand.as(writer)` provides `execute(intent)` and `settle(plan)` | Same observation and authorship rules as Warp handles |
| `SettlementPreview` / `SettlementPlan` | An observed Strand previews against a target view; `target.as(writer).settle(plan)` applies the validated plan | Plan binds exact source, target, proposal, law, policy, and authority; stale plans obstruct |

`WarpAccessPort` is a public capability interface at the composition boundary.
It resolves the authenticated caller, authorizes reads and writes, supplies
observer budget defaults, and checks any claimed coarsening. Core receives
validated grants or typed denials. Credentials, host identity, policy storage,
clocks, and entropy remain behind adapters. A caller-provided principal string
must never authenticate itself by matching a stored string.

The two-argument `Warp.open(address, access)` is the explicit composition form.
The one-argument convenience may be added only with an explicitly configured
host access provider. No implicit allow-all provider or anonymous fallback is
part of this contract. A single-principal local policy may be supported as a
named trust profile; it must not advertise isolation from code controlling the
same process or unrestricted filesystem.

Root exports provide these application constructors and type contracts.
`/advanced` provides validated intent/observer construction for generated SDKs;
`/charts` provides graph-shaped question plans; `/testing` provides fake ports.
`/diagnostics` may inspect public receipts and typed failures. It does not expose
storage maintenance as an application capability.

## 3. One application journey

This is target syntax, not a runnable example of today's package. The application
supplies `access`, `reader`, `writer`, `editTodo`, and the registered `todoDisplay`
purpose. Generated SDKs may supply intents, purposes, and question plans without
exposing storage mechanics.

```typescript
const warp = await Warp.open(
  WarpAddress.of(GitStorage.root(), 'todos'),
  access,
);
const view = warp.forObserver(reader);
const written = await warp.as(writer).execute(editTodo);
const observation = Optic(view)
  .forPurpose(todoDisplay)
  .node('todo:one')
  .prop('title')
  .read();

for await (const reading of observation) {
  display(reading);
}
const receipt = await observation.receipt;
if (receipt instanceof CompletedObservationReceipt) {
  saveToken(receipt.coordinate.toString());
}
await warp.close();
```

The example's successful receipt has a Coordinate. A typed failure before an
observation can be established need not fabricate one. Application branching
uses the validated outcome variant before accessing success-only fields;
`display` and `saveToken` are application-owned presentation and persistence.
Expected denials and operational failures are returned as validated variants;
exceptions are reserved for programmer misuse or broken runtime invariants.
Closing a Warp closes its owned live handles and streams, not the persisted
history or retention roots supporting previously returned durable Coordinates.

On reopen, `Optic(view).replay(Coordinate.parse(saved))` verifies and returns the
original operation receipt, or a typed refusal. `Optic(view).at(coordinate)`
starts a new question at the retained observation's basis. A live Optic without
`at` captures the replica's admitted basis on first execution demand. Building
the query does not silently freeze a moving history.

Reads never append writer patches. They may retain observation evidence through
a separate retention path. Its storage cost and disclosure policy are explicit;
it cannot become an ambient writer identity merely to reuse a write API.

## 4. Questions, cardinality, and budgets

The builder carries immutable observer, purpose, question, and budget bindings.
`forPurpose(purpose)` is required unless the generated plan declares that exact
purpose. `withBudget(budget)` requests a policy-approved override of the
observer's default. Neither method can silently widen access.

| Question | Builder | Reading contract |
| --- | --- | --- |
| Node presence/lifecycle | `node(id)` | Exactly one bounded lifecycle result, including witnessed absence |
| Property | `node(id).prop(key)` | Exactly one present/absent result when the question is decidable |
| Edge presence/property | `edge(id)` / `edge(id).prop(key)` | Same bounded semantics as node questions |
| Neighborhood | `node(id).neighbors()` | Stream bounded pages with explicit continuation and completeness |
| Traversal | `node(id).traverse()` | Stream bounded traversal results; no implicit exhaustive expansion |
| Content | `node(id).content()` / `edge(id).content()` | Bounded metadata/readings and authorized byte streams; no whole-blob collector |
| Entity inventory | `entities()` | Stream admitted occurrences at one fixed observation basis |
| Generated structural observer | `witness(observer)` | Use the plan's declared cardinality, purpose, support requirements, and version |

Every builder ends in `read()`, which returns a dormant `Observation`.
Iteration or demanding its receipt starts exactly one execution. Receipt-only
demand drains without accumulating values. A second independent consumer is a
typed misuse, not a second query. Breaking iteration or explicit `cancel()`
stops owned work and produces a cancelled terminal execution result.

A missing node/property is not represented by a missing Reading: the exactly-one
result carries absence only when its support is sufficient. A complete empty
inventory emits zero readings and a completed, complete receipt. Withheld or
unavailable data must not be disguised as ordinary absence.

Pagination binds continuation to the observation, question, observer, purpose,
law, and dependency evidence. A cursor cannot be reused at a new live basis or
under another principal. Partial pages are marked partial; exhaustion of work,
bytes, or records cannot yield a completeness claim. Defaults and aggregate
accounting are part of the executable contract, not unlimited optional hints.
Charge logical work consistently for the represented question, including work
represented by a reused memo. Actual I/O, memory pressure, and elapsed time belong
in separately bounded execution diagnostics. A physical failure produces its own
failed attempt; it cannot manufacture a successful canonical observation receipt.

## 5. Authorization before evaluation

The access check precedes retrieval, indexing, ranking, counting, and content
opening that could affect the answer. Filtering after evaluation is insufficient.
The effective aperture combines the requested question with current policy and
the observer's admitted rights. Generated Wesley queries must declare a typed
purpose; schema omission fails closed.

Question changes always create new observations. Observer or purpose changes
cannot reuse the old standpoint. A permitted coarsening requires a checked
policy relation proving the newly released information is no finer than the
allowed source observation and is authorized for the new recipient/purpose.
Without that proof, refuse or obtain a separately authorized observation.
Coarsening never transfers the original principal's credentials.

Memo reuse has the same boundary. Equality of query text or causal basis is
insufficient. Observer, purpose, effective revelation, law/reducer versions,
dependencies, and relevant budget semantics must match, or an explicit checked
coarsening must establish lawful reuse. A memo hit cannot upgrade an obstruction,
conceal revocation, or turn partial coverage into completeness. Under identical
bindings and completed execution, cold and warm paths yield identical canonical
receipt cores; cache timing and physical I/O counters are not part of that core.

## 6. Outcomes and evidence

Execution completion, causal admission, reading cardinality, and claim support
are distinct axes. `derived` does not mean one Reading; multiple Readings do not
mean `plural`; a valid signature does not mean the underlying claim is true.

| Situation | Observable result |
| --- | --- |
| Fresh store; authorized exact read after an admitted write | Completed Reading of the written value; no repair/fork prerequisite |
| Empty supported inventory | Completed, complete receipt; zero readings |
| Required evidence unavailable | Obstruction with a rehydration requirement; no wider-state fallback |
| Evidence insufficient to decide the claim | Underdetermined support, preserving what is known |
| Denied/revoked access | Typed refusal with policy-safe diagnostics; no hidden-value leak |
| Budget exhausted | Explicit incomplete/obstructed result and accounted work |
| Caller cancels or I/O fails | Cancelled/failed execution; no fabricated completed classification |
| Causally incompatible authored acts | Conflict evidence retains the relevant alternatives and incompatibility |
| Lawful unresolved alternatives | Plural admission; not forced into a winning value |

Public causes name the missing obligation: unavailable support, denied purpose,
stale observation, unsupported question, exhausted budget, or stale settlement.
They do not prescribe checkpoint creation or expose private writer/ref topology.
Repairs describe bounded next actions and never grant new authority.

## 7. Coordinate identity, replay, and retention

A Coordinate is an opaque reference to an internally retained observation record.
It binds basis, observer, versioned question, purpose, budget, and evidence, as
required by #1053. It is neither a public frontier dump nor a bearer capability.

Avoid self-reference in identity construction. First canonicalize the operation's
receipt core without its Coordinate field. The observation record binds that
core's digest and the observation inputs. The Coordinate addresses that record.
The outer returned receipt combines core and Coordinate. Canonicalization,
domain separation, and versioning are explicit boundary contracts.

An unkeyed digest does not supply entropy merely by looking random. If the threat
model requires unguessable locators, use a retained nonce or keyed construction
through an injected entropy/crypto capability. This does not replace access
checks. Hashes, errors, lookup timing, and record-existence disclosure belong in
the access profile's threat model; no generic unlinkability claim is made.
An observation's nonce, if used, is retained once with that occurrence and reused
on replay. Rebuilding a data memo must not remint the observation's identity.

Replay rechecks current permission, resolves retained evidence, and verifies the
original operation. Success returns its canonical receipt bytes unchanged.
A new invocation's latency, telemetry, or wall-clock time belongs outside those
bytes. Revocation or missing evidence produces a new refusal record without
rewriting the historical receipt. Replaying a write receipt verifies the retained
write and its justifying observation; it never executes the intent again.

A write's Coordinate binds the observation that justified that intent, including
its actual read-before-write basis. The resulting write receipt separately binds
the admission outcome. A later capture is not a substitute. Even an intent with
no data reads has explicit authority/law premises and an empty data question.

Before returning a durable Coordinate, retain its record, receipt, necessary
history, and replay dependencies through git-cas-owned roots/publications.
A metadata reference alone is not a Git reachability guarantee. Successful
replay after restart and `git gc` is required evidence. If retention cannot be
established, return a typed failure; do not advertise a durable token.

## 8. Strands and settlement

Forking starts from a receipt-derived Coordinate and records the full originating
observation. A child of a Strand follows the same rule. Forking requires its own
authority; reading another person's observation does not grant permission to
publish a derivative history. An Optic stays bound to its Warp or Strand.

Preview is read-only classification plus a validated plan. Applying the plan
rechecks source, target, proposal, law, policy, and current authority. Any changed
binding obstructs or requires a new preview. No stale plan executes against a
silently refreshed basis. Fork, comparison, classification, and canonical
admission remain separate operations; this surface does not promise arbitrary
branch merge or preserved intent merely because states converge.

## 9. Forbidden surface and migration

No package subpath, exported type, or reachable public member may expose
`materialize`, materialization, checkpoint operations, `captureCoordinate`,
frontier/cut construction, basis management, a mutable graph object, `Runtime`,
or the generic `Lane`. The opaque `Coordinate` and its parse/serialize methods
are the explicit exception. Private engine nouns and migration prose remain
legitimate; the rule guards capabilities rather than doing a blind word search.

| v20 surface | Target |
| --- | --- |
| `Runtime.open()` and `runtime.lane(name)` | `Warp.open(WarpAddress.of(storage, name), access)` |
| Writer identity at open/read | `warp.as(writer).execute(intent)` for authorship; explicit observer for reading |
| `lane.observe(observer)` | `Optic(view).witness(observer).read()` |
| `captureCoordinate(lane)` | Coordinate from an actual operation receipt |
| `Runtime.fork` / strand Lane | Coordinate-derived Strand handle |
| `Runtime.previewSettlement` / `settle` | Strand preview and target application of the exact validated plan |
| Root graph/storage maintenance APIs | Removed; operator tooling remains a separate boundary |

CLI write, observe, fork, settlement preview/apply, receipt inspection, and audit
use the same contracts. `doctor` and `repair` remain explicit operator commands
under [#1057](https://github.com/git-stunts/git-warp/issues/1057); ordinary reads
never require them. Legacy `basis` and `repair --action materialization` paths do
not survive as ordinary application guidance. MCP and generated SDKs must not
reintroduce removed capabilities through transport DTOs.

## 10. Delivery and acceptance

Each implementation PR remains independently usable and carries its own witness.
The sequence below preserves existing public behavior until the explicit major
removal. It does not claim the final contract is implemented during intermediate
slices.

| Owner | Contract sections | Required prior integration / safe result |
| --- | --- | --- |
| #1049 | Entire record | No implementation prerequisite; reviewed contract, not runtime evidence |
| #1050 | 2, 9 | Existing amended allowlist; shrinking export ratchet, no removals |
| #1051 | 2–3, write obligations in 5–7 | #1040 and #1049; additive Warp composition, authority boundary, and cone writes |
| #1052 | 3–6 | #1040, #1049, and shared Warp composition from #1051; additive bounded Optic reads |
| #1053 | 7–8 | #1049 and #1052; durable Coordinate replay, re-ask, and forks |
| #1054 | 9 | #1051–#1053; remove legacy public capabilities as the declared major change |
| #1055 | 3–4, 9 | #1051–#1052; migrate the existing newcomer witness and first-use docs |
| #1057 | 9 | Align with the available cone/optic operations; operator diagnostics remain usable |

The #1051 → #1052 edge is a **proposed prerequisite correction**: this contract
assigns the shared Warp composition and access boundary to #1051. The currently
recorded #1052 prerequisites omit it. Accept the edge with this ownership choice;
do not implement a second composition root to simulate independence.

The existing newcomer witness is [PR #1046](https://github.com/git-stunts/git-warp/pull/1046),
tracking #1045. Reuse it and flip each current-behavior pin in the fixing PR.
Do not create a duplicate test with a different application path.

Acceptance evidence must cover:

1. Public-entrypoint read-own-writes and complete empty reads without repair.
2. Whole-state traps on every public read/write path, with a positive trap control.
3. Observer/purpose denial before evaluation; no cross-observer memo disclosure.
4. One observation execution, bounded streaming, cancellation, and honest limits.
5. Stable receipt bytes across cold/warm paths under identical bindings.
6. Coordinate round trip, restart/GC replay, denial after revocation, and missing
   evidence refusal; no historical write or external effect is redelivered.
7. New questions remain at the retained basis; identity/purpose changes require
   checked coarsening or a separately authorized observation.
8. Nested forks retain their originating observation; stale settlement plans fail.
9. The export guard covers all package subpaths and public members, including
   aliases, runtime values, type-only exports, and the opaque Coordinate exception.
10. Each implementing issue links its owned sections, and all required checks run
    under the repository's Docker isolation and resource limits.

Review of this document can accept the contract and ownership graph. Completion
of #1048 requires the executable evidence above, not a checked design document.
