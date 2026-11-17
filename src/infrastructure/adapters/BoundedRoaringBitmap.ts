import type { RoaringBitmapSubset, RoaringLibraryConstructor } from '../../domain/utils/roaring.ts';

/**
 * A library bitmap that the shard boundary has admitted. Only the bounded
 * constructor (`BoundedRoaringConstructor.ts`) makes one, after it inspects
 * the bytes.
 */
export class AdmittedLibraryBitmap {
  readonly bitmap: RoaringBitmapSubset;

  constructor(bitmap: RoaringBitmapSubset) {
    this.bitmap = bitmap;
    Object.freeze(this);
  }
}

/**
 * One bitmap that the loader created or admitted (#1159). It holds a bitmap
 * of the library and forwards only the declared bitmap members, the members
 * of `RoaringBitmapSubset`. It is deny by default: a library member that the
 * domain does not declare, such as an instance `deserialize` that loads
 * bytes without the shard boundary, or `clone`, is not reachable through it,
 * and no wrapper hands out the library bitmap that it holds.
 *
 * To declare a new member, add it to `RoaringBitmapSubset` and forward it
 * here with one method; `BoundedRoaringMembers.test.ts` lists the members.
 */
export class BoundedRoaringBitmap implements RoaringBitmapSubset {
  readonly #bitmap: RoaringBitmapSubset;

  constructor(library: RoaringLibraryConstructor, source: Iterable<number> | AdmittedLibraryBitmap | undefined) {
    this.#bitmap = source instanceof AdmittedLibraryBitmap
      ? source.bitmap
      : new library(source === undefined ? undefined : BoundedRoaringBitmap.#libraryValues(source));
    Object.freeze(this);
  }

  get size(): number {
    return this.#bitmap.size;
  }

  add(value: number): void {
    this.#bitmap.add(value);
  }

  clear(): void {
    this.#bitmap.clear();
  }

  remove(value: number): void {
    this.#bitmap.remove(value);
  }

  has(value: number): boolean {
    return this.#bitmap.has(value);
  }

  orInPlace(other: Iterable<number>): void {
    this.#bitmap.orInPlace(BoundedRoaringBitmap.#libraryValues(other));
  }

  serialize(portable: boolean): Uint8Array {
    return this.#bitmap.serialize(portable);
  }

  toArray(): number[] {
    return this.#bitmap.toArray();
  }

  rank(value: number): number {
    return this.#bitmap.rank(value);
  }

  at(index: number): number | undefined {
    return this.#bitmap.at(index);
  }

  [Symbol.iterator](): Iterator<number> {
    return this.#bitmap[Symbol.iterator]();
  }

  /** The library bitmap behind a wrapper, so that the library takes its own fast path. */
  static #libraryValues(values: Iterable<number>): Iterable<number> {
    return values instanceof BoundedRoaringBitmap ? values.#bitmap : values;
  }
}
