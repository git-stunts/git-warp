export default class TrustReadonlyMap<K, V> {
  readonly #entries: Map<K, V>;

  constructor(entries: Map<K, V>) {
    this.#entries = new Map(entries);
    Object.freeze(this);
  }

  get size(): number {
    return this.#entries.size;
  }

  get(key: K): V | undefined {
    return this.#entries.get(key);
  }

  has(key: K): boolean {
    return this.#entries.has(key);
  }

  keys(): IterableIterator<K> {
    return this.#entries.keys();
  }

  values(): IterableIterator<V> {
    return this.#entries.values();
  }

  entries(): IterableIterator<[K, V]> {
    return this.#entries.entries();
  }

  forEach(callback: (value: V, key: K, map: TrustReadonlyMap<K, V>) => void): void {
    for (const [key, value] of this.#entries) {
      callback(value, key, this);
    }
  }

  [Symbol.iterator](): IterableIterator<[K, V]> {
    return this.#entries[Symbol.iterator]();
  }
}
