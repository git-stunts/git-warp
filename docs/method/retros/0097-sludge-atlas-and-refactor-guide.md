# 0097 Sludge Atlas And Refactor Guide Retrospective

- Outcome: `hill met`
- Cycle doc: [docs/design/0097-sludge-atlas-and-refactor-guide.md](../../design/0097-sludge-atlas-and-refactor-guide.md)
- Release lane: `v17.0.0`

## Outcome

0097 succeeded as process infrastructure. It did not repair production
sludge. It made the sludge map executable and gave future repair cycles
dependency ordering.

The cycle created:

- `docs/design/0097-sludge-atlas-and-refactor-guide.md`
- `docs/method/refactoring-guides/anti-sludge-refactoring-guide.md`
- `policy/sludge/sludge-map.json`
- `test/conformance/sludgeAtlas.test.ts`

## What Went Well

The cycle recovered from the 0096 whac-a-cast failure mode without
touching production code. The atlas now records root causes instead of
just symptoms, and the conformance test prevents proposed nouns from
being decorative architecture.

The strongest process improvement is the noun-proof requirement. Every
proposed noun must state who constructs it, who consumes it, what
invariant it proves, which layer owns it, and which cast, boundary leak,
object bag, or default behavior bug it eliminates.

## What Went Wrong

The need for this cycle came from trying to green 0096 before the
underlying architecture had been classified. That attempt exposed that
some casts were not local TypeScript problems. They were missing nouns,
boundary leaks, canonical byte gaps, and capability-modeling failures.

The sludge map still has weak spots. It has no formal schema, and some
layer labels need architecture review before implementation work starts.

## What Changed From Original Plan

The original PULL goal was a doctrine/map artifact. RED strengthened
that goal by requiring an executable conformance test. GREEN then had to
prove each proposed noun was an actual architectural concept rather than
a name.

This was beneficial drift. The final result is stronger than a static
guide because future agents can run the test.

## What This Cycle Proved

The cycle proved that:

- 0096 should remain blocked until root-cause nouns and boundaries exist.
- The remaining cast purge work can be classified by sludge family.
- A sludge atlas can be machine-checked.
- Proposed nouns can be forced to prove ownership, invariants, and
  eliminated sludge before implementation begins.
- The repair order should be dependency order, not grep order.

## What This Cycle Did Not Prove

The cycle did not prove that any production sludge is fixed. It did not
prove that the proposed nouns are the final implementation names. It did
not prove that `policy` is an accepted architecture layer. It did not
prove that `BtrSigningBytes` belongs in `ports`.

Those questions are intentionally left for focused follow-up cycles.

## Why 0096 Remains Blocked

`0096-purge-cast-hacks` remains blocked because some casts are symptoms
of missing architecture:

- BTR/provenance needs canonical byte ownership and domain nouns.
- BTR wire encode/decode needs boundary ownership.
- Property index reading needs honest shard/capability modeling.
- Immutable snapshot construction needs a real snapshot noun/protocol.
- Snapshot defaults need explicit policy and retention nouns.

Removing casts before that work exists would hide the missing runtime
facts behind cleaner-looking sludge.

## Follow-Up Backlog Items Created

- `SLUDGE_map-json-schema`
- `ARCH_policy-layer-label-decision`
- `PROV_btr-signing-bytes-layer-ownership`
- `ARCH_agent-source-change-guard-for-doc-only-cycles`

## Recommendation For Next Implementation Cycle

Pull `PROV_btr-signing-bytes-layer-ownership` before implementing
BTR/provenance fixes.

Reason: before removing BTR casts or moving provenance code, the project
must settle canonical byte ownership. If `BtrSigningBytes` lands in the
wrong layer, the next implementation cycle will create fresh sludge
while trying to remove old sludge.

Alternative acceptable next work is a canonical-byte-noun design cycle,
but do not resume `0096-purge-cast-hacks` yet.

