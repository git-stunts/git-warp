import RoaringShardRejectedError from '../../domain/errors/RoaringShardRejectedError.ts';

const MAX_ARRAY_CARDINALITY = 4096;
const BITMAP_CONTAINER_BYTES = 8192;
const MAX_LOW_VALUE = 0xffff;

/** One container header: its declared value count and whether it is a run container. */
export type PortableRoaringContainer = {
  readonly cardinality: number;
  readonly run: boolean;
};

function truncated(): RoaringShardRejectedError {
  return RoaringShardRejectedError.malformed('truncated-container');
}

function popcount(word: number): number {
  let bits = word - ((word >>> 1) & 0x55555555);
  bits = (bits & 0x33333333) + ((bits >>> 2) & 0x33333333);
  return (Math.imul((bits + (bits >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24);
}

function inspectArray(view: DataView, at: number, cardinality: number): number | RoaringShardRejectedError {
  const end = at + cardinality * 2;
  if (end > view.byteLength) {
    return truncated();
  }
  let previous = -1;
  for (let position = at; position < end; position += 2) {
    const value = view.getUint16(position, true);
    if (value <= previous) {
      return RoaringShardRejectedError.malformed('array-order');
    }
    previous = value;
  }
  return end;
}

function inspectBitmap(view: DataView, at: number, cardinality: number): number | RoaringShardRejectedError {
  const end = at + BITMAP_CONTAINER_BYTES;
  if (end > view.byteLength) {
    return truncated();
  }
  let bits = 0;
  for (let position = at; position < end; position += 4) {
    bits += popcount(view.getUint32(position, true));
  }
  return bits === cardinality ? end : RoaringShardRejectedError.malformed('bitmap-cardinality');
}

/** Sums the values of the runs in [at, end), or rejects runs that overlap or leave the container. */
function sumRuns(view: DataView, at: number, end: number): number | RoaringShardRejectedError {
  let previousLast = -1;
  let total = 0;
  for (let position = at; position < end; position += 4) {
    const start = view.getUint16(position, true);
    const last = start + view.getUint16(position + 2, true);
    if (start <= previousLast || last > MAX_LOW_VALUE) {
      return RoaringShardRejectedError.malformed('run-order');
    }
    previousLast = last;
    total += last - start + 1;
  }
  return total;
}

function inspectRun(view: DataView, at: number, cardinality: number): number | RoaringShardRejectedError {
  if (at + 2 > view.byteLength) {
    return truncated();
  }
  const end = at + 2 + view.getUint16(at, true) * 4;
  if (end > view.byteLength) {
    return truncated();
  }
  const total = sumRuns(view, at + 2, end);
  if (total instanceof RoaringShardRejectedError) {
    return total;
  }
  return total === cardinality ? end : RoaringShardRejectedError.malformed('run-cardinality');
}

/**
 * Validates one container body at `at` and returns the position after it.
 *
 * A run flag selects a run container. Otherwise the declared cardinality
 * selects the type, as the portable format requires: up to 4096 values is
 * an array container, more is a bitmap container.
 */
export default function inspectPortableRoaringContainer(
  view: DataView,
  at: number,
  container: PortableRoaringContainer,
): number | RoaringShardRejectedError {
  if (container.run) {
    return inspectRun(view, at, container.cardinality);
  }
  if (container.cardinality <= MAX_ARRAY_CARDINALITY) {
    return inspectArray(view, at, container.cardinality);
  }
  return inspectBitmap(view, at, container.cardinality);
}
