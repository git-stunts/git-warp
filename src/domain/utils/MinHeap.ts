/**
 * MinHeap/PriorityQueue implementation optimized for Dijkstra's algorithm.
 * Items with lowest priority are extracted first.
 */

interface HeapEntry<T> {
  readonly item: T;
  readonly priority: number;
}

class MinHeap<T> {
  private readonly _heap: HeapEntry<T>[];
  private readonly _tieBreaker: ((a: T, b: T) => number) | undefined;

  /**
   * Creates an empty MinHeap.
   *
   * @param options - Configuration options.
   *   `tieBreaker`: comparator invoked when two entries have equal priority.
   *   Negative return = a wins (comes out first).
   *   When omitted, equal-priority extraction order is unspecified (heap-natural).
   */
  constructor(options?: { tieBreaker?: (a: T, b: T) => number }) {
    const { tieBreaker } = options || {};
    this._heap = [];
    this._tieBreaker = tieBreaker;
  }

  /** Insert an item with given priority. */
  insert(item: T, priority: number): void {
    this._heap.push({ item, priority });
    this._bubbleUp(this._heap.length - 1);
  }

  /** Extract and return the item with minimum priority. */
  extractMin(): T | undefined {
    if (this._heap.length === 0) { return undefined; }
    if (this._heap.length === 1) { return this._heap.pop()!.item; }

    const min = this._heap[0];
    if (min === undefined) { return undefined; }
    this._heap[0] = this._heap.pop()!;
    this._bubbleDown(0);
    return min.item;
  }

  /** Check if the heap is empty. */
  isEmpty(): boolean {
    return this._heap.length === 0;
  }

  /** Get the number of items in the heap. */
  size(): number {
    return this._heap.length;
  }

  /** Peek at the minimum priority without removing the item. */
  peekPriority(): number {
    const first = this._heap[0];
    return first !== undefined ? first.priority : Infinity;
  }

  /**
   * Compares two heap entries. Returns negative if a should come before b.
   */
  private _compare(idxA: number, idxB: number): number {
    const a = this._heap[idxA];
    const b = this._heap[idxB];
    if (a === undefined || b === undefined) { return 0; }
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    if (this._tieBreaker) {
      return this._tieBreaker(a.item, b.item);
    }
    return 0;
  }

  /** Restore heap property by bubbling up from index. */
  private _bubbleUp(pos: number): void {
    let current = pos;
    while (current > 0) {
      const parentIndex = Math.floor((current - 1) / 2);
      if (this._compare(parentIndex, current) <= 0) { break; }
      const tmp = this._heap[parentIndex]!;
      this._heap[parentIndex] = this._heap[current]!;
      this._heap[current] = tmp;
      current = parentIndex;
    }
  }

  /**
   * Finds the index of the smallest among parent, left child, and right child.
   */
  private _smallestChild(current: number): number {
    const { length } = this._heap;
    const leftChild = 2 * current + 1;
    const rightChild = 2 * current + 2;
    let smallest = current;
    if (leftChild < length && this._compare(leftChild, smallest) < 0) {
      smallest = leftChild;
    }
    if (rightChild < length && this._compare(rightChild, smallest) < 0) {
      smallest = rightChild;
    }
    return smallest;
  }

  /** Restore heap property by bubbling down from index. */
  private _bubbleDown(pos: number): void {
    let current = pos;
    while (true) {
      const smallest = this._smallestChild(current);
      if (smallest === current) { break; }

      const tmp = this._heap[current]!;
      this._heap[current] = this._heap[smallest]!;
      this._heap[smallest] = tmp;
      current = smallest;
    }
  }
}

export default MinHeap;
