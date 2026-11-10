import RoaringShardRejectedError from '../../domain/errors/RoaringShardRejectedError.ts';
import InspectedRoaringShard from './InspectedRoaringShard.ts';
import inspectPortableRoaringContainer from './PortableRoaringContainerInspector.ts';
import PortableRoaringLayout from './PortableRoaringLayout.ts';
import type RoaringShardBounds from './RoaringShardBounds.ts';

function headerAt(layout: PortableRoaringLayout, index: number): number {
  return layout.headersAt + index * 4;
}

function cardinalityAt(view: DataView, layout: PortableRoaringLayout, index: number): number {
  return view.getUint16(headerAt(layout, index) + 2, true) + 1;
}

/** Checks key order and sums the declared cardinality, before any container body is read. */
function declaredCardinality(
  view: DataView,
  layout: PortableRoaringLayout,
  bounds: RoaringShardBounds,
): number | RoaringShardRejectedError {
  let previousKey = -1;
  let cardinality = 0;
  for (let index = 0; index < layout.containerCount; index++) {
    const key = view.getUint16(headerAt(layout, index), true);
    if (key <= previousKey) {
      return RoaringShardRejectedError.malformed('key-order');
    }
    previousKey = key;
    cardinality += cardinalityAt(view, layout, index);
  }
  if (cardinality > bounds.maxCardinality) {
    return RoaringShardRejectedError.cardinalityExceeded(cardinality, bounds.maxCardinality);
  }
  return cardinality;
}

/** Walks every container body in order and requires the walk to end at the last byte. */
function inspectContainers(view: DataView, layout: PortableRoaringLayout): RoaringShardRejectedError | null {
  let position = layout.containersAt;
  for (let index = 0; index < layout.containerCount; index++) {
    if (!layout.offsetMatches(view, index, position)) {
      return RoaringShardRejectedError.malformed('offset');
    }
    const container = { cardinality: cardinalityAt(view, layout, index), run: layout.isRun(view, index) };
    const next = inspectPortableRoaringContainer(view, position, container);
    if (next instanceof RoaringShardRejectedError) {
      return next;
    }
    position = next;
  }
  return position === view.byteLength ? null : RoaringShardRejectedError.malformed('trailing-bytes');
}

/**
 * Validates one serialized portable Roaring shard against `bounds`.
 *
 * The byte bound is checked before any byte is read, and the cardinality
 * bound before any container body is read. A shard that passes has sorted
 * keys, exact offsets, container bodies that agree with their headers, and
 * no trailing bytes, so the bitmap library receives only valid input.
 */
export default function inspectPortableRoaringShard(
  bytes: Uint8Array,
  bounds: RoaringShardBounds,
): InspectedRoaringShard | RoaringShardRejectedError {
  if (bytes.byteLength > bounds.maxBytes) {
    return RoaringShardRejectedError.tooLarge(bytes.byteLength, bounds.maxBytes);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const layout = PortableRoaringLayout.read(view);
  if (layout instanceof RoaringShardRejectedError) {
    return layout;
  }
  const cardinality = declaredCardinality(view, layout, bounds);
  if (cardinality instanceof RoaringShardRejectedError) {
    return cardinality;
  }
  return inspectContainers(view, layout) ?? new InspectedRoaringShard(layout.containerCount, cardinality);
}
