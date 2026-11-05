# Shared observation identity and custody

Implementation contract for [#1067](https://github.com/git-stunts/git-warp/issues/1067),
under the [Optic contract](./optic-only-public-api.md), especially section 7.
This document specifies the private prerequisite. The service, its production
adapters and native witnesses exist in `src/domain/services/custody/` and
`src/infrastructure/adapters/`, but nothing composes or exports them yet: #1051 and
#1052 connect the producers. This is not a public Coordinate or a shipped release.
Producers can start at the [producer protocol](#producer-protocol); the sections
before it explain why it is shaped that way.

## Outcome and ownership

An observation survives close/reopen and ordinary Git GC with its original receipt
core, basis and required dependencies intact. Capacity is admitted before a writer
can publish. A retained result is issued only after durable custody and semantic
correspondence are verified. Failure never becomes permission to retry an intent.

git-cas 7.1.0 owns hard record-slot admission, its durable ledger, and preparation
and settlement custody. WARP consumes the published package and owns the meaning
of the retained evidence. It must not add a second capacity counter or reuse the
private 64-basis ring as durable observation storage. A record-slot limit does not
claim to cap bytes or total repository growth.

The shared implementation remains private. #1051 owns the actual write transition
and all four final write receipts; #1052 owns observation execution, all terminal
variants and pages; #1053 owns replay, re-ask, coarsening, forks and settlement.
Those integrations enforce current rights before answer-affecting retrieval.
Each producer also owns proving its publication evidence is the commit it actually
published, including that commit's authorship and its parent against the bound
predecessor. Custody never reads the commit: it compares the evidence's declared
writer label with the write premise, and checks that the commit exists.
Internal custody resolution grants no disclosure authority. #1044's broader memo,
compaction and deletion policies remain outside this change.

## Two identities with different completion points

The capacity reservation exists before an external publication outcome is known.
The final receipt core may include that outcome. Therefore the reservation binding
cannot be the final receipt digest or depend on a successful publication.

1. The producer supplies the original observation bindings and a retained attempt
   identifier from an injected capability. The binding covers the captured basis,
   observer, versioned question, registered purpose, approved budget and original
   authority/law/dependency evidence. For a write it also binds the submitted
   intent sequence and selected writer predecessor. It is never recaptured.
2. The preparation codec canonicalizes those bindings with an explicit domain and
   wire version. Injected crypto derives the reservation binding. The same attempt
   is reused on recovery; a new invocation has a new attempt identity.
3. When the producer has the actual outcome, the core codec canonicalizes that
   receipt without its Coordinate. Physical I/O, timing and retry diagnostics stay
   outside the canonical core. The observation record binds the original
   preparation, core digest and exact publication evidence where applicable.
4. A Coordinate is a versioned opaque locator for the original reservation together
   with the final observation-record digest. Both components
   are digests or injected opaque identifiers, never raw basis or writer parts.
   Syntax parsing does not prove existence, integrity or authority. The grammar
   is `warp-observation:1:<attempt>:<binding>:<record>`, in lowercase hex, parsed and
   formatted by `ObservationCoordinate`: the token is that value's canonical form,
   so its text lives with it rather than behind a codec port.
5. Resolution reads that reservation's original settlement, checks its binding,
   canonical record digest and core digest, then returns the exact original core
   bytes. No record, nonce or receipt is regenerated from today's graph.

This separates an addressable final record from a reservation that precedes it;
it avoids both self-referential hashing and inventing a successful receipt early.
A digest is not an entropy claim. Any profile requiring an unguessable locator
must use injected entropy/key material retained with the occurrence, and still
perform current access checks. Error and timing disclosure remain access-policy
concerns.

Runtime classes that hold invariants validate them, result carriers only freeze,
and byte owners copy inputs and outputs. Named codec ports exchange validated domain values and explicit decode
failures. Raw shapes and CBOR/JSON handling remain at adapters. Use canonical
field order and version/domain separation rather than object insertion order;
reject unsupported versions, duplicate fields, alternate encodings and surplus
fields instead of normalizing corrupted records into an accepted identity.

## Durable state and publication permission

The production adapter uses `cas.reservations.open()` with an explicit namespace
and record-slot policy. Policy mismatch is a refusal, not a request to silently
open another namespace or increase capacity. The adapter maps CAS outcomes into
validated WARP result variants; core logic never branches on error messages.

| Durable state | Permitted next action | Claim boundary |
| --- | --- | --- |
| Reservation admitted | Construct and retain original preparation evidence | Capacity exists; no publication or durable Coordinate claimed |
| Preparation acknowledged | Request the one-shot arm transition | Original support is retained; permission has not yet been issued |
| Fresh `armed` acknowledgement | Owning producer may perform its one publication attempt | This acknowledgement alone is publication permission |
| Recovered/already armed, or uncertain arm acknowledgement | Reconcile original evidence only | Never publish on this history; a later fresh `armed` is the only permission |
| Publication established, settlement not acknowledged | Retain/reconcile the exact original result | Admitted but unretained, not an unapplied write |
| Settlement acknowledged and correspondence verified | Issue retained result and Coordinate | Original core and required roots are durable |
| Cancellation durably wins before arm | Stop owned work; report known-unpublished | A late arm must refuse; do not infer this from a timeout |
| Publication established, evidence too large or undecodable | Report the admitted outcome, unretained, with no Coordinate | The attempt keeps its slot; a charged effect is never reclaimed |
| Armed, publication definitely failed | The permission's holder settles the failure; report unpublished | The attempt ends and keeps its slot, and no Coordinate is issued for it |
| Evidence missing/corrupt or effect unresolved | Typed unavailable/indeterminate outcome | Never repair by recapturing, reminting or retrying the effect |

Only CAS `arm()` returning the fresh `armed` status permits the external effect.
`reserve()` recovery, `inspect()`, `reconcile()`, and an `already-armed` refusal do
not. An acknowledgement lost after durable arm is indeterminate even if the
producer did not observe permission. Settlement recovery may finish storage; it
does not execute an intent. Producer verification must distinguish actual
publication evidence from an attempted or merely prepared commit identifier.

Read completion uses the same original bindings and custody, but never fabricates
a writer publication. Its producer owns the cancellation-versus-completion
terminal winner. A successful storage write cannot override a cancellation that
already won. A later close or revocation cannot release roots already issued to a
completed observation.

Cancellation awaits owned work and uses CAS's durable pre-arm cancellation
transition where it is applicable. Once armed or uncertain, no timeout, elapsed
lease, dropped object or process restart makes the charge reclaimable. A retained
reservation is never cancelled. Interrupted preparation may keep a conservative
charge until its durable state is reconciled; capacity exhaustion is preferable
to authorizing a second effect against an uncertain first one.

Exact retries preserve the same key, binding and bytes. Conflicting reuse refuses.
Storage-only recovery verifies the original snapshot and any retained construction
progress; it never re-enumerates current writer heads as a substitute.

## Reachability and bounded construction

The basis tree retains its record trie and frontier bytes. Frontier bytes that
contain commit OIDs do not retain those commits: writer history needs actual Git
parent edges. Content, authority/law and other dependencies need corresponding
tree/blob edges or supported retained handles. The service verifies the correspondence
between the declared support and actual edges before issuing success.

The upstream interfaces impose real per-call bounds: CAS publications allow 64
parents; reservation evidence allows 63 explicit parents and 64 support entries,
reserving the remaining commit parent for the original preparation. A basis with
more writers cannot be passed as an oversized parent array.

The history adapter reads writer heads from the frontier stored in the original
basis tree rather than accepting them from the producer, so an incomplete list cannot
pass as complete. Dependencies stay a producer stream, checked against a count and
digest bound into the preparation. A stream that runs past the claimed count stops
at once; any other difference is found at its end, before a carrier or custody page
exists, though page trees already written stay behind as unreferenced objects. The
producer computes both claim and stream, so a claim's completeness is its duty.

The adapter builds a carrier chain through supported CAS publications, using at most
63 new writer heads plus the previous carrier per commit. The final carrier is a
reservation parent. Dependency trees use bounded pages rather than an unbounded
support array. The iterator, each page and the overall operation have explicit
work/byte/count limits. Crossing a bound refuses before arm; it does not silently
omit history or collect the whole graph. Object checks run in one Git process per
batch. The fixed 129-writer witness exercises three batches.

The service checks what resolve will check before acknowledging preparation, and
re-verifies when recovering an unarmed preparation, so support it accepts can be
issued later under unchanged limits and intact objects. The preparation and receipt
core must also decode back to themselves, or they refuse before they can be retained.
Arming takes an `ObservationPrepared`, so the honest path through a resumed attempt
goes through that check. That guards against mistakes, not fabrication: the class has
a public constructor, and the ledger, not the token, is what enforces one permission.

Verification has limits worth stating:

- It walks carriers, dependency pages and the basis tree's top-level entries under
  one work bound. It does not walk the record trie or writer ancestry, which their
  retained Git edges keep reachable.
- It proves existence for those objects. It decodes the frontier and checks digests
  of custody pages, but does not rehash every retained blob; that is `git fsck`'s
  job. An object Git cannot open or parse reports as missing, including one whose
  file permissions forbid reading it, since `git cat-file --batch-check` says only that.
- A tree is loaded before the meter is charged for its entries. Honest page and basis
  trees are small; only a forged tree could be larger.
- An empty-tree dependency refuses as unverified: `git fast-import` drops that entry
  from its page tree, so the retained page cannot match the claim.
- Authority and law evidence is bound by digest. It keeps objects alive only if the
  producer also lists them as dependencies.
- A resolve reads `git-cas` custody first, so removed support often reports as
  `evidence-unreadable` rather than naming the missing object. Both are typed, and
  neither mints anything.
- A spawn failure, timeout, lost repository or refused read surfaces as uncertainty.
  Damage means Git's fatal exit with diagnostics about the object itself, or a tree
  the store could not parse. Git's message text is the only evidence, so an unusual
  failure is more likely to read as uncertain than as damaged.
- Bindings refuse names holding lone surrogates. The dependency count has a fixed
  ceiling of 64,512 and a custody page one of 4 MiB, whatever limits are configured.

Construction refs are scoped to the admitted attempt, with compare-and-swap
publication and original-input/progress evidence. Recovery validates that a
carrier belongs to this attempt and retains the claimed prefix; a readable head
alone is insufficient. A builder finding different inputs refuses rather than adopt
them, which is witnessed sequentially; racing builders of one attempt are witnessed
to converge. A carrier that landed with its acknowledgement lost is found and reused.
Cancellation, abandonment and reconciliation stop this service's owned builders. `prepare` runs after that stop,
and the ledger arbitrates it, so a late one refuses and releases its construction ref.
Cleanup cannot delete support another issued observation requires. No lease-based
reclamation or automatic expiry is introduced.

Successful settlement roots keep the final record, original receipt core, original
preparation, basis, required history and dependencies reachable without disposable
memo/head refs. Repository destruction or storage loss remains outside ordinary
GC survival. There is no public release or expiry operation in this delivery.

## Producer protocol

This is what #1051 and #1052 call, in order. The `must`s here bind the producer.
Compose the service from `GitCasObservationCustodyAdapter.open`,
`GitCasObservationSupportAdapter`, `ObservationCustodyCborCodec`, crypto, and an
`ObservationAttemptSourcePort` such as `EntropyObservationAttemptSource`.

**Configuration.** A graph's capacity `limit` is fixed the first time it opens. A
different value refuses, which also stops that process resolving existing Coordinates.
Support limits are configuration: lowering them makes affected Coordinates report
`work-limit` or `support-limit` until restored, so treat them as raise-only. No default
for either exists yet; #1051 chooses them.

**Building the inputs.** `ObservationBindings` holds the basis, observer, question,
purpose, budget, evidence and a dependency claim. Compute the claim with
`ObservationDependencyClaim.of` over the same ordered stream you will hand `prepare` as
`sources.dependencies`, or use `ObservationDependencyClaim.NONE`. The stream is consumed
once per call, so it must be re-creatable. A claim is bound before the attempt runs, so
a read must know its dependencies before `begin`; how a streaming read does that is
#1052's design question, and this delivery does not answer it.

**Write.** The id must be saved before anything can go wrong:

1. `attemptSource.next()`, then durably save the id and bindings.
2. `resume(id, bindings)`, which reserves.
3. `prepare(attempt, sources)`.
4. `authorizePublication(prepared)`.
5. On `ObservationPublicationPermission`, perform the one publication. Then exactly one of:
   - It published: durably save the exact `{ core, publication }`, then `settle(attempt, outcome)`.
   - It definitely did not: `settleFailedPublication(permission, core)`, then report
     unpublished. Only the permission's holder can know this.
   - You cannot tell: **call neither.** Report indeterminate, leave the attempt armed,
     and settle later only once publication is established. It stays charged until then.

**Read.** `begin(bindings)`, `prepare(attempt, sources)`, produce the answer, then
`settle(attempt, { core, publication: null })`. `begin` keeps no id for you, so a lost
acknowledgement leaves an unnamed reservation for the sweep below; use the write path's
first two steps if a slot matters more than the extra save. Every read that is not
cancelled spends a slot for the life of the graph.

**Misuse throws.** `ObservationCustodyError` with `E_OBSERVATION_CUSTODY_MISUSE` means a
programming error, not an outcome: arming a read, arming without an `ObservationPrepared`,
or settling a write without the premise's writer label or a publication. A write that has
already published must therefore get its evidence right before calling `settle`.

**What to persist.** To recover by `resume` and `prepare`: the id and bindings, and the
means to recreate `sources` while the attempt is still `reserved`. To repeat `settle`: the
exact core and publication evidence, since a different page conflicts. Nothing further is
needed for a token: `recoverCoordinate(identity)` rebuilds it from retained evidence.

**After a crash.** `attempts(phase)` lists what the ledger holds:

- `reserved` or `prepared` with no owner: `abandon(identity)`. Nothing can prove a producer
  is gone, so a live one loses its work, safely: its later arm refuses as cancelled.
- `settled`: `recoverCoordinate(identity)`.
- `armed`: stays charged. Settle it only with evidence of what happened.

| The service returned | The producer | Write receipt | Read terminal |
| --- | --- | --- | --- |
| `ObservationAdmitted`, `ObservationPrepared` | Continues. Neither permits publishing | None yet | None yet |
| `ObservationPublicationPermission` | Publishes once | None yet | Not applicable |
| `ObservationReconcileOnly` | Never publishes on this history. `reconcile`, and settles what is established | Indeterminate until established | Not applicable |
| `ObservationKnownUnpublished` | Stops; nothing can publish or complete | Unpublished | Cancelled |
| `ObservationPublicationFailed` | Stops; the attempt ended and has no Coordinate | Unpublished | Not applicable |
| `ObservationRefused` | Stops this step and follows the groups below | Unpublished | Refused, or budget-exhausted for a limit |
| `ObservationIndeterminate` | `reconcile`, unless `cause` says otherwise. Never treats it as unpublished or retries the intent | Indeterminate | Failed; never completed |
| `ObservationUnretained` | Reports the admitted outcome. See its reasons below | Unretained | Not applicable |
| `RetainedObservation` | Returns its Coordinate | Retained | Completed |

**`ObservationUnretained` reasons.** `settlement-unacknowledged`, `settlement-refused` and
`settlement-unverified` may repeat `settle` with the identical outcome, or use
`recoverCoordinate`. `settlement-conflict` means custody already holds a different outcome,
and `evidence-too-large` and `evidence-undecodable` can never retain: none is worth repeating.

**`ObservationIndeterminate.cause`** is an `ObservationCustodyError` when custody itself
reached the verdict, so narrow it to read `code`. Otherwise it is the store's failure, and
`reconcile` applies. Reconciling does not fix these:

- `E_OBSERVATION_CUSTODY_CONTRADICTED`: a publication was reported that custody never
  permitted. This is a producer bug. Report it and alert; do not retry.
- `E_OBSERVATION_CUSTODY_UNVERIFIED`: settled evidence did not resolve, from
  `recoverCoordinate` or a read's `settle`. Retry, since a transient read reads the same. If
  it persists the evidence is gone, and the producer reports what it independently knows: a
  write it published is Unretained, and anything else stays Indeterminate.

**What `reconcile` returned.** It only completes storage, and it issues nothing.

- `reserved`, `prepared`: an uncertain arm has not landed so far. Call `prepare` again, then
  `authorizePublication`. Only a fresh `armed` permits.
- `armed`: the effect may have happened. Settle only what is established.
- `settled`: `recoverCoordinate`.
- `cancelled`: known unpublished.

**Refusals.** A refused admission holds no slot. Otherwise the attempt stays charged until a
successful `cancel`, which an armed attempt can never have.

- **Admission:** `capacity-full` needs another attempt cancelled or a larger limit, which
  this delivery cannot do, so do not loop on it. `preparation-unencodable` needs smaller
  bindings. `binding-conflict` means this id already holds other bindings: a producer bug.
- **Retry the step:** `contention`, `construction-contended`.
- **Inputs do not hold; `cancel`, and start a new attempt only once they do:**
  `basis-unavailable`, `basis-corrupt`, `writer-head-unavailable`, `dependency-unavailable`,
  `dependency-mismatch`, `construction-mismatch`, `support-unverified`.
- **Over a configured limit; `cancel`, or raise the limit:** `work-limit`, `support-limit`,
  `writer-limit`, `frontier-limit`, `dependency-limit`.
- **Over a fixed bound; `cancel` if unarmed, or settle a smaller core if armed:**
  `evidence-too-large`, `evidence-undecodable`.
- **Wrong state; `reconcile` and read the phase:** `not-reserved`, `not-prepared`,
  `not-settled`, `not-armed`, `already-armed`, `already-settled`, `irreversible`,
  `preparation-mismatch`.
- **Stopped:** `cancelled`, meaning a stop this service asked for, not a durable
  cancellation. `ObservationKnownUnpublished` is the durable one.
- **Settled otherwise:** `settlement-mismatch` means custody holds a different read outcome.
- **Configuration:** `policy-mismatch` comes from opening with a different capacity limit.

**Open before #1051 routes writes here.** Record slots are never released in this delivery,
so a graph's `limit` is its lifetime count of attempts that were not cancelled, reads
included. Every lost publication race also burns a slot. The default limit, what exhaustion
looks like to a user, and whether git-cas should allow raising a limit are undecided.
#1051 must settle them before custody carries real writes, and #1052 before it carries reads.

## Vocabulary

- **Support:** the Git objects an attempt retains. **Roots:** the physical edges that
  keep them: tree or blob supports, and commit parents.
- **Carrier:** a commit whose parents retain up to 63 writer heads and the previous
  carrier.
- **Preparation:** the attempt's canonical bindings and retained support. **Settlement**
  here is custody's final stage, unrelated to Strand settlement.
- **Page:** one custody evidence record, or one tree of dependency edges, by context.
- **Attempt:** one use of one reservation. **Armed:** the attempt holds its one publication
  permission, or once did. **Core:** the canonical receipt without its Coordinate.
  **Record:** what binds a core to its preparation and publication. **Binding:** the digest
  of the preparation, as opposed to `ObservationBindings`, the values it covers.
- **Coordinate, token:** the same thing, the opaque string a retained observation returns.

## Evidence

Validation evidence is in the PR, with the commit each run saw. Each guarantee has a
witness:

| Guarantee | Witness |
| --- | --- |
| Canonical identity, owned bytes, hostile tokens, unsupported versions, duplicate fields | `ObservationCustodyValues.test.ts`, `ObservationCustodyCborCodec.test.ts` |
| Admission at the cap, exact retry, conflicting reuse, policy mismatch, graph names a store namespace refuses | `ObservationCustody.integration.test.ts`, `ObservationCustody.recovery.integration.test.ts` |
| More than 64 observations, 129 writers, GC after ref removal, both hash formats | `ObservationCustody.integration.test.ts` |
| Every custody-port transition with its acknowledgement lost, a landed carrier with its acknowledgement lost, counted effects | `ObservationCustody.faults.integration.test.ts`, `ObservationSupportAdapter.integration.test.ts` |
| A Coordinate rebuilt after a restart, stranded reservations freed, a failed publication ended | `ObservationCustody.recovery.integration.test.ts` |
| Corrupt and missing evidence, on the writing store and a fresh one, and under lowered limits | `ObservationCustody.integration.test.ts`, `ObservationCustody.recovery.integration.test.ts`, `ObservationCustodyService.test.ts` |
| Bounded memory and work, with an eager-collection detector and over-budget controls | `ObservationSupportAdapter.integration.test.ts`, `ObservationCustodyAdapters.test.ts` |

Completion is executable evidence for these guarantees. A design commit, a draft
PR, dependency capability tests or a passing fake-port test alone is not completion
of #1067 or of the final Optics API. This delivery has no public export, and a
current-head independent review is reported in the PR with its actual scope.
