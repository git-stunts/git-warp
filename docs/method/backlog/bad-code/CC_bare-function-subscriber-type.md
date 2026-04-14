# Subscriber type uses bare `Function` instead of typed callback

**Effort:** S

## What's Wrong

`WarpRuntime.ts:88-91` defines the `Subscriber` type using bare
`Function`. This bypasses TypeScript's type system entirely — callers
can pass any function shape and the compiler won't catch arity or
argument type mismatches.

## Suggested Fix

Replace `Function` with a specific callback signature:
```ts
type Subscriber = (event: MaterializationEvent) => void;
```
Or whatever the actual event shape is. This gives callers and the
runtime compile-time safety on the subscription contract.
