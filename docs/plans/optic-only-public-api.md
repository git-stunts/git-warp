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
| `AuthoredWarp` | Returned only by `as`; `execute(intent)`, `settle(plan)` | Authorizes the writer and operation; `execute` obtains its own bounded admission observation as specified in section 7 |
| `ObserverIdentity` | `of(namespace, subject)` validates a principal name | A name is not an authentication credential or a grant |
| `Purpose` | `of(namespace, name, version)` validates a registered purpose identifier | Unknown or undeclared purposes are refused by policy |
| `ReadBudget` | `of(limits)` validates named finite limits for records, emitted bytes, and work | Invalid limits fail construction; execution accounts for aggregate work |
| `Optic` | `Optic(observedWarpOrStrand)` returns an immutable query builder | An unscoped Warp cannot execute a question |
| `Intent` | Existing validated builders or generated SDK constructors | Preserve actual intent/reducer semantics; no arbitrary callback execution |
| `Observer` | Existing validated/generated query-plan constructors | This names a question plan, not a principal; requires stable identity and version |
| `Observation` | Resolved by `read()`; async iteration, `receipt: Promise<ObservationReceipt>`, `cancel(): Promise<ObservationReceipt>` | One execution and consumer; cancellation and receipt demand settle to the same terminal receipt |
| `Reading` | Emitted only by an Observation | Validated value plus scoped evidence; never a whole-state object |
| `PageSize` / `PageContinuation` | `PageSize.of(records)` validates a positive finite page limit; continuation is returned only by `ContinuedCoverage` | Continuation is opaque, bound to one live pagination session, and consumed by `query.resume(continuation).read()` |
| `CompleteCoverage` / `ContinuedCoverage` | Returned in a completed observation receipt's `coverage`; only `ContinuedCoverage` has `continuation` | A completed page is not a complete answer; only `CompleteCoverage` attests exhaustion of the underlying question |
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
const observation = await Optic(view)
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
`at` captures the replica's admitted basis when `read()` starts execution. Building
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
| Neighborhood | `node(id).neighbors().page(size)` | Stream one bounded page; the receipt supplies coverage and any continuation |
| Traversal | `node(id).traverse().page(size)` | Stream one bounded traversal page; no implicit exhaustive expansion |
| Content | `node(id).content()` / `edge(id).content()` | Bounded metadata/readings and authorized byte streams; no whole-blob collector |
| Entity inventory | `entities()` | Stream admitted occurrences at one fixed observation basis |
| Generated structural observer | `witness(observer)` | Use the plan's declared cardinality, purpose, support requirements, and version |

Every builder ends in `read(): Promise<Observation>`. Calling it starts one
execution, checks authority, and establishes the observation basis before any
Reading can be emitted. Expected refusals resolve to an Observation with a typed
terminal result; they do not manufacture a successful basis or Coordinate.
Iteration and receipt consumption share that execution. Receipt-only demand
drains without accumulating values. A second independent consumer is a typed
misuse, not a second query. Breaking iteration invokes the same cancellation
transition as `cancel()`; neither silently drains the remaining question.

`ObservationReceipt` denotes the validated terminal receipt variants, including
completed, cancelled, refused, and failed execution. `cancel()` is idempotent:
it requests cancellation immediately and resolves to the same terminal receipt
as `receipt`, after owned work and streams have stopped. One serialized terminal
transition wins. If completion, failure, or refusal already won, cancellation
returns that unchanged receipt. Otherwise cancellation wins, prevents later
completion, and yields a cancelled receipt with honestly partial coverage.
It cannot claim completed observation support or a completed Coordinate.

A pending `next()` may deliver a Reading only if its delivery precedes the
cancellation transition; remaining pending and subsequent iterator requests end
without new readings. Receipt-only draining obeys the same stop transition.
Cancellation does not wait for a paused consumer to request another value.
`Warp.close(): Promise<void>` stops admitting new operations, requests this same
cancellation for every unfinished observation (including a pending `read()`),
and waits for owned work to quiesce. A pending `read()` still resolves to its
Observation and terminal receipt. Already terminal receipts remain unchanged;
closing does not delete their retained evidence. The implementation witness must
exercise cancel versus iteration, receipt-only demand, completion, and close.

