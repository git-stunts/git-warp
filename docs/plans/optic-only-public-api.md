# Optic-only public API contract

Status: **Implementation contract, effective on integration of
[#1059](https://github.com/git-stunts/git-warp/pull/1059); not a shipped API.**

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
| `AuthoredWarp` | Returned only by `as`; `execute(intentOrIntents): Promise<WriteReceipt>`, `settle(plan)` | Authorizes the writer and operation; `execute` obtains its own bounded admission observation and returns the write receipt variant specified in section 7. While it fixes the basis or reads the premise records, an unavailable store returns `UnpublishedWriteReceipt`, and invalid input, a throwing injected access port, a defect, a broken invariant, corruption or a store failure the adapter cannot identify as transient rejects. The attempt-journal and custody-support steps are not yet classified by type (#1109) (section 11) |
| `ObserverIdentity` | `of(namespace, subject)` validates a principal name | A name is not an authentication credential or a grant |
| `Purpose` | `of(namespace, name, version)` will validate a registered purpose identifier (#1052) | Will refuse unknown or undeclared purposes by policy. There is no runtime purpose registry; the runtime-backed `Purpose` class arrives with caller-supplied purposes in #1052 (section 11) |
| `ReadBudget` | `of(limits)` validates named finite limits for records, emitted bytes, and work | Invalid limits fail construction; execution accounts for aggregate work |
| `Optic` | `Optic(observedWarpOrStrand)` returns an immutable query builder | An unscoped Warp cannot execute a question. #1052 must make an unavailable store before read permission settle the observation to a typed failed receipt; `read()` will not reject for it (section 11) |
| `Intent` | Existing validated builders or generated SDK constructors | Preserve actual intent/reducer semantics; no arbitrary callback execution |
| `Observer` | Existing validated/generated query-plan constructors | This names a question plan, not a principal; requires stable identity and version |
| `Observation` | Resolved by `read()`; async iteration, `receipt: Promise<ObservationReceipt>`, `cancel(): Promise<ObservationReceipt>` | One execution and consumer; cancellation and receipt demand settle to the same terminal receipt |
| `Reading` | Emitted only by an Observation | Validated value plus scoped evidence; never a whole-state object |
| `PageSize` / `PageContinuation` | `PageSize.of(records)` requires a positive safe integer, rejecting fractions, non-positive values, and non-finite or unsafe numbers; continuation is returned only by `ContinuedCoverage` | Continuation is opaque, bound to one live pagination session, and consumed by `query.resume(continuation).read()` |
| `CompleteCoverage` / `ContinuedCoverage` | Returned in a completed observation receipt's `coverage`; only `ContinuedCoverage` has `continuation` | A completed page is not a complete answer; only `CompleteCoverage` attests exhaustion of the underlying question |
| `Receipt` variants | Returned by writes, observations, forks, replay, and settlement; `CompletedObservationReceipt` carries a durable Coordinate when the query asked for one | Describe the actual operation and its outcome; no caller-created success evidence |
| `WriteReceipt` variants | Returned only by `execute`; `RetainedWriteReceipt`, `UnretainedWriteReceipt`, `UnpublishedWriteReceipt`, or `IndeterminateWriteReceipt` | Section 7 defines which variant establishes publication, admission, retention, and a usable `coordinate` |
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
starts a new question inheriting the retained basis, observer, and purpose.
If the bound view or requested purpose differs, execution refuses unless the
access port proves the strict coarsening described in section 5. It never borrows
the original principal's rights or silently changes that standpoint.
A live Optic without
`at` captures the replica's admitted basis when `read()` starts execution. Building
the query does not silently freeze a moving history.

Reads never append writer patches. A read retains only when its query asks
for a Coordinate (decided 2026-11-06, #1080). Retention costs objects and a
permanent ref per observation, and a read that nobody can cite again gains
nothing from paying it. Without that request, a completed read returns
`CompletedObservationReceipt` with no Coordinate: it states what was read and
at which basis, but it cannot be replayed or forked from. With the request,
the observation, including a completed page, must retain its evidence through
the separate retention path before returning the receipt and its durable
Coordinate. Retention denial or failure then yields a typed non-completed
terminal receipt even if some readings were already delivered; streamed values
alone do not prove durability or completion. Cancelled/refused/failed attempts need not invent a
Coordinate. Retention's storage cost and disclosure policy are explicit; it
cannot become an ambient writer identity merely to reuse a write API.

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
completed, cancelled, refused, failed, and budget-exhausted execution. `cancel()` is idempotent:
it requests cancellation immediately and resolves to the same terminal receipt
as `receipt`, after owned work and streams have stopped. One serialized terminal
transition wins. If any terminal variant already won, including budget exhaustion,
cancellation returns that unchanged receipt. Otherwise cancellation wins, prevents later
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
result without continuation, even if some readings were delivered. Each is a
terminal winner preserved unchanged by later cancellation and receipt demand. Defaults and
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
Without that proof, historical reuse is refused. A caller may instead start a
separately authorized live observation without `at` or the old continuation;
that captures its own basis and does not inherit the historical standpoint.
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
A write core in layout version 1 (pre-#1072, clones of unreleased `main` only)
is unsupported: replay refuses it and never reads its missing races as `[]`.

A write's Coordinate binds the observation that justified that intent, including
its actual read-before-write basis. The resulting write receipt separately binds
the admission outcome. A later capture is not a substitute. Even an intent with
no data reads has explicit authority/law premises and an empty data question.

The target `WriteReceipt` is a family of validated runtime variants. The existing
intent-or-intent-sequence input remains supported; the premise question covers
the whole submitted sequence under the engine's admission semantics. Its result
is one of the following, on authored Warp and Strand handles alike:

| Variant | Public evidence | Meaning |
| --- | --- | --- |
| `RetainedWriteReceipt` | Actual admission `outcome`, occurrence evidence where applicable, opaque exact-publication evidence, and `coordinate: Coordinate` | Publication and its required retention are established; the Coordinate binds the actual justifying observation and replays this write receipt |
| `UnretainedWriteReceipt` | Actual admitted `outcome`, occurrence and exact-publication evidence, and a typed retention cause; no `coordinate` | The write was admitted, but durable observation retention did not complete; this is not an unapplied write |
| `UnpublishedWriteReceipt` | Typed refusal/failure outcome, policy-safe cause and repair hints; no publication or `coordinate` field | The attempt is known not to have published, including stale-predecessor, authority, budget, or pre-publication I/O failure |
| `IndeterminateWriteReceipt` | Opaque attempt evidence and typed reconciliation requirement; no claimed admission outcome, exact-publication handle, or `coordinate` | Publication cannot yet be established or ruled out; the receipt must not imply that retry is safe |

The opaque evidence fields are references, not public frontiers or raw receipt
storage. Callers narrow the runtime variant before reading its success fields.
Only `RetainedWriteReceipt` exposes a write `coordinate` for receipt replay;
the token grants no authority and replay checks current rights.
Neither an unretained nor an indeterminate result
may silently re-execute the intent; any reconciliation uses the attempt's actual
publication evidence. A separate caller decision is required to submit a new
attempt, and uncertain publication must be resolved before treating it as a retry
of an unapplied operation. #1051 owns this final receipt family and consumes
#1067's shared identity and custody; #1053 owns its historical use. There is no
intermediate compatibility receipt shape.

`AuthoredWarp.execute(intent)` obtains that observation internally. The registered
intent's admission plan declares the versioned premise question; the writer is
the observer, the registered write purpose is the purpose, and the access port
supplies the approved budget and rights. Before evaluating any premise, execution
fixes one admitted basis. Every premise read, including authority/law evidence,
is bound into that attempt's retained observation. Missing support, undeclared
purpose, or exhausted budget refuses admission before publication. A prior
application read is not implicitly reused: any required application condition
must be expressed by a supported validated intent, or refused as unsupported.

Publication consumes that exact premise record and checks the selected writer's
expected predecessor and current authority through the engine's admission
boundary. If that writer's predecessor or another required publication condition
changed, return a typed stale/denied obstruction without publishing the intent;
do not substitute newer premises or automatically retry. A caller may execute
again, producing a new attempt and new evidence.

Unrelated writers may advance concurrently: publication neither enumerates their
heads again nor demands a globally unchanged frontier. The successful receipt
binds the original observation and admitted intent, not a newly captured “now.”
Later joined history may change derived answers without rewriting that receipt.
Intent conditions are claims evaluated at the captured standpoint, not a promise
of global serializable transactions. Apply the same rule to authored Strands.
The witness must distinguish an own-writer predecessor race (stale refusal) from
an unrelated-writer append (independent publication with unchanged premises).

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
The [maintainer's direct breaking cutover amendment](https://github.com/git-stunts/git-warp/issues/1048#issuecomment-6570380317)
supersedes the original additive receipt stage. Producers implement their final
receipt families when they land. Existing paths may remain until removal, but
compatibility wrappers are not a prerequisite. Private preparation does not claim
that the final public contract is implemented.

| Owner | Contract sections | Required prior integration / safe result |
| --- | --- | --- |
| #1049 | Entire record | No implementation prerequisite; reviewed contract, not runtime evidence |
| #1050 | 2, 9 | Existing amended allowlist; shrinking export ratchet, no removals |
| #1062 | Private cone foundation | Independently tested records, ingest and basis services; no final public API |
| #1067 | Shared identity and custody in 7 | #1049, integrated #1062, and released git-cas #157; private canonical identity, Coordinate codec, durable admission and exact retained evidence |
| #1051 | 2–3, write premise capture in 5–7 | #1049, #1062 and #1067; Warp composition, authority boundary, cone writes and all four final write-receipt variants |
| #1052 | 3–6 | #1049, #1054, #1062, #1067 and shared Warp composition from #1051; bounded Optic execution and final observation receipts; deletes the legacy read path in the same PR that adds the Optic read |
| #1053 | Historical operations in 7–8 | #1049, #1067 and #1052; replay, re-ask, forks, and the Strand preview/settlement journey |
| #1054 | 9 | #1050, #1051 and #1079 (GitHub dependencies; #1054 precedes #1052 by the #1079 decision of 2026-11-08); remove each legacy public capability with its tests, examples and CLI paths in the same PR, behind the export guard. The read path (`Runtime.open()`, `runtime.lane()`, `Lane.observe` and the legacy `Optic` read) and its consumers stay until #1052 deletes it and #1055 moves the examples |
| #1055 | 3–4, 8–9 | #1051–#1053; migrate the existing example, newcomer witness, and full read/write/fork/settlement documentation |
| #1057 | 9 | #1062, #1049, and #1052 for actual Optic probes; retention actions also require the corresponding #1044 capabilities |
| #1079 | 2, 11 | #1051; payload headroom, the pre-permission I/O outcome, the static purpose decision, and the v20 trailer witness |

These ownership corrections reconcile the live producer issues with the
maintainer amendment. #1067 precedes both producers because durable observation
identity and custody are shared prerequisites; public historical operations are
not a prerequisite for producing a receipt. #1051 precedes #1052 because it owns
shared Warp composition and access. #1053 precedes #1055 because the existing newcomer journey includes forks
and settlement. #1050 precedes #1054 so removal is checked. #1054 precedes #1052,
by the #1079 decision of 2026-11-08, so #1052 starts with the bytes the legacy
deletion frees. Every merge leaves `main` working, so #1054 deletes every legacy
public surface except the read path: `Runtime.open()`, `runtime.lane()`,
`Lane.observe` and the legacy `Optic` read, and nothing else. It keeps the
documentation and examples that read through that path working. #1052
deletes that legacy read path in the same PR that adds the Optic read, so `main`
always has a public read path. #1055 later moves the examples onto the full
read/write/fork/settlement journey. #1052 precedes #1057 because an actual Optic
probe cannot be replaced by a parallel readiness approximation. The #1044
retention work remains an explicit external prerequisite for its corresponding
operator actions, not an assertion that those capabilities already exist.

#1067 owns the common canonical identity, opaque Coordinate codec and private
durable custody described in the [observation custody design](./observation-custody.md).
git-cas owns hard record-slot admission and retained roots; WARP owns semantic
correspondence to the original observation and publication. #1066 is a native
capability witness, not a production-code prerequisite. PR #1040 supplies reusable
prototype evidence, not a required legacy public conversion.

#1051 owns capture of the actual write premises, publication and the final retained,
unretained, unpublished and indeterminate write receipts. #1052 owns bounded
execution, terminal observation variants, cancellation and page continuation,
using shared custody before exposing a completed Coordinate. #1053 consumes those
original records for historical operations; it may neither recapture a newer
basis nor re-execute an intent. No always-unretained or always-refused substitute
satisfies the producers' final behavior.

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
4. One observation execution; cancel/receipt/close races; page continuation at a
   fixed basis with aggregate limits, single consumption, and honest completeness.
5. Stable receipt bytes across cold/warm paths under identical bindings.
6. Coordinate round trip, restart/GC replay, denial after revocation, retention
   capacity refusal preserving old tokens, and missing evidence refusal; no
   historical write or external effect is redelivered. Write tests advance the
   selected writer's predecessor between premise capture and publication and
   require stale refusal; an unrelated writer advance must preserve independent
   publication and the original observation binding.
7. Re-asking inherits basis, observer, and purpose; changing historical identity
   or purpose requires checked strict coarsening. A separately authorized live
   observation cannot claim to reuse that standpoint.
8. Nested forks retain their originating observation; stale settlement plans fail.
9. The export guard covers all package subpaths and public members, including
   aliases, runtime values, type-only exports, and the opaque Coordinate exception.
10. Each implementing issue links its owned sections, and all required checks run
    under the repository's Docker isolation and resource limits.

Review of this document can accept the contract and ownership graph. Completion
of #1048 requires the executable evidence above, not a checked design document.

## 11. Decisions recorded by #1079

James Ross decided [#1079](https://github.com/git-stunts/git-warp/issues/1079)
on 2026-11-08 for Option A. These rules bind #1052, #1053, and #1054.

**Package payload.** v21 keeps the 3,300,000-byte unpacked ceiling in
`scripts/package-payload/PackagePayloadPolicy.ts`. #1079 makes headroom by
deleting internal code that no package entrypoint or command reaches, including
code reached only by its own tests. The budget is not raised. Measured with
`scripts/package-payload/CheckPackagePayload.ts` after `npm run build`:

| State | Unpacked bytes | Free bytes | Compressed bytes | Entries |
| --- | ---: | ---: | ---: | ---: |
| Before #1079 (`origin/main` at d78c33d99) | 3,295,830 | 4,170 | 713,417 | 1,229 |
| After #1079 | 3,282,914 | 17,086 | 711,234 | 1,225 |
| After #1072 (PR #1095) | 3,294,515 | 5,485 | 714,158 | 1,230 |

#1052 is expected to be close to #1051 in size, and #1051 added about 323,000
unpacked bytes. 17,086 free bytes did not cover that, and after #1072 5,485 remain. **Decided (2026-11-08):**
#1054 runs before #1052 and is recorded as a GitHub dependency, so #1052 starts
with the bytes the legacy deletion frees. Measure again after #1054. If #1052
still needs more, it deletes the legacy code it replaces in its own PR, or it gets
a separate budget decision.

**Pre-permission I/O.** At the basis-open and premise-read steps, only an
unavailable store gives a typed failure result instead of a rejection. The
attempt-journal and custody-support steps are not yet classified by type (#1109).
"Unavailable" is a positive verdict: the cone store adapter (`GitConeStoreHost`)
gives it only to a failure it can identify as transient, as its real producer
throws it, and nothing else. The list (`TRANSIENT_PERSISTENCE_CODES` and
`TRANSIENT_HOST_ERRORS` in that file) is exactly:

- `PersistenceError` `E_REF_IO`, a ref the history adapter cannot lock or read for
  permission (decided 2026-11-08, since a retry can clear it);
- `GitRepositoryLockedError`, which plumbing's own classifier throws when a Git
  command meets a held lock file, and which reaches the adapter unwrapped.

The list applies to failures the cone store host sees, beneath the cone record
store adapter, including the plumbing calls fast-import makes through the host: a
held lock during fast-import gives `write-basis-unavailable`. The host turns those
into `ConeStoreUnavailableError`, which carries the failure as its `cause`. An error
that `GitFastImportTreeWriter` creates above the host is not on the list and rejects,
for example an `E_REF_IO` it re-types from an exit-128 failure. Every failure from
the patch feed or the writer's runtime host rejects, transient or not. Classifying
those sources is #1109. Domain code dispatches on that class with `instanceof`, never on a
message. The cause stays on the error and off the public receipt, whose `cause` is a
policy-safe string (decided 2026-11-08). #1107 will report the underlying cause
through the injected logger; until then the underlying host failure is not recorded.
A `GitProtocolError` rejects (decided 2026-11-08, option A): a crashed `git` process
and a truncated object look the same, git-cas has already retried it once on the
object-session path, and on other paths it cannot be identified as transient.

- `AuthoredWarp.execute()` returns `UnpublishedWriteReceipt` with
  `write-basis-unavailable` when the store is unavailable while it fixes the write
  basis, and with `write-premise-unavailable` while it reads the premise records.
  Nothing was reserved or published at either step, so the receipt is true. An
  expected write refusal met while reading keeps its own cause and repair hints.
- The attempt-journal and custody-support steps still give
  `attempt-journal-unavailable` or `retention-unavailable` for any failure, defects
  included, until #1109 classifies them by type. Nothing was published at those
  steps either, but a `retention-unavailable` attempt can keep its saved attempt
  record, and a reserved retention slot, until the recovery sweep finishes it.
- **Corruption rejects** (decided 2026-11-08). At the basis-open and premise-read
  steps, every store failure the adapter cannot identify as transient rejects,
  having published nothing. That includes a `ConeRecordError` (a stored record that
  does not decode is one), a `PersistenceError` such as `E_MISSING_OBJECT` (git-cas's
  own `GIT_OBJECT_NOT_FOUND` is typed as one), every other git-cas code (for example
  `TREE_PARSE_ERROR`, `GIT_ERROR`, `INTEGRITY_ERROR`, `RESTORE_TOO_LARGE`,
  `INVALID_OPTIONS`, `RESOURCE_CLOSED`), a `GitProtocolError`, any other plumbing
  failure, and a bare error. A caller that retried those would retry forever against
  a broken repository. Defects (`TypeError`, `RangeError`), broken invariants
  (`PatchError`) and invalid input also reject. So does corrupt patch history met
  while reading the premise (`MessageCodecError`, `CrdtError`, `SyncError`
  `E_SYNC_PATCH_HISTORY`, a malformed or schema `PatchError`): it rejects as
  `WriteHistoryCorruptError`, not as a missing-basis refusal, because materializing
  cannot repair it. Only a writer with no history to observe (`E_PATCH_NO_STATE`)
  keeps the missing-basis refusal. Every failure from the patch feed or the writer's
  runtime host also rejects at those steps, transient or not, until #1109 classifies
  them, and so does an error that `GitFastImportTreeWriter` creates above the host.
- The injected `WarpAccessPort` is a caller-owned capability, not a store. If it
  throws, the operation rejects and publishes nothing.
- #1052 must give an Optic read the same rule: an unavailable store before read
  permission or evaluation settles the observation to a typed failed receipt.
  `read()` and iteration will not reject for that failure, and the receipt claims
  no completed classification.
- After publication permission, section 7 applies. Its outcomes are
  indeterminate, unretained, or a settled receipt. `AuthoredWarp.reconcile()`
  reads after an attempt exists, so section 7 governs it too; it rejects if a
  store read fails.

**Purposes.** No dynamic purpose registry will be built (decided). Today the only
write purpose is the string constant `WRITE_PURPOSE`
(`git-warp:purpose/write-admission/v1`), and the only premise question is
`git-warp:question/write-premise` version 1. No class validates the purpose, and
no caller can supply one, so no path refuses an unknown purpose yet. The
runtime-backed `Purpose` value class, `Purpose.of(namespace, name, version)` in
section 2, is built in #1052, where caller-supplied purposes first appear. A new
purpose or question is a code change with a new version.

**v20 compatibility.** The released v20.0.0 package is installed from its
published tarball into `test/fixtures/v20-reader` in the Docker test images, and
`test/integration/compat/V20PublicationAttemptTrailer.integration.test.ts` states
two facts:

- A v20 reader refuses a repository that v21 `Warp` wrote, on its substrate marker
  (`E_SUBSTRATE_VERSION_UNSUPPORTED`), before it reads any patch, and changes no
  ref. This is the case users meet: a v20 clone does not coexist with v21 history.
  The premise of #1079 step 8, that a v20 reader would meet the trailer, was wrong.
- v20's commit message decoder and patch reader ignore the
  `eg-publication-attempt` trailer. The witness adds the trailer, in the format
  `Warp` writes, to a patch that v20 wrote; v20 then decodes it as before,
  materializes and reads the lane, and extends the writer's chain on top. This
  matters only to code that decodes commit messages without the substrate gate.
