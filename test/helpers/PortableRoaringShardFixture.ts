/**
 * Builds portable Roaring bitmap bytes by hand, so tests can craft valid
 * and deliberately broken shards without the bitmap library.
 *
 * Format reference: https://github.com/RoaringBitmap/RoaringFormatSpec
 */

const SERIAL_COOKIE = 12347;
const SERIAL_COOKIE_NO_RUN = 12346;
const NO_OFFSET_THRESHOLD = 4;
const BITMAP_CONTAINER_BYTES = 8192;

export type FixtureRun = readonly [start: number, lengthMinusOne: number];

export type FixtureContainer =
  | { readonly kind: 'array'; readonly key: number; readonly values: readonly number[] }
  | { readonly kind: 'bitmap'; readonly key: number; readonly values: readonly number[] }
  | { readonly kind: 'run'; readonly key: number; readonly runs: readonly FixtureRun[] };

export function fixtureCardinality(container: FixtureContainer): number {
  if (container.kind === 'run') {
    return container.runs.reduce((sum, [, length]) => sum + length + 1, 0);
  }
  return container.values.length;
}

function encodeBody(container: FixtureContainer): Uint8Array {
  if (container.kind === 'array') {
    const body = new DataView(new ArrayBuffer(container.values.length * 2));
    container.values.forEach((value, index) => body.setUint16(index * 2, value, true));
    return new Uint8Array(body.buffer);
  }
  if (container.kind === 'bitmap') {
    const body = new Uint8Array(BITMAP_CONTAINER_BYTES);
    for (const value of container.values) {
      body[value >>> 3] = (body[value >>> 3] ?? 0) | (1 << (value & 7));
    }
    return body;
  }
  const body = new DataView(new ArrayBuffer(2 + container.runs.length * 4));
  body.setUint16(0, container.runs.length, true);
  container.runs.forEach(([start, length], index) => {
    body.setUint16(2 + index * 4, start, true);
    body.setUint16(4 + index * 4, length, true);
  });
  return new Uint8Array(body.buffer);
}

/** Encodes containers in the portable format, choosing the cookie like CRoaring does. */
export function encodePortableShard(containers: readonly FixtureContainer[]): Uint8Array {
  const count = containers.length;
  const hasRun = containers.some((container) => container.kind === 'run');
  const prefix = hasRun ? 4 + Math.ceil(count / 8) : 8;
  const hasOffsets = !hasRun || count >= NO_OFFSET_THRESHOLD;
  const headerBytes = count * 4 + (hasOffsets ? count * 4 : 0);
  const bodies = containers.map(encodeBody);
  const total = prefix + headerBytes + bodies.reduce((sum, body) => sum + body.length, 0);
  const bytes = new Uint8Array(total);
  const view = new DataView(bytes.buffer);
  if (hasRun) {
    view.setUint32(0, SERIAL_COOKIE | ((count - 1) << 16), true);
    containers.forEach((container, index) => {
      if (container.kind === 'run') {
        bytes[4 + (index >>> 3)] = (bytes[4 + (index >>> 3)] ?? 0) | (1 << (index & 7));
      }
    });
  } else {
    view.setUint32(0, SERIAL_COOKIE_NO_RUN, true);
    view.setUint32(4, count, true);
  }
  let position = prefix + headerBytes;
  containers.forEach((container, index) => {
    view.setUint16(prefix + index * 4, container.key, true);
    view.setUint16(prefix + index * 4 + 2, fixtureCardinality(container) - 1, true);
    if (hasOffsets) {
      view.setUint32(prefix + count * 4 + index * 4, position, true);
    }
    bytes.set(bodies[index] ?? new Uint8Array(0), position);
    position += bodies[index]?.length ?? 0;
  });
  return bytes;
}

/** Returns a copy of `bytes` with one little-endian uint16 replaced. */
export function withUint16(bytes: Uint8Array, at: number, value: number): Uint8Array {
  const copy = Uint8Array.from(bytes);
  new DataView(copy.buffer).setUint16(at, value, true);
  return copy;
}

/** Returns a copy of `bytes` with one little-endian uint32 replaced. */
export function withUint32(bytes: Uint8Array, at: number, value: number): Uint8Array {
  const copy = Uint8Array.from(bytes);
  new DataView(copy.buffer).setUint32(at, value, true);
  return copy;
}

/** Returns `count` full run containers: `count * 65536` values in a few bytes each. */
export function fullRunContainers(count: number, firstKey = 0): FixtureContainer[] {
  return Array.from({ length: count }, (_, index): FixtureContainer => ({
    kind: 'run',
    key: firstKey + index,
    runs: [[0, 0xffff]],
  }));
}
