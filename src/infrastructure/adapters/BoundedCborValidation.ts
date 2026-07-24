import IndexError from '../../domain/errors/IndexError.ts';

export type CborStructureLimits = Readonly<{
  maxContainerEntries: number;
  maxDepth: number;
  maxItems: number;
}>;

export type CborValidationErrorFactory = (reason: string) => Error;
type CborMapKeyPolicy = 'any' | 'unique-text';
type CborStructureReaderOptions = {
  readonly bytes: Uint8Array;
  readonly limits: CborStructureLimits;
  readonly mapKeyPolicy: CborMapKeyPolicy;
  readonly malformed: CborValidationErrorFactory;
};

const ARGUMENT_WIDTHS = new Map<number, number>([
  [24, 1],
  [25, 2],
  [26, 4],
  [27, 8],
]);
const STRICT_UTF8 = new TextDecoder('utf-8', { fatal: true });

class CborStructureReader {
  readonly #bytes: Uint8Array;
  readonly #limits: CborStructureLimits;
  readonly #mapKeyPolicy: CborMapKeyPolicy;
  readonly #malformed: CborValidationErrorFactory;
  #offset = 0;
  #items = 0;

  constructor(options: CborStructureReaderOptions) {
    this.#bytes = options.bytes;
    this.#limits = options.limits;
    this.#mapKeyPolicy = options.mapKeyPolicy;
    this.#malformed = options.malformed;
  }

  readDocument(): void {
    this.#readItem(0);
    if (this.#offset !== this.#bytes.byteLength) {
      throw this.#malformed('trailing bytes after the top-level value');
    }
  }

  #readItem(depth: number): void {
    this.#requireItemBudget(depth);
    const initial = this.#readByte();
    const major = initial >>> 5;
    const additional = initial & 0x1f;
    if (major === 7) {
      this.#readSimple(additional);
      return;
    }
    const argument = this.#readArgument(additional);
    this.#readMajorValue(major, argument, depth);
  }

  #requireItemBudget(depth: number): void {
    if (depth > this.#limits.maxDepth) {
      throw this.#malformed('nesting depth exceeds the configured maximum');
    }
    this.#items += 1;
    if (this.#items > this.#limits.maxItems) {
      throw this.#malformed('decoded item count exceeds the configured maximum');
    }
  }

  #readMajorValue(major: number, argument: bigint, depth: number): void {
    if (major <= 1) {
      return;
    }
    if (major <= 3) {
      this.#skip(this.#toLength(argument));
      return;
    }
    if (major <= 5) {
      this.#readContainer(major, this.#toLength(argument), depth);
      return;
    }
    if (major === 6) {
      this.#readItem(depth + 1);
      return;
    }
    throw this.#malformed('unsupported major type');
  }

  #readContainer(major: number, length: number, depth: number): void {
    if (length > this.#limits.maxContainerEntries) {
      throw this.#malformed('container entry count exceeds the configured maximum');
    }
    if (major === 4) {
      this.#readItems(length, depth);
      return;
    }
    this.#readMapEntries(length, depth);
  }

  #readMapEntries(length: number, depth: number): void {
    if (this.#mapKeyPolicy === 'any') {
      this.#readGenericMapEntries(length, depth);
      return;
    }
    this.#readUniqueTextMapEntries(length, depth);
  }

  #readGenericMapEntries(length: number, depth: number): void {
    for (let index = 0; index < length; index += 1) {
      this.#readItem(depth + 1);
      this.#readItem(depth + 1);
    }
  }

  #readUniqueTextMapEntries(length: number, depth: number): void {
    const decodedKeys = new Set<string>();
    for (let index = 0; index < length; index += 1) {
      const keyStart = this.#offset;
      const initial = this.#bytes[keyStart];
      if (initial === undefined) {
        throw this.#malformed('value is truncated');
      }
      if (initial >>> 5 !== 3) {
        throw this.#malformed('map key must be a UTF-8 text string');
      }
      this.#readItem(depth + 1);
      const payloadStart = keyStart + encodedHeaderWidth(initial);
      const decodedKey = this.#decodeTextKey(payloadStart, this.#offset);
      if (decodedKeys.has(decodedKey)) {
        throw this.#malformed('map contains a duplicate text key');
      }
      decodedKeys.add(decodedKey);
      this.#readItem(depth + 1);
    }
  }

  #readItems(length: number, depth: number): void {
    for (let index = 0; index < length; index += 1) {
      this.#readItem(depth + 1);
    }
  }

  #readSimple(additional: number): void {
    if (additional < 24) {
      return;
    }
    const width = ARGUMENT_WIDTHS.get(additional);
    if (width === undefined) {
      throw this.#malformed('reserved or break simple value is not supported');
    }
    this.#skip(width);
  }

  #readArgument(additional: number): bigint {
    if (additional === 0x1f) {
      throw this.#malformed('indefinite-length values are not supported');
    }
    if (additional < 24) {
      return BigInt(additional);
    }
    const width = ARGUMENT_WIDTHS.get(additional);
    if (width === undefined) {
      throw this.#malformed('reserved additional information');
    }
    return this.#readUnsigned(width);
  }

  #readUnsigned(width: number): bigint {
    let value = 0n;
    for (let index = 0; index < width; index += 1) {
      value = (value << 8n) | BigInt(this.#readByte());
    }
    return value;
  }

  #toLength(value: bigint): number {
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw this.#malformed('declared length exceeds the safe integer range');
    }
    return Number(value);
  }

  #readByte(): number {
    const value = this.#bytes[this.#offset];
    if (value === undefined) {
      throw this.#malformed('value is truncated');
    }
    this.#offset += 1;
    return value;
  }

  #skip(length: number): void {
    if (length > this.#bytes.byteLength - this.#offset) {
      throw this.#malformed('value is truncated');
    }
    this.#offset += length;
  }

  #decodeTextKey(start: number, end: number): string {
    try {
      return STRICT_UTF8.decode(this.#bytes.subarray(start, end));
    } catch {
      throw this.#malformed('map contains an invalid UTF-8 text key');
    }
  }
}

/** Rejects dangerous CBOR structure declarations before the general decoder allocates them. */
export function validateBoundedCbor(
  bytes: Uint8Array,
  limits: CborStructureLimits,
  malformed: CborValidationErrorFactory = malformedCbor,
): void {
  new CborStructureReader({
    bytes,
    limits,
    malformed,
    mapKeyPolicy: 'unique-text',
  }).readDocument();
}

/** Validates generic CBOR structure without narrowing the format's map-key algebra. */
export function validateGenericBoundedCbor(
  bytes: Uint8Array,
  limits: CborStructureLimits,
  malformed: CborValidationErrorFactory,
): void {
  new CborStructureReader({
    bytes,
    limits,
    malformed,
    mapKeyPolicy: 'any',
  }).readDocument();
}

function encodedHeaderWidth(initial: number): number {
  const additional = initial & 0x1f;
  if (additional < 24) {
    return 1;
  }
  return 1 + (ARGUMENT_WIDTHS.get(additional) ?? 0);
}

function malformedCbor(reason: string): IndexError {
  return new IndexError(`Index shard CBOR is malformed: ${reason}`, {
    code: 'E_INDEX_SHARD_MALFORMED',
    context: { reason },
  });
}
