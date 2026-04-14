# Design 0017: The Admission Kernel

## The Gap

Paper VII identifies WARP's architectural center as:

> A recursive, witnessed admission architecture over bounded
> frontier-relative causal sites.

The admission kernel is:

```
Admit_Pi(F*, C, chi) = (R, W)
Pack(R, W) = theta
```

git-warp does not have this. It has a CRDT graph database with
provenance mechanisms that Paper VII *describes* but does not yet
*organize*. The mechanisms are real — frontier-relative
materialization, strands, braids, BTRs, conflict analysis, trust
evaluation — but they are not structured around an explicit admission
act.

This design proposes making the admission kernel a first-class runtime
abstraction, and then showing how the existing mechanisms become
instances of it at each scale.

## What "admission" means in code

Today, `JoinReducer.applyFast()` takes a state and a patch and returns
a new state. This is **application**, not **admission**. The
distinction:

| | Application (today) | Admission (Paper VII) |
|---|---|---|
| Input | state + ops | frontier + claims + site + policy |
| Output | new state | outcome + witness |
| Blocked ops | silently dropped | surfaced as Obstruction |
| Conflicts | merged by LWW | Conflict or Plural (lawful outcomes) |
| Witness | TickReceipt (what happened) | Witness (WHY it was lawful) |
| Policy | implicit (CRDT rules) | explicit (governing law) |

The admission kernel makes the policy, the site, and the witness
explicit. It doesn't replace the CRDT — it wraps it. The CRDT is the
default local-tick policy. Other policies govern braid collapse and
distributed suffix admission.

## The kernel

```typescript
interface AdmissionKernel<C, R> {
  admit(
    frontier: Frontier,
    claims: C,
    site: BoundedSite,
    policy: AdmissionPolicy,
  ): AdmissionResult<R>;
}

interface AdmissionResult<R> {
  outcome: Outcome<R>;
  witness: WitnessCore;
}

type Outcome<R> =
  | { kind: 'derived'; value: R }
  | { kind: 'plural'; claims: R[] }
  | { kind: 'conflict'; artifact: ConflictArtifact }
  | { kind: 'obstruction'; reason: ObstructionReason };

interface WitnessCore {
  /** Why this outcome is lawful under the governing policy. */
  justification: Justification;
  /** The site over which admission was judged. */
  site: BoundedSite;
  /** The policy that governed the admission. */
  policyId: string;
}

function pack<R>(result: AdmissionResult<R>): Shell {
  // Serialize the outcome + witness into a replay/audit artifact
  return new BoundaryTransitionRecord(result);
}
```

## Bounded sites

Paper VII's `chi` (bounded site) is the piece git-warp is missing
most acutely. Today, JoinReducer applies ops globally. The admission
kernel needs:

```typescript
interface BoundedSite {
  /** The subject of the claim. */
  subject: SiteSubject;
  /** Read boundary required to justify the claim. */
  readBoundary: ReadonlySet<string>;
  /** Directly written region. */
  writeBoundary: ReadonlySet<string>;
  /** Semantically affected region (beyond direct writes). */
  affectedRegion: ReadonlySet<string>;
  /** Reintegration boundary (what must be checked on merge-back). */
  reintegrationBoundary: ReadonlySet<string>;
}
```

The runtime spec (§3) defines:

```
chi = (S_subj, R_read, W_write, E_aff, B_re)
```

This is not abstract. Each patch op has a natural site:
- `NodeAdd('user:alice')` → subject is `user:alice`, write boundary
  is `{user:alice}`, read boundary is empty.
- `EdgeAdd('user:alice', 'user:bob', 'follows')` → subject is the
  edge triple, write boundary includes both endpoints.
- `PropSet('user:alice', 'name', 'Alice')` → subject is the
  property, read boundary includes the node.

The site computation is deterministic from the op. A
`closeSite(state, rawFocus)` function expands a raw focus to the
least semantically closed site.

## Three instantiations

### Scale 1: Local tick admission

```typescript
class LocalTickAdmission implements AdmissionKernel<PatchOp[], WarpState> {
  admit(frontier, ops, site, policy) {
    // For each op, check site exclusivity under policy
    // Admitted ops → apply via JoinReducer
    // Blocked ops → Obstruction with witness
    // Result: new state + per-op admission witness
  }
}
```

The default policy is the CRDT coexistence law: LWW for properties,
OR-Set for membership, causal ordering for timestamps. This is what
JoinReducer already does — but wrapped in admission vocabulary with
an explicit witness of what was admitted and why.

### Scale 2: Braid-local admission (collapse)

```typescript
class BraidAdmission implements AdmissionKernel<BraidView, DerivedLane> {
  admit(frontier, braid, refinedSite, collapsePolicy) {
    // Cell-by-cell over the refined site partition:
    // 1. Single-claim cells → carry forward
    // 2. Joinable cells → derive joined result
    // 3. Irreducible plurality → Plural outcome
    // 4. Conflict → ConflictArtifact with witness
    // 5. Legality failure → Obstruction
  }
}
```

This is `collapseBraid()` from the runtime spec §12. The key
difference from today's `analyzeConflicts()`: it *derives* a result,
not just *detects* problems.

### Scale 3: Distributed suffix admission

