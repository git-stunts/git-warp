/**
 * MinHeap/PriorityQueue implementation optimized for Dijkstra's algorithm.
 * Items with lowest priority are extracted first.
 *
 * @class MinHeap
 * @template T
 */
class MinHeap {
  /**
   * Creates an empty MinHeap.
   */
  constructor() {
    /** @type {Array<{item: T, priority: number}>} */
    this.heap = [];
  }

  /**
   * Insert an item with given priority.
   *
   * @param {T} item - The item to insert
   * @param {number} priority - Priority value (lower = higher priority)
   * @returns {void}
   */
  insert(item, priority) {
    this.heap.push({ item, priority });
    this._bubbleUp(this.heap.length - 1);
  }

  /**
   * Extract and return the item with minimum priority.
   *
   * @returns {T | undefined} The item with lowest priority, or undefined if empty
   */
  extractMin() {
    if (this.heap.length === 0) { return undefined; }
    if (this.heap.length === 1) { return /** @type {{item: T, priority: number}} */ (this.heap.pop()).item; }

    const min = this.heap[0];
    this.heap[0] = /** @type {{item: T, priority: number}} */ (this.heap.pop());
    this._bubbleDown(0);
    return min.item;
  }

  /**
   * Check if the heap is empty.
   *
   * @returns {boolean} True if empty
   */
  isEmpty() {
    return this.heap.length === 0;
  }

  /**
   * Get the number of items in the heap.
   *
   * @returns {number} Number of items
   */
  size() {
    return this.heap.length;
  }

  /**
   * Peek at the minimum priority without removing the item.
   *
   * @returns {number} The minimum priority value, or Infinity if empty
   */
  peekPriority() {
    return this.heap.length > 0 ? this.heap[0].priority : Infinity;
  }

  /**
   * Restore heap property by bubbling up from index.
   *
   * @private
   * @param {number} pos - Starting index
   */
  _bubbleUp(pos) {
    let current = pos;
    while (current > 0) {
      const parentIndex = Math.floor((current - 1) / 2);
      if (this.heap[parentIndex].priority <= this.heap[current].priority) { break; }
      [this.heap[parentIndex], this.heap[current]] = [this.heap[current], this.heap[parentIndex]];
      current = parentIndex;
    }
  }

  /**
   * Restore heap property by bubbling down from index.
   *
   * @private
   * @param {number} pos - Starting index
   */
  _bubbleDown(pos) {
    const {length} = this.heap;
    let current = pos;
    while (true) {
      const leftChild = 2 * current + 1;
      const rightChild = 2 * current + 2;
      let smallest = current;

      if (leftChild < length && this.heap[leftChild].priority < this.heap[smallest].priority) {
        smallest = leftChild;
      }
      if (rightChild < length && this.heap[rightChild].priority < this.heap[smallest].priority) {
        smallest = rightChild;
      }
      if (smallest === current) { break; }

      [this.heap[current], this.heap[smallest]] = [this.heap[smallest], this.heap[current]];
      current = smallest;
    }
  }
}

export default MinHeap;
