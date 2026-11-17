import z from 'zod';
import ConeRecordError from '../../domain/errors/ConeRecordError.ts';
import RetainedGraphError from '../../domain/errors/RetainedGraphError.ts';
import OrdinalBitmapBlock, { LIVENESS_INDEX } from '../../domain/retained/OrdinalBitmapBlock.ts';
import OrdinalChunk from '../../domain/retained/OrdinalChunk.ts';
import OrdinalSegment from '../../domain/retained/OrdinalSegment.ts';
import SelectionDirectoryEntry from '../../domain/retained/SelectionDirectoryEntry.ts';
import SelectionDirectoryPage from '../../domain/retained/SelectionDirectoryPage.ts';
import SelectionGeometry from '../../domain/retained/SelectionGeometry.ts';

const BITS_PER_BYTE = 8;
/** Bytes of a directory entry's block mask: 64 bits, least significant byte first. */
const MASK_BYTES = 8;

const BLOCK_WIRE = z.object({
  kind: z.literal('selection-block'), index: z.literal(LIVENESS_INDEX), set: z.enum(['node', 'edge']), writer: z.string(),
  segment: z.number(), chunk: z.number(), block: z.number(), members: z.instanceof(Uint8Array),
});
const DIRECTORY_WIRE = z.object({
  kind: z.literal('selection-directory'), index: z.literal(LIVENESS_INDEX), set: z.enum(['node', 'edge']), page: z.number(),
  chunks: z.array(z.tuple([z.string(), z.number(), z.number(), z.instanceof(Uint8Array)])),
});

type ChunkFields = { readonly kind: 'node' | 'edge'; readonly writerId: string; readonly segment: number; readonly index: number };

/**
 * The CBOR wire form of a selection record (#816, F1 decision): a block or a
 * directory page.
 *
 * A block's members are one canonical bitset of exactly `blockSpan / 8`
 * bytes, 128 in version 1: bit `i` of byte `floor(i / 8)`, least significant
 * bit first, is block offset `i`. One set of members always gives the same
 * bytes, and every block record has the same size. A directory entry is
 * `[writer, segment, chunk, mask]`, the mask 8 bytes, least significant byte
 * first. Only geometry version 1 is stored.
 */
export function encodeSelectionRecord(record: OrdinalBitmapBlock | SelectionDirectoryPage): object {
  return record instanceof OrdinalBitmapBlock ? encodeBlock(record) : encodeDirectoryPage(record);
}

/** The selection record a decoded CBOR value names, null when it is neither a block nor a directory page. */
export function decodeSelectionRecord(raw: unknown): OrdinalBitmapBlock | SelectionDirectoryPage | null {
  return decodeBlock(raw) ?? decodeDirectoryPage(raw);
}

function encodeBlock(block: OrdinalBitmapBlock): object {
  const { chunk } = block;
  requireStoredGeometry(chunk.geometry);
  const members = new Uint8Array(chunk.geometry.blockSpan / BITS_PER_BYTE);
  const bits = new DataView(members.buffer);
  for (const offset of block.offsets()) {
    bits.setUint8(offset >> 3, bits.getUint8(offset >> 3) | (1 << (offset & 7)));
  }
  return {
    kind: 'selection-block', index: block.index, set: chunk.segment.kind, writer: chunk.segment.writerId,
    segment: chunk.segment.index, chunk: chunk.index, block: block.block, members,
  };
}

function decodeBlock(raw: unknown): OrdinalBitmapBlock | null {
  const parsed = BLOCK_WIRE.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  const wire = parsed.data;
  const chunk = chunkOf({ kind: wire.set, writerId: wire.writer, segment: wire.segment, index: wire.chunk });
  return new OrdinalBitmapBlock({ index: wire.index, chunk, block: wire.block, offsets: offsetsOf(wire.members, chunk.geometry) });
}

/** The set bits of a block bitset, refusing any length but exactly one block's bits. */
function offsetsOf(members: Uint8Array, geometry: SelectionGeometry): number[] {
  if (members.byteLength * BITS_PER_BYTE !== geometry.blockSpan) {
    throw new ConeRecordError('A selection block bitset must hold exactly one block of bits', {
      code: 'E_CONE_RECORD_CORRUPT', context: { bytes: members.byteLength, blockSpan: geometry.blockSpan },
    });
  }
  const offsets: number[] = [];
  members.forEach((byte, position) => {
    for (let bit = 0; bit < BITS_PER_BYTE; bit += 1) {
      if ((byte >> bit) & 1) {
        offsets.push(position * BITS_PER_BYTE + bit);
      }
    }
  });
  return offsets;
}

function encodeDirectoryPage(page: SelectionDirectoryPage): object {
  const chunks = page.entries.map((entry) => {
    requireStoredGeometry(entry.chunk.geometry);
    return [entry.chunk.segment.writerId, entry.chunk.segment.index, entry.chunk.index, maskBytes(entry.liveBlocks)];
  });
  return { kind: 'selection-directory', index: page.index, set: page.set, page: page.pageIndex, chunks };
}

function decodeDirectoryPage(raw: unknown): SelectionDirectoryPage | null {
  const parsed = DIRECTORY_WIRE.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  const wire = parsed.data;
  const entries = wire.chunks.map(([writerId, segment, index, mask]) =>
    new SelectionDirectoryEntry({ chunk: chunkOf({ kind: wire.set, writerId, segment, index }), liveBlocks: maskOf(mask) }));
  return new SelectionDirectoryPage({ index: wire.index, set: wire.set, pageIndex: wire.page, entries });
}

function maskBytes(mask: bigint): Uint8Array {
  return Uint8Array.from({ length: MASK_BYTES }, (_unused, position) => Number((mask >> BigInt(position * BITS_PER_BYTE)) & 0xffn));
}

function maskOf(bytes: Uint8Array): bigint {
  if (bytes.byteLength !== MASK_BYTES) {
    throw new ConeRecordError('A selection directory mask must be 8 bytes', { code: 'E_CONE_RECORD_CORRUPT', context: { bytes: bytes.byteLength } });
  }
  return bytes.reduceRight((mask, byte) => (mask << BigInt(BITS_PER_BYTE)) | BigInt(byte), 0n);
}

function chunkOf(fields: ChunkFields): OrdinalChunk {
  const segment = new OrdinalSegment({ kind: fields.kind, writerId: fields.writerId, index: fields.segment });
  return new OrdinalChunk({ segment, index: fields.index, geometry: SelectionGeometry.chunks() });
}

function requireStoredGeometry(geometry: SelectionGeometry): void {
  if (!geometry.equals(SelectionGeometry.chunks())) {
    throw new RetainedGraphError('The record layout stores selection records of geometry version 1 only', 'E_RETAINED_GEOMETRY_UNSUPPORTED', {
      context: { geometry: geometry.identity() },
    });
  }
}
