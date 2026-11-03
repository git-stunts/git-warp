# Shared observation identity and custody

Implementation contract for [#1067](https://github.com/git-stunts/git-warp/issues/1067),
under the [Optic contract](./optic-only-public-api.md), especially section 7.
This document specifies the private prerequisite. The service, its production
adapters and native witnesses exist in `src/domain/services/custody/` and
`src/infrastructure/adapters/`, but nothing composes or exports them yet: #1051 and
#1052 connect the producers. This is not a public Coordinate or a shipped release.

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
published, including that commit's parent against the bound predecessor. Custody
retains the commit it is given and checks only its writer and existence.
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
4. A private Coordinate codec encodes a versioned opaque locator for the original
   reservation together with the final observation-record digest. Both components
   are digests or injected opaque identifiers, never raw basis or writer parts.
   Syntax parsing does not prove existence, integrity or authority. The precise
   text grammar is fixed with adversarial fixtures before producer integration.
5. Resolution reads that reservation's original settlement, checks its binding,
   canonical record digest and core digest, then returns the exact original core
   bytes. No record, nonce or receipt is regenerated from today's graph.

This separates an addressable final record from a reservation that precedes it;
it avoids both self-referential hashing and inventing a successful receipt early.
A digest is not an entropy claim. Any profile requiring an unguessable locator
must use injected entropy/key material retained with the occurrence, and still
perform current access checks. Error and timing disclosure remain access-policy
concerns.

Runtime classes validate and freeze their invariants; byte owners copy inputs and
outputs. Named codec ports exchange validated domain values and explicit decode
failures. Raw shapes and CBOR/JSON handling remain at adapters. Use canonical
field order and version/domain separation rather than object insertion order;
reject unsupported versions, duplicate fields, alternate encodings and surplus
fields instead of normalizing corrupted records into an accepted identity.

## Durable state and publication permission

The production adapter uses `cas.reservations.open()` with an explicit namespace
and record-slot policy. Policy mismatch is a refusal, not a request to silently
open another namespace or increase capacity. The adapter maps CAS outcomes into
validated WARP result variants; core logic never branches on error messages.

| Durable observation | Permitted next action | Claim boundary |
| --- | --- | --- |
| Reservation admitted | Construct and retain original preparation evidence | Capacity exists; no publication or durable Coordinate claimed |
| Preparation acknowledged | Request the one-shot arm transition | Original support is retained; permission has not yet been issued |
| Fresh `armed` acknowledgement | Owning producer may perform its one publication attempt | This acknowledgement alone is publication permission |
| Recovered/already armed, or uncertain arm acknowledgement | Inspect/reconcile original evidence only | Never publish again; original effect may be in flight or have occurred |
| Publication established, settlement not acknowledged | Retain/reconcile the exact original result | Admitted but unretained, not an unapplied write |
| Settlement acknowledged and correspondence verified | Issue retained result and Coordinate | Original core and required roots are durable |
| Cancellation durably wins before arm | Stop owned work; report known-unpublished | A late arm must refuse; do not infer this from a timeout |
| Publication established, evidence too large to retain | Report the admitted outcome, unretained, with no Coordinate | The attempt keeps its slot; a charged effect is never reclaimed |
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

Cancellation must await owned work and use CAS's durable pre-arm cancellation
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
tree/blob edges or supported retained handles. WARP must verify the correspondence
between the declared support and actual edges before issuing success.

The upstream interfaces impose real per-call bounds: CAS publications allow 64
parents; reservation evidence allows 63 explicit parents and 64 support entries,
reserving the remaining commit parent for the original preparation. A basis with
more writers cannot be passed as an oversized parent array.

The history adapter reads writer heads from the frontier stored in the original
basis tree rather than accepting them from the producer, so an incomplete list cannot
pass as complete. Dependencies stay a producer stream, checked against a count and
digest bound into the preparation before any support is built. The adapter builds a carrier
chain through supported CAS publications, using at most 63 new writer heads plus
the previous carrier per commit. The final carrier is a reservation parent.
Dependency trees use bounded pages rather than an unbounded support array. The
iterator, each page and the overall operation have explicit work/byte/count limits.
Crossing a bound refuses before arm; it does not silently omit history or collect
the whole graph. The service runs resolve's exact verification before acknowledging
preparation, and again when recovering an unarmed preparation, so support it accepts
can be issued later under unchanged limits. Lowering limits cannot be undone for an
attempt already armed: it reports unverified rather than issuing a Coordinate. Verification walks carriers, dependency pages and the basis tree's
top-level entries under the same work bound. It does not walk the record trie or
writer ancestry, which their retained Git edges keep reachable. Existence is what it
proves for those objects: it decodes the frontier and checks digests of custody
pages, but does not rehash every retained blob. That remains `git fsck`'s job. The fixed 129-writer witness exercises at least three batches.

Construction refs are scoped to the admitted attempt, with compare-and-swap
publication and original-input/progress evidence. Recovery must validate that a
carrier belongs to this attempt and retains the claimed prefix; a readable head
alone is insufficient. Concurrent builders cannot silently adopt one another's
different inputs. A lost publication acknowledgement remains explicit until
verified. Cancellation and cleanup must quiesce owned builders and cannot delete
support another issued observation still requires. No lease-based reclamation or
automatic expiry is introduced.

Successful settlement roots keep the final record, original receipt core, original
preparation, basis, required history and dependencies reachable without disposable
memo/head refs. Repository destruction or storage loss remains outside ordinary
GC survival. There is no public release or expiry operation in this delivery.

## Implementation and evidence obligations

Keep one coherent PR for this private service. Its accepted prerequisites are the
integrated #1062 foundation, accepted #1049 contract and published git-cas 7.1.0.
#1066's native capability witness is useful evidence, not a code dependency.
Install the published dependency and update the lock; a local checkout substitution
does not establish adoption. New concepts have runtime constructors, injected
ports and explicit failure variants; no public export is added yet.

The following evidence is required before the PR is ready:

- Adversarial canonical identity, owned-byte, text-parser and unsupported-version
  fixtures; distinct preparations or core bytes cannot silently resolve as one
  record. There is no Coordinate field in the core digest input.
- Concurrent admission at the configured cap, exact retry, conflicting reuse and
  policy mismatch. Full-capacity refusal leaves every earlier token usable.
- Native SHA-1 and SHA-256 witnesses retaining more than 64 observations, including
  the oldest after close/reopen, disposable-ref removal and real Git GC. At least
  129 independent writer heads and required content/dependency objects survive.
- Fault and cancellation witnesses at every durable acknowledgement boundary,
  including lost arm/settlement acknowledgements, late publishers and storage-only
  reconciliation. Count effect invocations and prohibit implicit retries.
- Corrupt/missing preparation, final record, core, basis, history and dependency
  witnesses. Assert typed unavailable outcomes and no replacement publication.
- Bounded-memory/work witnesses with a source that detects eager collection and a
  positive over-budget control. Package and public-surface checks keep the service
  private; required Docker validation, coverage where applicable, SSJS and fresh
  current-head review are reported with their actual scope.

Completion is executable evidence for these guarantees. A design commit, a draft
PR, dependency capability tests or a passing fake-port test alone is not completion
of #1067 or of the final Optics API.
