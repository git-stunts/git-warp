import { describe, it, expect } from 'vitest';
import MinHeap from '../../../../src/domain/utils/MinHeap.js';

describe('MinHeap', () => {
  describe('insert and extractMin', () => {
    it('extracts items in correct priority order', () => {
      const heap = new MinHeap();

      heap.insert('C', 3);
      heap.insert('A', 1);
      heap.insert('B', 2);

      expect(heap.extractMin()).toBe('A');
      expect(heap.extractMin()).toBe('B');
      expect(heap.extractMin()).toBe('C');
    });

    it('handles single element', () => {
      const heap = new MinHeap();

      heap.insert('only', 42);

      expect(heap.extractMin()).toBe('only');
      expect(heap.extractMin()).toBeUndefined();
    });

    it('handles elements inserted in ascending order', () => {
      const heap = new MinHeap();

      heap.insert('A', 1);
      heap.insert('B', 2);
      heap.insert('C', 3);

      expect(heap.extractMin()).toBe('A');
      expect(heap.extractMin()).toBe('B');
      expect(heap.extractMin()).toBe('C');
    });

    it('handles elements inserted in descending order', () => {
      const heap = new MinHeap();

      heap.insert('C', 3);
      heap.insert('B', 2);
      heap.insert('A', 1);

      expect(heap.extractMin()).toBe('A');
      expect(heap.extractMin()).toBe('B');
      expect(heap.extractMin()).toBe('C');
    });

    it('handles many elements', () => {
      const heap = new MinHeap();
      const values = [50, 30, 70, 20, 40, 60, 80, 10, 90, 5];

      for (let i = 0; i < values.length; i++) {
        heap.insert(`item${values[i]}`, values[i]);
      }

      const extracted = [];
      while (!heap.isEmpty()) {
        extracted.push(heap.extractMin());
      }

      expect(extracted).toEqual([
        'item5',
        'item10',
        'item20',
        'item30',
        'item40',
        'item50',
        'item60',
        'item70',
        'item80',
        'item90',
      ]);
    });
  });

  describe('handles ties correctly', () => {
    it('extracts all items with same priority', () => {
      const heap = new MinHeap();

      heap.insert('A', 5);
      heap.insert('B', 5);
      heap.insert('C', 5);

      const extracted = [];
      while (!heap.isEmpty()) {
        extracted.push(heap.extractMin());
      }

      // All items should be extracted (order among ties is not guaranteed)
      expect(extracted).toHaveLength(3);
      expect(extracted).toContain('A');
      expect(extracted).toContain('B');
      expect(extracted).toContain('C');
    });

    it('extracts lower priority first when there are ties', () => {
      const heap = new MinHeap();

      heap.insert('low', 1);
      heap.insert('tie1', 5);
      heap.insert('tie2', 5);
      heap.insert('high', 10);

      expect(heap.extractMin()).toBe('low');

      // Next two should be tie1 or tie2 (either order)
      const next1 = heap.extractMin();
      const next2 = heap.extractMin();
      expect([next1, next2].sort()).toEqual(['tie1', 'tie2']);

      expect(heap.extractMin()).toBe('high');
    });
  });

  describe('isEmpty', () => {
    it('returns true for new heap', () => {
      const heap = new MinHeap();

      expect(heap.isEmpty()).toBe(true);
    });

    it('returns false after insert', () => {
      const heap = new MinHeap();
      heap.insert('item', 1);

      expect(heap.isEmpty()).toBe(false);
    });

    it('returns true after extracting all items', () => {
      const heap = new MinHeap();
      heap.insert('A', 1);
      heap.insert('B', 2);

      heap.extractMin();
      heap.extractMin();

      expect(heap.isEmpty()).toBe(true);
    });

    it('returns false when items remain', () => {
      const heap = new MinHeap();
      heap.insert('A', 1);
      heap.insert('B', 2);

      heap.extractMin();

      expect(heap.isEmpty()).toBe(false);
    });
  });

  describe('size', () => {
    it('returns 0 for new heap', () => {
      const heap = new MinHeap();

      expect(heap.size()).toBe(0);
    });

    it('increases after insert', () => {
      const heap = new MinHeap();

      heap.insert('A', 1);
      expect(heap.size()).toBe(1);

      heap.insert('B', 2);
      expect(heap.size()).toBe(2);

      heap.insert('C', 3);
      expect(heap.size()).toBe(3);
    });

    it('decreases after extractMin', () => {
      const heap = new MinHeap();
      heap.insert('A', 1);
      heap.insert('B', 2);
      heap.insert('C', 3);

      expect(heap.size()).toBe(3);

      heap.extractMin();
      expect(heap.size()).toBe(2);

      heap.extractMin();
      expect(heap.size()).toBe(1);

      heap.extractMin();
      expect(heap.size()).toBe(0);
    });
  });

  describe('extractMin on empty heap', () => {
    it('returns undefined', () => {
      const heap = new MinHeap();

      expect(heap.extractMin()).toBeUndefined();
    });

    it('returns undefined after multiple calls on empty heap', () => {
      const heap = new MinHeap();

      expect(heap.extractMin()).toBeUndefined();
      expect(heap.extractMin()).toBeUndefined();
      expect(heap.extractMin()).toBeUndefined();
    });

    it('returns undefined after exhausting all items', () => {
      const heap = new MinHeap();
      heap.insert('only', 1);

      expect(heap.extractMin()).toBe('only');
      expect(heap.extractMin()).toBeUndefined();
      expect(heap.extractMin()).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('handles negative priorities', () => {
      const heap = new MinHeap();

      heap.insert('neg', -5);
      heap.insert('zero', 0);
      heap.insert('pos', 5);

      expect(heap.extractMin()).toBe('neg');
      expect(heap.extractMin()).toBe('zero');
      expect(heap.extractMin()).toBe('pos');
    });

    it('handles floating point priorities', () => {
      const heap = new MinHeap();

      heap.insert('B', 1.5);
      heap.insert('A', 1.1);
      heap.insert('C', 1.9);

      expect(heap.extractMin()).toBe('A');
      expect(heap.extractMin()).toBe('B');
      expect(heap.extractMin()).toBe('C');
    });

    it('handles Infinity priority', () => {
      const heap = new MinHeap();

      heap.insert('inf', Infinity);
      heap.insert('normal', 100);
      heap.insert('negInf', -Infinity);

      expect(heap.extractMin()).toBe('negInf');
      expect(heap.extractMin()).toBe('normal');
      expect(heap.extractMin()).toBe('inf');
    });

    it('maintains heap property after interleaved operations', () => {
      const heap = new MinHeap();

      heap.insert('A', 10);
      heap.insert('B', 5);
      expect(heap.extractMin()).toBe('B'); // Extract 5

      heap.insert('C', 3);
      heap.insert('D', 7);
      expect(heap.extractMin()).toBe('C'); // Extract 3

      heap.insert('E', 1);
      expect(heap.extractMin()).toBe('E'); // Extract 1
      expect(heap.extractMin()).toBe('D'); // Extract 7
      expect(heap.extractMin()).toBe('A'); // Extract 10
    });

    it('handles duplicate inserts of same item with different priorities', () => {
      const heap = new MinHeap();

      // Insert same string with different priorities
      // Both will be in the heap (the heap stores items by reference)
      heap.insert('same', 10);
      heap.insert('same', 1);

      // The lower priority one comes out first
      expect(heap.extractMin()).toBe('same');
      expect(heap.extractMin()).toBe('same');
      expect(heap.isEmpty()).toBe(true);
    });
  });
});
