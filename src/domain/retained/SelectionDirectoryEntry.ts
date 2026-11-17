import ConeRecordError from '../errors/ConeRecordError.ts';
import OrdinalChunk from './OrdinalChunk.ts';

/** Constructor fields of a selection directory entry. */
export type SelectionDirectoryEntryFields = {
  readonly chunk: OrdinalChunk;
  /** Bit `b` is set when block `b` of the chunk has a live member. */
  readonly liveBlocks: bigint;
};

/**
 * One chunk a selection directory lists (#816, F1 decision): the chunk, and
 * a 64-bit mask of its blocks that have a live member. A reader opens only
 * the blocks the mask names. The chunk is listed once it has a dot with an
 * owner (E1); its mask can be zero when every dot of it is removed.
 */
export default class SelectionDirectoryEntry {
  readonly chunk: OrdinalChunk;
  readonly liveBlocks: bigint;

  constructor(fields: SelectionDirectoryEntryFields) {
    if (!(fields.chunk instanceof OrdinalChunk)) {
      throw new ConeRecordError('A selection directory entry needs an ordinal chunk');
    }
    this.chunk = fields.chunk;
    this.liveBlocks = requireMask(fields.liveBlocks, fields.chunk);
    Object.freeze(this);
  }

  /** True when block `block` has a live member. */
  hasLiveBlock(block: number): boolean {
    return ((this.liveBlocks >> BigInt(block)) & 1n) === 1n;
  }

  /** The blocks that have a live member, ascending. */
  blocks(): readonly number[] {
    const blocks = Array.from({ length: this.chunk.geometry.blocksPerChunk() }, (_unused, block) => block);
    return Object.freeze(blocks.filter((block) => this.hasLiveBlock(block)));
  }

  /** This entry with block `block` marked as having a live member. */
  withLiveBlock(block: number): SelectionDirectoryEntry {
    return new SelectionDirectoryEntry({ chunk: this.chunk, liveBlocks: this.liveBlocks | (1n << BigInt(block)) });
  }

  /** This entry with block `block` marked as having no live member. */
  withoutLiveBlock(block: number): SelectionDirectoryEntry {
    return new SelectionDirectoryEntry({ chunk: this.chunk, liveBlocks: this.liveBlocks & ~(1n << BigInt(block)) });
  }

  equals(other: SelectionDirectoryEntry): boolean {
    return other.chunk.equals(this.chunk) && other.liveBlocks === this.liveBlocks;
  }
}

function requireMask(mask: bigint, chunk: OrdinalChunk): bigint {
  if (typeof mask !== 'bigint' || mask < 0n || mask >= 1n << BigInt(chunk.geometry.blocksPerChunk())) {
    throw new ConeRecordError('A selection directory mask names only the blocks of its chunk', {
      context: { chunk: chunk.toString(), mask: String(mask) },
    });
  }
  return mask;
}
