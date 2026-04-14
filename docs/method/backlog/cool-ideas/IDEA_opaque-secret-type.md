# Opaque SyncSecret type with redaction protection

A `SyncSecret` class with a private `#value` field and `toString()`/
`toJSON()` overrides that return `[REDACTED]`. Structurally prevents
secret leakage in logs, error messages, and serialization.

```ts
class SyncSecret {
  readonly #value: string;
  constructor(value: string) { this.#value = value; }
  unwrap(): string { return this.#value; }
  toString(): string { return '[REDACTED]'; }
  toJSON(): string { return '[REDACTED]'; }
  [Symbol.for('nodejs.util.inspect.custom')](): string { return '[REDACTED]'; }
}
```

Could generalize to `OpaqueValue<T>` for any sensitive data that
shouldn't leak through console.log, JSON.stringify, or template
literals.
