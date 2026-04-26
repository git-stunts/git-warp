import CodecPort from '../../ports/CodecPort.ts';
import BoundaryTransitionRecordCodecPort, {
  type BoundaryTransitionRecordDecodeResult,
} from '../../ports/BoundaryTransitionRecordCodecPort.ts';
import BoundaryTransitionRecord from '../../domain/services/provenance/BTR.ts';
import BtrSigningEnvelope from '../../domain/services/provenance/BtrSigningEnvelope.ts';
import BtrSigningBytes from '../../domain/services/provenance/BtrSigningBytes.ts';
import MessageCodecError from '../../domain/errors/MessageCodecError.ts';
import VersionVector from '../../domain/crdt/VersionVector.ts';
import type { Dot } from '../../domain/crdt/Dot.ts';
import defaultCborCodec from '../codecs/CborCodec.ts';
import Patch from '../../domain/types/Patch.ts';
import type { OpV2 } from '../../domain/types/ops/unions.ts';
import { hydrateDecodedPatch } from '../../domain/services/PatchHydrator.ts';
import type { PatchEntry } from '../../domain/services/provenance/BoundaryTransitionProvenance.ts';
import type {
  BtrCanonicalPatch,
  BtrWireContext,
  BtrWireDot,
  BtrWireOperation,
  BtrWireProvenanceEntry,
} from './BtrWireProvenanceEntry.ts';
import type { BtrWireRecord, BtrWireSigningEnvelope } from './BtrWireRecord.ts';

const BTR_RECORD_LABEL = 'BoundaryTransitionRecord';

function decodeErrorReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readObject(value: unknown, label: string): object {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || value instanceof Uint8Array) {
    throw new MessageCodecError(`${label} must be an object`, {
      code: 'E_BTR_WIRE_INVALID_OBJECT',
    });
  }
  return value;
}

function readString(source: object, field: string, label: string): string {
  const value = Reflect.get(source, field);
  if (typeof value !== 'string') {
    throw new MessageCodecError(`${label}.${field} must be a string`, {
      code: 'E_BTR_WIRE_INVALID_STRING',
    });
  }
  return value;
}

function readNumber(source: object, field: string, label: string): number {
  const value = Reflect.get(source, field);
  if (typeof value !== 'number') {
    throw new MessageCodecError(`${label}.${field} must be a number`, {
      code: 'E_BTR_WIRE_INVALID_NUMBER',
    });
  }
  return value;
}

function readBytes(source: object, field: string, label: string): Uint8Array {
  const value = Reflect.get(source, field);
  if (!(value instanceof Uint8Array)) {
    throw new MessageCodecError(`${label}.${field} must be bytes`, {
      code: 'E_BTR_WIRE_INVALID_BYTES',
    });
  }
  return new Uint8Array(value);
}

function readProvenanceEntry(value: unknown, label: string): PatchEntry {
  const source = readObject(value, label);
  return {
    patch: hydrateDecodedPatch(Reflect.get(source, 'patch')),
    sha: readString(source, 'sha', label),
  };
}

function readProvenanceEntries(source: object, label: string): PatchEntry[] {
  const value = Reflect.get(source, 'P');
  if (!Array.isArray(value)) {
    throw new MessageCodecError(`${label}.P must be an array`, {
      code: 'E_BTR_WIRE_INVALID_PROVENANCE',
    });
  }
  return value.map((entry, index) => readProvenanceEntry(entry, `${label}.P[${String(index)}]`));
}

type DecodedBtrWireRecord = {
  readonly version: number;
  readonly h_in: string;
  readonly h_out: string;
  readonly U_0: Uint8Array;
  readonly P: readonly PatchEntry[];
  readonly t: string;
  readonly kappa: string;
};

function decodeBtrWireRecord(value: unknown): DecodedBtrWireRecord {
  const source = readObject(value, BTR_RECORD_LABEL);
  return {
    version: readNumber(source, 'version', BTR_RECORD_LABEL),
    h_in: readString(source, 'h_in', BTR_RECORD_LABEL),
    h_out: readString(source, 'h_out', BTR_RECORD_LABEL),
    U_0: readBytes(source, 'U_0', BTR_RECORD_LABEL),
    P: readProvenanceEntries(source, BTR_RECORD_LABEL),
    t: readString(source, 't', BTR_RECORD_LABEL),
    kappa: readString(source, 'kappa', BTR_RECORD_LABEL),
  };
}