This deliberately changes v20's synchronous, dormant `Lane.observe` construction:
awaiting the new `read()` initiates the bounded operation. Merely constructing an
Optic remains pure. Slow consumers apply backpressure; the executor must not
eagerly buffer the result while waiting for iteration to start.

A missing node/property is not represented by a missing Reading: the exactly-one
result carries absence only when its support is sufficient. A complete empty
inventory emits zero readings and a completed, complete receipt. Withheld or
unavailable data must not be disguised as ordinary absence.

For pageable questions, `.page(PageSize.of(records))` sets the page boundary;
omitting it uses a finite policy default. Inventory questions support the same
operation. One `read()` emits one page and settles its receipt. If execution
reaches that boundary with more results, its `CompletedObservationReceipt` has
`ContinuedCoverage`, whose `continuation` is a `PageContinuation`. Otherwise,
verified exhaustion yields `CompleteCoverage`. Determining whether more results
exist is budgeted work; uncertainty cannot become a complete answer.

Request the next page with `query.resume(receipt.coverage.continuation).read()`
after narrowing coverage to `ContinuedCoverage`. Each page has its own Observation
and receipt; the receipt binds its page position as well as the underlying
question. All pages share the initial admitted basis, deterministic ordering,
question/version, observer, purpose, law, and dependency evidence. Resume checks
current authority and these bindings before retrieval. Changed bindings refuse
resume rather than capturing a new live basis. Page receipts attest their own
coverage; the final complete receipt links the preceding page evidence.

The continuation retains the session's remaining aggregate work/byte/record
budget. Page size cannot reset that budget. A continuation admits at most one
successor execution; concurrent or repeated consumption returns a typed
already-consumed refusal. It is a live handle, not a serializable Coordinate:
closing its Warp ends the session, and later resume returns a typed closed
session refusal. A new question at a retained Coordinate is a separate observation.
Cancellation, denial, failure, or budget exhaustion yields an incomplete terminal
result without continuation, even if some readings were delivered. Defaults and
aggregate accounting are executable obligations, not unlimited optional hints.
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
insufficient. The exact admitted observation basis must match. A memo built before
an admitted write cannot answer a later live question by matching only query text
or a subset of dependency keys. Question/version, page position where applicable,
observer, purpose, effective revelation, law/reducer versions, dependencies, and
relevant budget semantics must also match. An explicit checked coarsening may
authorize narrower disclosure at that same basis; it cannot waive basis identity
or present the source receipt as the new observation's receipt.
A memo hit cannot upgrade an obstruction,
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

`AuthoredWarp.execute(intent)` obtains that observation internally. The registered
intent's admission plan declares the versioned premise question; the writer is
the observer, the registered write purpose is the purpose, and the access port
supplies the approved budget and rights. Before evaluating any premise, execution
fixes one admitted basis. Every premise read, including authority/law evidence,
is bound into that attempt's retained observation. Missing support, undeclared
purpose, or exhausted budget refuses admission before publication. A prior
application read is not implicitly reused: any required application condition
must be expressed by a supported validated intent, or refused as unsupported.

Publication checks the expected target basis through the engine's admission
boundary. If it advanced after premise capture, the attempt returns a typed stale
observation obstruction without publishing the intent; it cannot substitute a
newer basis or automatically retry. A caller may execute again, producing a new
attempt and new evidence. A successful publication and its receipt bind the same
premise observation and admitted intent. Concurrent history arriving after that
publication does not rewrite either. Apply this rule to authored Strands as well;
it is local admission discipline, not a distributed lock or consensus claim.

