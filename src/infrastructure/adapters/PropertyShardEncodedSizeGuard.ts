import { Buffer } from 'node:buffer';
import type { PropertyShard } from '../../domain/artifacts/PropertyShard.ts';
import IndexError from '../../domain/errors/IndexError.ts';

class PropertyPayloadLowerBound {
  readonly #maximum: number;
  readonly #seen = new WeakSet<object>();
  #consumed = 0;

  constructor(maximum: number) {
    this.#maximum = maximum;
  }

  get consumed(): number {
    return this.#consumed;
  }

  get exceeded(): boolean {
    return this.#consumed > this.#maximum;
  }

  consume(value: unknown): void {
    if (this.exceeded) {
      return;
    }
    if (typeof value === 'string') {
      this.#consumeBytes(Buffer.byteLength(value, 'utf8') + 1);
      return;
    }
    if (value instanceof Uint8Array) {
      this.#consumeBytes(value.byteLength + 1);
      return;
    }
    if (Array.isArray(value)) {
      this.#consumeArray(value);
      return;
    }
    this.#consumeObjectOrScalar(value);
  }

  #consumeObjectOrScalar(value: unknown): void {
    if (value !== null && typeof value === 'object') {
      this.#consumeRecord(value);
      return;
    }
    this.#consumeBytes(1);
  }

  #consumeArray(value: readonly unknown[]): void {
    this.#enter(value);
    this.#consumeBytes(1);
    for (const entry of value) {
      this.consume(entry);
    }
    this.#seen.delete(value);
  }

  #consumeRecord(value: object): void {
    this.#enter(value);
    this.#consumeBytes(1);
    for (const [key, entry] of Object.entries(value)) {
      this.consume(key);
      this.consume(entry);
    }
    this.#seen.delete(value);
  }

  #enter(value: object): void {
    if (this.#seen.has(value)) {
      throw new IndexError('Property shard contains a cyclic value', {
        code: 'E_INDEX_SHARD_SCHEMA',
      });
    }
    this.#seen.add(value);
  }

  #consumeBytes(count: number): void {
    this.#consumed += count;
  }
}

/** Rejects definitely oversized property payloads before the CBOR encoder allocates output. */
export function requirePropertyShardEncodedSize(
  shard: PropertyShard,
  path: string,
  maximum: number,
): void {
  const counter = new PropertyPayloadLowerBound(maximum);
  counter.consume(shard.schemaVersion === 1
    ? shard.entries
    : { schemaVersion: shard.schemaVersion, entries: shard.entries });
  if (counter.exceeded) {
    throw new IndexError(`Index shard exceeds the configured maximum: ${path}`, {
      code: 'E_INDEX_SHARD_TOO_LARGE',
      context: { path, lowerBound: counter.consumed, maximum },
    });
  }
}