```typescript
class SuffixAdmission implements AdmissionKernel<TransportedSuffix, WarpState> {
  admit(frontier, suffix, importSite, transportPolicy) {
    // 1. Transport: normalize remote suffix to common basis
    // 2. Validate: check suffix lawfulness at local frontier
    // 3. Admit: apply validated suffix under policy
    // 4. Witness: record WHY the import was lawful
  }
}
```

Today's `syncWith()` applies remote patches directly. The admission
kernel adds the transport normalization step (Paper VII §4.3) and
the witness of import lawfulness.

## Outcome types as runtime classes

Per SSTS, these must be runtime-backed:

```typescript
class Derived<R> {
  readonly kind = 'derived' as const;
  constructor(readonly value: R, readonly witness: WitnessCore) {
    Object.freeze(this);
  }
}

class Plural<R> {
  readonly kind = 'plural' as const;
  constructor(readonly claims: ReadonlyArray<R>, readonly witness: WitnessCore) {
    Object.freeze(this);
  }
}

class Conflict {
  readonly kind = 'conflict' as const;
  constructor(readonly artifact: ConflictArtifact, readonly witness: WitnessCore) {
    Object.freeze(this);
  }
}

class Obstruction {
  readonly kind = 'obstruction' as const;
  constructor(readonly reason: ObstructionReason, readonly witness: WitnessCore) {
    Object.freeze(this);
  }
}
```

Dispatch is by `instanceof`, not by tag switching. Behavior lives on
the type. This is SSTS P3/P7.

## Observer collapse vs canonical collapse

Paper VII §4.2 and the runtime spec §13 require this distinction:

- **Observer collapse**: A projection fact. What an observer sees when
  multiple braid claims are indistinguishable under their aperture.
  Not an admission act.

- **Canonical collapse**: An admission and derivation fact. The system
  decided that a derived lane is the lawful result. This IS an
  admission act.

The implementation must never conflate them:

```typescript
// Observer collapse — projection, not admission
function observerCollapse(braid: BraidView, aperture: Aperture): ProjectedView {
  // Lossy projection. No witness. No governance.
}

// Canonical collapse — admission with witness
function canonicalCollapse(braid: BraidView, policy: CollapsePolicy): AdmissionResult<DerivedLane> {
  // Full admission. Witness required. Governance enforced.
}
```

## Migration path

The admission kernel does not replace the existing code. It wraps it.

### Phase 1: Outcome types + collapse

Ship `Derived`, `Plural`, `Conflict`, `Obstruction` as runtime
classes. Implement `collapseBraid()` using them. This gives Graft
what it needs without touching JoinReducer.

### Phase 2: Admission wrapper for JoinReducer

Wrap `JoinReducer.applyFast()` in a `LocalTickAdmission` that
computes sites, checks policy, and produces witnesses. The reducer
is unchanged — admission sits above it.

### Phase 3: Transport normalization for sync

Add a common-basis normalization step before `applySyncResponse()`.
Remote suffixes become `TransportedSuffix` objects that carry
provenance of their transport path.

### Phase 4: Policy objects

Extract the implicit policies (CRDT coexistence, trust evaluation,
GC thresholds) into explicit `AdmissionPolicy` objects. Each policy
is a named, versioned, inspectable runtime object.

### Phase 5: Witness enrichment

Enrich TickReceipt and BTR to carry full witnesses — not just what
happened, but why it was lawful under the governing policy.

### Phase 6: Upper stack (trust + privacy)

Property certificates, reliance status lifecycle, observer rights
lattice, aperture decay. These are the Paper VII §5-§7 contributions
and can be developed once the kernel is stable.

## Relation to openWarpGraph()

The admission kernel maps to the capability surface:

```
commitment.patches  → LocalTickAdmission
commitment.strands  → strand lifecycle (input to braids)
commitment.comparison → BraidAdmission (collapse)
governance.sync     → SuffixAdmission (transport + import)
folding.checkpoint  → history folding (post-admission)
folding.materialize → frontier-relative view (post-admission)
revelation.query    → observer reads (post-admission)
revelation.provenance → witness access
```

The factory (`openWarpGraph()`) wires the admission kernel into each
capability. When the kernel lands, the factory becomes the composition
root for an admission architecture — not just a bag of methods.

## What this changes about git-warp's identity

Today: git-warp is a multi-writer graph database stored on Git.

After: git-warp is a recursive witnessed admission architecture
whose storage substrate happens to be Git.

The database doesn't go away. It gets a soul.

## Open questions

1. **Granularity of sites**: Should sites be per-op, per-patch, or
   per-entity? The runtime spec says per-op with semantic closure.
   Is that practical at scale?

2. **Policy versioning**: If policies are versioned runtime objects,
   how do older policies interact with newer state? Schema migration
   for policies?

3. **Witness size**: Full witnesses for every admission could be
   large. Should witnesses be content-addressed and stored in
   git-cas, with only a reference in the receipt?

4. **Performance**: Site computation for every op adds overhead.
   Can sites be lazily computed or cached per-patch?

5. **Backward compatibility**: How do existing graphs (pre-admission-
   kernel) interact with the new kernel? Are old patches retroactively
   "admitted" with a default policy?

6. **The plurality question**: When collapse returns `Plural`, what
   does the consumer DO with it? The paper says plurality is lawful,
   but the UX of plurality needs design.