Before returning a durable Coordinate, retain its record, receipt, necessary
history, and replay dependencies through git-cas-owned roots/publications.
A metadata reference alone is not a Git reachability guarantee. Successful
replay after restart and `git gc` is required evidence. If retention cannot be
established, return a typed failure; do not advertise a durable token.

The v21 lifetime policy is repository-lifetime retention: issued durable
Coordinates have no automatic expiry, cache eviction, or application release
method. Close, restart, access revocation, and ordinary GC cannot remove their
roots. Revocation restricts use without rewriting or deleting historical
evidence. Copies of a token share the same obligation; dropping one handle does
not release it. This policy does not promise survival after explicit destruction
of the repository or storage loss.

Retained storage grows with issued observations and their necessary evidence;
deduplication is an optimization, not a constant-storage claim. A configured
retention capacity may refuse new durable observations but must preserve already
issued ones. Reserve required capacity before write publication, and persist the
necessary roots with the admitted write's evidence. If a failure occurs after
publication, report the actual admitted or indeterminate write outcome separately
from retention failure; never label it unapplied or retry the intent silently.
No receipt may advertise a durable Coordinate until retention succeeds.

If an issued token's evidence is missing or corrupt, replay, re-ask, and fork
return a typed unavailable-evidence refusal with policy-safe rehydration guidance;
they never reconstruct a newer standpoint and call it the original. Future
expiry or explicit release requires a separately reviewed lifecycle contract,
dependent-root handling, and distinguishable released/expired refusals. It is
outside #1053's initial delivery, not an undocumented cache policy.

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
| #1051 | 2–3, write premise capture in 5–7 | #1040 and #1049; additive Warp composition, authority boundary, and cone writes with retained premise evidence |
| #1052 | 3–6 | #1040, #1049, and shared Warp composition from #1051; additive bounded Optic reads |
| #1053 | 7–8 | #1049 and #1052; finalize Coordinate-bearing receipts, replay, re-ask, forks, and the Strand preview/settlement journey |
| #1054 | 9 | #1050–#1053 and #1055; remove legacy public capabilities with the export guard and migrated consumers in place |
| #1055 | 3–4, 8–9 | #1051–#1053; migrate the existing example, newcomer witness, and full read/write/fork/settlement documentation |
| #1057 | 9 | #1040, #1049, and #1052 for actual Optic probes; retention actions also require the corresponding #1044 capabilities |

The following prerequisite corrections are part of accepting this ownership
graph; they are proposals until this record is integrated and the issue scopes
are reconciled. #1051 precedes #1052 because it owns shared Warp composition and
access. #1053 precedes #1055 because the existing newcomer journey includes forks
and settlement. #1050 and #1055 precede #1054 so removal is checked and existing
documentation/examples keep working. #1052 precedes #1057 because an actual Optic
probe cannot be replaced by a parallel readiness approximation. The #1044
retention work remains an explicit external prerequisite for its corresponding
operator actions, not an assertion that those capabilities already exist.

#1051 owns capture and retention of the actual write premises and publication
evidence, exposing the existing write receipt shape and opaque evidence handles
in that additive intermediate release. #1052 similarly owns bounded execution
and retained read evidence using the existing receipt contract. Neither claims
the final `CompletedObservationReceipt` or durable public Coordinate before
#1053 establishes its invariants. #1053 consumes those original records; it may
not recapture historical premises. It owns the final Coordinate codec, durable
receipt variants and retention checks, replay, and the section 8 public journey.
This preserves observable writes and reads after each merge without creating a
backward dependency from their producers to the later Coordinate consumer.

#1054 owns removal and any remaining transport/import changes necessary to keep
the package, CLI, MCP, generated SDKs, and examples working in the same merge.
#1057 owns the separately scoped operator rewrite; it cannot remove an operator
action while its replacement prerequisites are unavailable. Every implementing
PR must reconcile these scopes with its issue and link the owned sections before
claiming completion. A planning dependency is not evidence that its predecessor
passed acceptance.

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
