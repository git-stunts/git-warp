# `lwwMax` returns `LWWRegister<T> | null` — awkward null in the happy path

**Effort:** S

## What's wrong

```ts
// src/domain/crdt/LWW.ts
export function lwwMax<T>(
  a: LWWRegister<T> | null | undefined,
  b: LWWRegister<T> | null | undefined,
): LWWRegister<T> | null
```

The return type is nullable because the function returns `null` when
**both** inputs are null/undefined. Every caller has to null-check:

```ts
// OpStrategies.ts / WarpStateV5.ts
const winner = lwwMax(current, lwwSet(eventId, value));
if (winner !== null) {
  state.prop.set(propKey, winner);
}
```

But in this call site, `lwwSet(eventId, value)` is guaranteed to return
a non-null `LWWRegister`, so the `winner` CAN'T be null in practice.
The check is dead code.

## Why it's awkward

- Callers at LWW-join sites (two possibly-missing registers) do need
  the null handling. Callers at "set and merge" sites never do.
- The null case is the "merge of nothing" case, which semantically
  should return nothing — but the caller usually doesn't want a
  register at all in that case, they want the merge to be a no-op.
- The type muddies the happy path for the common case.

## Suggested fix

Split into two functions:
- `lwwMaxNullable(a, b)` — current behavior, used at true LWW-join sites
  (prop map merges during state join)
- `lwwMaxOrThrow(a, b)` — asserts at least one is non-null; used at
  "set and merge" sites

Alternatively, define `lwwMax` as taking at least one non-nullable:
```ts
function lwwMax<T>(a: LWWRegister<T>, b: LWWRegister<T> | null | undefined): LWWRegister<T>
function lwwMax<T>(a: LWWRegister<T> | null | undefined, b: LWWRegister<T>): LWWRegister<T>
function lwwMax<T>(a: LWWRegister<T> | null | undefined, b: LWWRegister<T> | null | undefined): LWWRegister<T> | null
```

TypeScript overload resolution would pick the non-nullable signature
when one side is known.

## Severity

LOW. Not bug-inducing, but pollutes every caller with a dead null check
that obscures intent.
