#!/usr/bin/env node
/**
 * Simple pathfinding helpers for WarpGraph examples.
 *
 * Provides Dijkstra and A* over a directed adjacency list.
 */

class MinPriorityQueue {
  constructor() {
    this.heap = [];
  }

  push(item, priority) {
    this.heap.push({ item, priority });
    this._bubbleUp(this.heap.length - 1);
  }

  pop() {
    if (this.heap.length === 0) {
      return null;
    }
    if (this.heap.length === 1) {
      return this.heap.pop();
    }
    const min = this.heap[0];
    this.heap[0] = this.heap.pop();
    this._bubbleDown(0);
    return min;
  }

  isEmpty() {
    return this.heap.length === 0;
  }

  _bubbleUp(index) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.heap[parent].priority <= this.heap[index].priority) {
        break;
      }
      [this.heap[parent], this.heap[index]] = [this.heap[index], this.heap[parent]];
      index = parent;
    }
  }

  _bubbleDown(index) {
    const length = this.heap.length;
    while (true) {
      let smallest = index;
      const left = index * 2 + 1;
      const right = index * 2 + 2;

      if (left < length && this.heap[left].priority < this.heap[smallest].priority) {
        smallest = left;
      }
      if (right < length && this.heap[right].priority < this.heap[smallest].priority) {
        smallest = right;
      }
      if (smallest === index) {
        break;
      }
      [this.heap[smallest], this.heap[index]] = [this.heap[index], this.heap[smallest]];
      index = smallest;
    }
  }
}

export function buildAdjacency(edges) {
  const adjacency = new Map();
  for (const { from, to } of edges) {
    if (!adjacency.has(from)) {
      adjacency.set(from, []);
    }
    adjacency.get(from).push(to);
    if (!adjacency.has(to)) {
      adjacency.set(to, []);
    }
  }
  return adjacency;
}

export function computeDepths(adjacency, start) {
  const depths = new Map();
  const queue = [start];
  let index = 0;
  depths.set(start, 0);

  while (index < queue.length) {
    const node = queue[index++];
    const depth = depths.get(node);
    const neighbors = adjacency.get(node) || [];

    for (const neighbor of neighbors) {
      if (!depths.has(neighbor)) {
        depths.set(neighbor, depth + 1);
        queue.push(neighbor);
      }
    }
  }

  return depths;
}

function reconstructPath(prev, start, goal) {
  const path = [];
  let current = goal;
  while (current !== null) {
    path.push(current);
    if (current === start) {
      break;
    }
    current = prev.get(current) ?? null;
  }
  if (path[path.length - 1] !== start) {
    return [];
  }
  return path.reverse();
}

export function dijkstra({ adjacency, start, goal, weightForNode }) {
  const distances = new Map();
  const prev = new Map();
  const pq = new MinPriorityQueue();
  let nodesExplored = 0;

  distances.set(start, 0);
  pq.push(start, 0);

  while (!pq.isEmpty()) {
    const { item: node, priority: dist } = pq.pop();
    const known = distances.get(node);
    if (known !== dist) {
      continue;
    }

    nodesExplored++;

    if (node === goal) {
      break;
    }

    const neighbors = adjacency.get(node) || [];
    for (const neighbor of neighbors) {
      const weight = weightForNode(neighbor);
      const nextDist = dist + weight;
      const current = distances.get(neighbor);
      if (current === undefined || nextDist < current) {
        distances.set(neighbor, nextDist);
        prev.set(neighbor, node);
        pq.push(neighbor, nextDist);
      }
    }
  }

  const path = reconstructPath(prev, start, goal);
  const totalCost = distances.get(goal) ?? Infinity;

  return { path, totalCost, nodesExplored };
}

export function aStar({ adjacency, start, goal, weightForNode, heuristic }) {
  const distances = new Map();
  const prev = new Map();
  const pq = new MinPriorityQueue();
  let nodesExplored = 0;

  distances.set(start, 0);
  pq.push(start, heuristic(start));

  while (!pq.isEmpty()) {
    const { item: node, priority } = pq.pop();
    const currentDist = distances.get(node);
    if (currentDist === undefined) {
      continue;
    }
    const expectedPriority = currentDist + heuristic(node);
    if (priority !== expectedPriority) {
      continue;
    }

    nodesExplored++;

    if (node === goal) {
      break;
    }

    const neighbors = adjacency.get(node) || [];
    for (const neighbor of neighbors) {
      const weight = weightForNode(neighbor);
      const nextDist = currentDist + weight;
      const known = distances.get(neighbor);
      if (known === undefined || nextDist < known) {
        distances.set(neighbor, nextDist);
        prev.set(neighbor, node);
        pq.push(neighbor, nextDist + heuristic(neighbor));
      }
    }
  }

  const path = reconstructPath(prev, start, goal);
  const totalCost = distances.get(goal) ?? Infinity;

  return { path, totalCost, nodesExplored };
}
