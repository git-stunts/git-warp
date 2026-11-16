/**
 * CBOR documents that cbor-x decodes without complaint but that break one of
 * git-warp's CBOR decode bounds (`src/infrastructure/codecs/CborCodec.ts`):
 * 5 MiB, nesting depth 32, 1,000,000 items, 1,000,000 container entries,
 * definite lengths only, and the tag allow-list. Each entry names the refusal
 * reason that the bounded decoder must report.
 */
export type OutOfBoundsCborCase = Readonly<{
  name: string;
  bytes: Uint8Array;
  reason: string;
}>;

const MAX_DECODE_BYTES = 5 * 1024 * 1024;
const MAX_DEPTH = 32;
const MAX_ITEMS = 1_000_000;
const MAX_CONTAINER_ENTRIES = 1_000_000;

/** A definite-length array header for `length` entries (major type 4). */
function arrayHeader(length: number): number[] {
  if (length < 24) {
    return [0x80 + length];
  }
  if (length <= 0xffff) {
    return [0x99, length >>> 8, length & 0xff];
  }
  return [0x9a, (length >>> 24) & 0xff, (length >>> 16) & 0xff, (length >>> 8) & 0xff, length & 0xff];
}

/** `levels` single-entry arrays around a 0, so the 0 sits at depth `levels`. */
export function nestedArrays(levels: number): Uint8Array {
  return Uint8Array.from([...new Array<number>(levels).fill(0x81), 0x00]);
}

/** One array of 1,000 arrays whose zeros bring the item count to `totalItems`. */
export function arraysOfZeros(totalItems: number): Uint8Array {
  const outer = 1_000;
  const zeros = totalItems - 1 - outer;
  const bytes: number[] = [...arrayHeader(outer)];
  for (let index = 0; index < outer; index += 1) {
    const length = Math.floor(zeros / outer) + (index < zeros % outer ? 1 : 0);
    bytes.push(...arrayHeader(length));
    for (let zero = 0; zero < length; zero += 1) {
      bytes.push(0x00);
    }
  }
  return Uint8Array.from(bytes);
}

function flatArrayOfZeros(length: number): Uint8Array {
  const header = arrayHeader(length);
  const bytes = new Uint8Array(header.length + length);
  bytes.set(header);
  return bytes;
}

function byteStringOfTotalLength(totalLength: number): Uint8Array {
  const length = totalLength - 5;
  const bytes = new Uint8Array(totalLength);
  bytes.set([0x5a, (length >>> 24) & 0xff, (length >>> 16) & 0xff, (length >>> 8) & 0xff, length & 0xff]);
  return bytes;
}

export const OUT_OF_BOUNDS_CBOR: readonly OutOfBoundsCborCase[] = Object.freeze([
  {
    name: 'nesting one level deeper than 32',
    bytes: nestedArrays(MAX_DEPTH + 1),
    reason: 'nesting depth exceeds the configured maximum',
  },
  {
    name: 'one item more than 1,000,000',
    bytes: arraysOfZeros(MAX_ITEMS + 1),
    reason: 'decoded item count exceeds the configured maximum',
  },
  {
    name: 'one array with 1,000,001 entries',
    bytes: flatArrayOfZeros(MAX_CONTAINER_ENTRIES + 1),
    reason: 'container entry count exceeds the configured maximum',
  },
  {
    name: 'a shared-reference cycle tag (28, 29)',
    bytes: Uint8Array.from([0x82, 0xd8, 0x1c, 0x80, 0xd8, 0x1d, 0x00]),
    reason: 'tag is not in the allowed tag set',
  },
  {
    name: 'an indefinite-length array',
    bytes: Uint8Array.from([0x9f, 0xff]),
    reason: 'indefinite-length values are not supported',
  },
  {
    name: 'one byte more than 5 MiB',
    bytes: byteStringOfTotalLength(MAX_DECODE_BYTES + 1),
    reason: `encoded byte length ${String(MAX_DECODE_BYTES + 1)} exceeds ${String(MAX_DECODE_BYTES)}`,
  },
]);
