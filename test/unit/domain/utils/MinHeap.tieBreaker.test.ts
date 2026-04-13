import { describe, it, expect } from 'vitest';
import MinHeap from '../../../../src/domain/utils/MinHeap.ts';

describe('MinHeap tie-breaking', () => {
  it('breaks ties using tieBreaker comparator', () => {
    const heap = new MinHeap({
      tieBreaker: (a, b) => (a < b ? -1 : a > b ? 1 : 0),
    });

    heap.insert('charlie', 1);
    heap.insert('alice', 1);
    heap.insert('bob', 1);

    expect(heap.extractMin()).toBe('alice');
    expect(heap.extractMin()).toBe('bob');
    expect(heap.extractMin()).toBe('charlie');
  });

  it('uses priority first, tieBreaker only when equal', () => {
    const heap = new MinHeap({
      tieBreaker: (a, b) => (a < b ? -1 : a > b ? 1 : 0),
    });

    heap.insert('z-low', 0);
    heap.insert('a-high', 2);
    heap.insert('b-mid', 1);
    heap.insert('a-mid', 1);

    expect(heap.extractMin()).toBe('z-low');
    expect(heap.extractMin()).toBe('a-mid');
    expect(heap.extractMin()).toBe('b-mid');
    expect(heap.extractMin()).toBe('a-high');
  });

  it('works without tieBreaker (backward compat)', () => {
    const heap = new MinHeap();

    heap.insert('b', 2);
    heap.insert('a', 1);
    heap.insert('c', 3);

    expect(heap.extractMin()).toBe('a');
    expect(heap.extractMin()).toBe('b');
    expect(heap.extractMin()).toBe('c');
  });

  it('handles numeric tie-breaking', () => {
    const heap = new MinHeap({
      tieBreaker: (a, b) => a - b,
    });

    heap.insert(30, 5);
    heap.insert(10, 5);
    heap.insert(20, 5);

    expect(heap.extractMin()).toBe(10);
    expect(heap.extractMin()).toBe(20);
    expect(heap.extractMin()).toBe(30);
  });

  it('maintains heap invariant through mixed inserts and extracts', () => {
    const heap = new MinHeap({
      tieBreaker: (a, b) => (a < b ? -1 : a > b ? 1 : 0),
    });

    heap.insert('d', 2);
    heap.insert('a', 1);
    heap.insert('c', 2);
    expect(heap.extractMin()).toBe('a');

    heap.insert('b', 2);
    // Remaining: c@2, d@2, b@2 — tie-break by lex
    expect(heap.extractMin()).toBe('b');
    expect(heap.extractMin()).toBe('c');
    expect(heap.extractMin()).toBe('d');
  });

  it('handles single-element heap with tieBreaker', () => {
    const heap = new MinHeap({
      tieBreaker: (a, b) => (a < b ? -1 : a > b ? 1 : 0),
    });

    heap.insert('only', 0);
    expect(heap.extractMin()).toBe('only');
    expect(heap.extractMin()).toBeUndefined();
  });

  it('handles empty {} options (no tieBreaker)', () => {
    const heap = new MinHeap({});
    heap.insert('a', 1);
    heap.insert('b', 2);
    expect(heap.extractMin()).toBe('a');
    expect(heap.extractMin()).toBe('b');
  });
});
