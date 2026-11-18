import { decode as cborDecode } from 'cbor-x';

import MessageCodecError from '../../src/domain/errors/MessageCodecError.ts';
import {
  validateGenericBoundedCbor,
  type CborStructureLimits,
} from '../../src/infrastructure/adapters/BoundedCborValidation.ts';
import defaultCodec from '../../src/infrastructure/codecs/CborCodec.ts';
import CodecPort, { type CodecDecodeBound } from '../../src/ports/CodecPort.ts';

export const V18_CHECKPOINT_MAX_DECODE_BYTES = 64 * 1024 * 1024;

const V18_CHECKPOINT_STRUCTURE_LIMITS: CborStructureLimits = Object.freeze({
  maxContainerEntries: 4_000_000,
  maxDepth: 32,
  maxItems: 20_000_000,
});

/** Migration-only decoder for monolithic v18 checkpoint state artifacts. */
export class V18CheckpointMigrationCodec extends CodecPort {
  readonly #maxDecodeBytes: number;

  constructor(options: Readonly<{
    maxDecodeBytes?: number;
  }> = {}) {
    super();
    this.#maxDecodeBytes = options.maxDecodeBytes ?? V18_CHECKPOINT_MAX_DECODE_BYTES;
    if (!Number.isSafeInteger(this.#maxDecodeBytes) || this.#maxDecodeBytes <= 0) {
      throw new TypeError('v18 checkpoint maxDecodeBytes must be a positive safe integer');
    }
  }

  override encode<TEncoded = unknown>(data: TEncoded): Uint8Array {
    return defaultCodec.encode(data);
  }

  override decode<TDecoded = unknown>(buffer: Uint8Array): TDecoded {
    return this.decodeWithin<TDecoded>(buffer, {
      maxBytes: this.#maxDecodeBytes,
      structureLimits: V18_CHECKPOINT_STRUCTURE_LIMITS,
    });
  }

  /** Decodes under an explicit bound in place of the migration bound. */
  override decodeWithin<TDecoded = unknown>(buffer: Uint8Array, bound: CodecDecodeBound): TDecoded {
    if (buffer.byteLength > bound.maxBytes) {
      throw decodeError(
        `encoded byte length ${String(buffer.byteLength)} exceeds migration limit `
          + String(bound.maxBytes),
      );
    }
    validateGenericBoundedCbor(buffer, bound.structureLimits, decodeError);
    return cborDecode(buffer) as TDecoded;
  }
}

function decodeError(reason: string): MessageCodecError {
  return new MessageCodecError(`v18 checkpoint CBOR decode rejected: ${reason}`, {
    code: 'E_V18_CHECKPOINT_CBOR_BOUNDS',
    context: { reason },
  });
}

export default new V18CheckpointMigrationCodec();
