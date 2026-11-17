import z from 'zod';
import RetainedGraphError from '../../domain/errors/RetainedGraphError.ts';
import RoaringShardRejectedError from '../../domain/errors/RoaringShardRejectedError.ts';
import OrdinalBitmapShard, { LIVENESS_INDEX } from '../../domain/retained/OrdinalBitmapShard.ts';
import OrdinalChunk from '../../domain/retained/OrdinalChunk.ts';
import OrdinalSegment from '../../domain/retained/OrdinalSegment.ts';
import SelectionGeometry from '../../domain/retained/SelectionGeometry.ts';
import inspectPortableRoaringShard from './PortableRoaringShardInspector.ts';
import RoaringShardBounds from './RoaringShardBounds.ts';
import { getRoaringBitmap32 } from './RoaringLoaderAdapter.ts';

/** Values of one Roaring container: a container key is a value's high 16 bits. */
const CONTAINER_SPAN = 2 ** 16;

const SELECTION_WIRE = z.object({
  kind: z.literal('selection'), index: z.literal(LIVENESS_INDEX), set: z.enum(['node', 'edge']), writer: z.string(),
  segment: z.number(), chunk: z.number(), members: z.instanceof(Uint8Array),
});

/**
 * The CBOR wire form of a selection shard (#816): its index and chunk, and
 * its members as one portable Roaring bitmap of segment-local ordinals.
 *
 * Encoding builds the bitmap from the sorted members and run-optimizes it
 * before serializing, so one set of members always gives the same bytes.
 * Decoding inspects the bytes against the chunk bound before the Roaring
 * library reads them: at most 8208 bytes, at most one container, and that
 * container's key is the chunk's. Every bitmap is disposed before return.
 */
export function encodeSelectionShard(shard: OrdinalBitmapShard): object {
  const { chunk } = shard;
  requireStoredGeometry(chunk.geometry);
  return {
    kind: 'selection', index: shard.index, set: chunk.segment.kind, writer: chunk.segment.writerId,
    segment: chunk.segment.index, chunk: chunk.index, members: serializeMembers(shard),
  };
}

/** The shard a decoded CBOR value names, null when it is not a selection shard. */
export function decodeSelectionShard(raw: unknown): OrdinalBitmapShard | null {
  const parsed = SELECTION_WIRE.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  const wire = parsed.data;
  const segment = new OrdinalSegment({ kind: wire.set, writerId: wire.writer, index: wire.segment });
  const chunk = new OrdinalChunk({ segment, index: wire.chunk, geometry: SelectionGeometry.chunks() });
  return new OrdinalBitmapShard({ index: wire.index, chunk, offsets: deserializeMembers(wire.members, chunk) });
}

function serializeMembers(shard: OrdinalBitmapShard): Uint8Array {
  const first = shard.chunk.firstLocal();
  const bitmap = new (getRoaringBitmap32())(shard.offsets().map((offset) => first + offset));
  try {
    bitmap.runOptimize();
    return bitmap.serialize(true);
  } finally {
    bitmap.dispose();
  }
}

function deserializeMembers(bytes: Uint8Array, chunk: OrdinalChunk): number[] {
  requireChunkContainer(bytes, chunk);
  const bitmap = getRoaringBitmap32().deserialize(bytes, true);
  try {
    const first = chunk.firstLocal();
    return bitmap.toArray().map((value) => value - first);
  } finally {
    bitmap.dispose();
  }
}

/** Refuses bytes that are not one portable container of `chunk`, before any Roaring call. */
function requireChunkContainer(bytes: Uint8Array, chunk: OrdinalChunk): void {
  const inspection = inspectPortableRoaringShard(bytes, RoaringShardBounds.ordinalChunk());
  if (inspection instanceof RoaringShardRejectedError) {
    throw inspection;
  }
  if (inspection.containerCount > 1) {
    throw RoaringShardRejectedError.malformed('chunk-containers');
  }
  const key = Math.floor(chunk.firstLocal() / CONTAINER_SPAN);
  if (inspection.firstKey !== null && inspection.firstKey !== key) {
    throw RoaringShardRejectedError.malformed('chunk-key');
  }
}

function requireStoredGeometry(geometry: SelectionGeometry): void {
  if (!geometry.equals(SelectionGeometry.chunks())) {
    throw new RetainedGraphError('The record layout stores selection shards of geometry v1 only', 'E_RETAINED_GEOMETRY_UNSUPPORTED', {
      context: { geometry: geometry.identity() },
    });
  }
}