function toBtrCanonicalContext(context: Patch['context']): BtrWireContext {
  const entries = context instanceof VersionVector
    ? [...context.entries()]
    : Object.entries(context);
  const canonicalContext: { [writerId: string]: number } = {};
  for (const [writerId, counter] of entries.sort(([left], [right]) => left.localeCompare(right))) {
    canonicalContext[writerId] = counter;
  }
  return canonicalContext;
}

function toBtrCanonicalDot(dot: Dot): BtrWireDot {
  return {
    writerId: dot.writerId,
    counter: dot.counter,
  };
}

function toBtrCanonicalOperation(op: OpV2): BtrWireOperation {
  switch (op.type) {
    case 'NodeAdd':
      return {
        type: op.type,
        node: op.node,
        dot: toBtrCanonicalDot(op.dot),
      };
    case 'NodeRemove':
      return {
        type: op.type,
        node: op.node,
        observedDots: [...op.observedDots].sort(),
      };
    case 'EdgeAdd':
      return {
        type: op.type,
        from: op.from,
        to: op.to,
        label: op.label,
        dot: toBtrCanonicalDot(op.dot),
      };
    case 'EdgeRemove':
      return {
        type: op.type,
        from: op.from,
        to: op.to,
        label: op.label,
        observedDots: [...op.observedDots].sort(),
      };
    case 'PropSet':
      return {
        type: op.type,
        node: op.node,
        key: op.key,
        value: op.value,
      };
    case 'NodePropSet':
      return {
        type: op.type,
        node: op.node,
        key: op.key,
        value: op.value,
      };
    case 'EdgePropSet':
      return {
        type: op.type,
        from: op.from,
        to: op.to,
        label: op.label,
        key: op.key,
        value: op.value,
      };
    case 'BlobValue':
      return {
        type: op.type,
        node: op.node,
        oid: op.oid,
      };
  }
}

function sortedStrings(values: readonly string[] | undefined): readonly string[] | undefined {
  return values === undefined ? undefined : [...values].sort();
}

function toBtrCanonicalPatch(patch: Patch): BtrCanonicalPatch {
  const reads = sortedStrings(patch.reads);
  const writes = sortedStrings(patch.writes);
  return {
    schema: patch.schema,
    writer: patch.writer,
    lamport: patch.lamport,
    context: toBtrCanonicalContext(patch.context),
    ops: patch.ops.map(toBtrCanonicalOperation),
    ...(reads === undefined ? {} : { reads }),
    ...(writes === undefined ? {} : { writes }),
  };
}

function toBtrWireProvenanceEntry(entry: PatchEntry): BtrWireProvenanceEntry {
  return {
    patch: toBtrCanonicalPatch(entry.patch),
    sha: entry.sha,
  };
}

function toBtrWireSigningEnvelope(envelope: BtrSigningEnvelope): BtrWireSigningEnvelope {
  return {
    version: envelope.version,
    h_in: envelope.h_in,
    h_out: envelope.h_out,
    U_0: envelope.U_0,
    P: envelope.P.map(toBtrWireProvenanceEntry),
    t: envelope.t,
  };
}

function toBtrWireRecord(record: BoundaryTransitionRecord): BtrWireRecord {
  return {
    ...toBtrWireSigningEnvelope(record.envelope),
    kappa: record.kappa,
  };
}

export default class BtrCodecAdapter extends BoundaryTransitionRecordCodecPort {
  readonly #codec: CodecPort;

  constructor(codec: CodecPort = defaultCborCodec) {
    super();
    this.#codec = codec;
  }

  override signingBytes(envelope: BtrSigningEnvelope): BtrSigningBytes {
    const bytes = this.#codec.encode<BtrWireSigningEnvelope>(toBtrWireSigningEnvelope(envelope));
    return BtrSigningBytes.fromCanonicalBtrSigningEncoder(bytes);
  }

  override encodeRecord(record: BoundaryTransitionRecord): Uint8Array {
    return this.#codec.encode<BtrWireRecord>(toBtrWireRecord(record));
  }

  override decodeRecord(bytes: Uint8Array): BoundaryTransitionRecordDecodeResult {
    try {
      const wire = decodeBtrWireRecord(this.#codec.decode(bytes));
      return {
        kind: 'decoded_boundary_transition_record',
        record: new BoundaryTransitionRecord({
          version: wire.version,
          h_in: wire.h_in,
          h_out: wire.h_out,
          U_0: wire.U_0,
          P: wire.P,
          t: wire.t,
          kappa: wire.kappa,
        }),
      };
    } catch (error) {
      return {
        kind: 'boundary_transition_record_decode_failed',
        reason: decodeErrorReason(error),
      };
    }
  }
}

export { BtrCodecAdapter };
