# Cycle 0005 Retro — Close All Audit REDs

## Outcome

**Not met.** Branch `refactor/close-audit-reds` abandoned before PR.
WorldlineSource implementation violated the Systems-Style manifesto
it was supposed to enforce. Human sponsor rejected at playback.

## What went wrong

### 1. Built a fake class hierarchy

`WorldlineSource` was implemented as a static-only factory class.
`LiveSource`, `CoordinateSource`, and `StrandSource` did not extend
it. `instanceof WorldlineSource` did not work. This defeats the
entire purpose of P7 (runtime dispatch over tag switching) — the
base type existed in name only.

### 2. No constructor validation

P2 requires constructors to establish invariants. The constructors
were bare property assignments — no validation of `strandId`,
`frontier`, or `ceiling`. A `StrandSource('')` would happily
construct. These are not value objects; they are property bags
wearing class costumes.

### 3. Kept the tag for "backward compatibility"

Added a `kind` property to each class "so tests don't break."
This is half-committed refactoring. If the migration is worth
doing, update the tests. Keeping both `instanceof` and `kind`
means neither is authoritative — exactly the "tooling fiction
mistaken for architecture" that Rule 0 warns against.

### 4. Contorted code to please tsc instead of writing honest runtime

When tsc complained about type mismatches, the response was to add
casts, bracket access, `Record<string, unknown>` parameters, and
JSDoc gymnastics. This is the opposite of Rule 0: the code was
shaped by the type checker's limitations, not by runtime truth.

### 5. Rushed execution, skipped RED

No failing tests were written before implementation. The cycle
loop requires RED before GREEN. The manifesto was read but not
followed — the implementation was a mechanical find-and-replace,
not a designed domain model.

## Root cause

Speed over correctness. The agent (Claude) moved too fast, treated
this as a mechanical refactor ("replace tag with instanceof") instead
of a domain modeling exercise. The Systems-Style manifesto is clear:
domain concepts need runtime-backed forms with validated invariants.
A class without validation is a typedef in disguise.

## What the redo needs

1. **Write failing tests first.** Tests that prove `instanceof`
   dispatch works, that constructors reject invalid input, that
   `clone()` produces independent copies.
2. **Real inheritance.** `LiveSource extends WorldlineSource`.
   `instanceof WorldlineSource` must work.
3. **Constructor validation.** `StrandSource` rejects empty
   `strandId`. `CoordinateSource` validates frontier shape.
4. **Update consumer tests.** Tests that check `.kind` should
   check `instanceof` instead. The tag is the codec's problem,
   not the domain's.
5. **Runtime first, types second.** Write the classes. Run the
   tests. Fix the types last. Do not let tsc drive the design.

## Backlog

Both items return to `asap/`:
- `NDNM_worldlinesource-subclass-hierarchy`
- `NDNM_defaultcodec-to-infrastructure`

## Cool ideas

None. This was a failure of discipline, not imagination.
