import RoaringShardRejectedError from '../../domain/errors/RoaringShardRejectedError.ts';

const SERIAL_COOKIE = 12347;
const SERIAL_COOKIE_NO_RUN = 12346;
const COOKIE_MASK = 0xffff;
const NO_OFFSET_THRESHOLD = 4;
const MAX_CONTAINERS = 65536;
const ABSENT = -1;

type LayoutFields = {
  readonly containerCount: number;
  readonly runFlagsAt: number;
  readonly headersAt: number;
  readonly offsetsAt: number;
};

/**
 * Where each section of a portable Roaring shard starts.
 *
 * Format reference: https://github.com/RoaringBitmap/RoaringFormatSpec
 */
export default class PortableRoaringLayout {
  readonly containerCount: number;
  readonly runFlagsAt: number;
  readonly headersAt: number;
  readonly offsetsAt: number;
  readonly containersAt: number;

  private constructor(fields: LayoutFields) {
    this.containerCount = fields.containerCount;
    this.runFlagsAt = fields.runFlagsAt;
    this.headersAt = fields.headersAt;
    this.offsetsAt = fields.offsetsAt;
    const headerEnd = fields.headersAt + fields.containerCount * 4;
    this.containersAt = fields.offsetsAt === ABSENT ? headerEnd : headerEnd + fields.containerCount * 4;
    Object.freeze(this);
  }

  /** Reads the cookie and checks that every header fits in the shard. */
  static read(view: DataView): PortableRoaringLayout | RoaringShardRejectedError {
    if (view.byteLength < 4) {
      return RoaringShardRejectedError.malformed('truncated-cookie');
    }
    const cookie = view.getUint32(0, true);
    if ((cookie & COOKIE_MASK) === SERIAL_COOKIE) {
      return PortableRoaringLayout.#within(view, PortableRoaringLayout.#withRuns((cookie >>> 16) + 1));
    }
    if (cookie === SERIAL_COOKIE_NO_RUN) {
      return PortableRoaringLayout.#withoutRuns(view);
    }
    return RoaringShardRejectedError.malformed('unknown-cookie');
  }

  /** Reports whether container `index` is a run container. */
  isRun(view: DataView, index: number): boolean {
    if (this.runFlagsAt === ABSENT) {
      return false;
    }
    return (view.getUint8(this.runFlagsAt + (index >>> 3)) & (1 << (index & 7))) !== 0;
  }

  /** Reports whether the offset of container `index` names `position`. */
  offsetMatches(view: DataView, index: number, position: number): boolean {
    return this.offsetsAt === ABSENT || view.getUint32(this.offsetsAt + index * 4, true) === position;
  }

  static #withRuns(containerCount: number): PortableRoaringLayout {
    const headersAt = 4 + Math.ceil(containerCount / 8);
    return new PortableRoaringLayout({
      containerCount,
      runFlagsAt: 4,
      headersAt,
      offsetsAt: containerCount < NO_OFFSET_THRESHOLD ? ABSENT : headersAt + containerCount * 4,
    });
  }

  static #withoutRuns(view: DataView): PortableRoaringLayout | RoaringShardRejectedError {
    if (view.byteLength < 8) {
      return RoaringShardRejectedError.malformed('truncated-count');
    }
    const containerCount = view.getUint32(4, true);
    if (containerCount > MAX_CONTAINERS) {
      return RoaringShardRejectedError.malformed('container-count');
    }
    const layout = new PortableRoaringLayout({
      containerCount,
      runFlagsAt: ABSENT,
      headersAt: 8,
      offsetsAt: 8 + containerCount * 4,
    });
    return PortableRoaringLayout.#within(view, layout);
  }

  static #within(view: DataView, layout: PortableRoaringLayout): PortableRoaringLayout | RoaringShardRejectedError {
    return layout.containersAt > view.byteLength ? RoaringShardRejectedError.malformed('truncated-headers') : layout;
  }
}
