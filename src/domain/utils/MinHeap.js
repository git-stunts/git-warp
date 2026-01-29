/**
 * MinHeap/PriorityQueue implementation optimized for Dijkstra's algorithm.
 * Items with lowest priority are extracted first.
 *
 * @class MinHeap
 */
class MinHeap {
  constructor() {
    /** @type {Array<{item: *, priority: number}>} */
    this.heap = [];
  }

  /**
   * Insert an item with given priority.
   *
   * @param {*} item - The item to insert
   * @param {number} priority - Priority value (lower = higher priority)
   */
  insert(item, priority) {
    this.heap.push({ item, priority });
    this._bubbleUp(this.heap.length - 1);
  }

  /**
   * Extract and return the item with minimum priority.
   *
   * @returns {*} The item with lowest priority, or undefined if empty
   */
  extractMin() {
    if (this.heap.length === 0) { return undefined; }
    if (this.heap.length === 1) { return this.heap.pop().item; }

    const min = this.heap[0];
    this.heap[0] = this.heap.pop();
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
   * @param {number} index - Starting index
   */
  _bubbleUp(index) {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.heap[parentIndex].priority <= this.heap[index].priority) { break; }
      [this.heap[parentIndex], this.heap[index]] = [this.heap[index], this.heap[parentIndex]];
      index = parentIndex;
    }
  }

  /**
   * Restore heap property by bubbling down from index.
   *
   * @private
   * @param {number} index - Starting index
   */
  _bubbleDown(index) {
    const length = this.heap.length;
    while (true) {
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;
      let smallest = index;

      if (leftChild < length && this.heap[leftChild].priority < this.heap[smallest].priority) {
        smallest = leftChild;
      }
      if (rightChild < length && this.heap[rightChild].priority < this.heap[smallest].priority) {
        smallest = rightChild;
      }
      if (smallest === index) { break; }

      [this.heap[index], this.heap[smallest]] = [this.heap[smallest], this.heap[index]];
      index = smallest;
    }
  }
}

export default MinHeap;
