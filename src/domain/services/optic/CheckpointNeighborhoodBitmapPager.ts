import QueryError from '../../errors/QueryError.ts';
import { getRoaringBitmap32, type RoaringBitmapSubset } from '../../utils/roaring.ts';
import toBytes from '../../utils/toBytes.ts';
import type { Direction } from '../../../ports/NeighborProviderPort.ts';
import type { NeighborhoodOpticEdge } from './NeighborhoodOpticReadResult.ts';
import type { NeighborhoodCandidatePosition } from './NeighborhoodPageCursor.ts';

export type DecodedNeighborhoodEdgeShard = Record<
  string,
  Record<string, Uint8Array | ArrayLike<number>>
>;

export type NeighborhoodLabelRegistry = {
  readonly byId: ReadonlyMap<number, string>;
  readonly byName: ReadonlyMap<string, number>;
};

export type NeighborhoodBitmapCandidate = NeighborhoodCandidatePosition & {
  readonly bitmap: RoaringBitmapSubset;
  readonly index: number;
};

export type NeighborhoodBitmapPageSource = {
  readCandidateHeap(options: {
    readonly after: NeighborhoodCandidatePosition | null;
    readonly direction: 'in' | 'out';
    readonly labels: NeighborhoodLabelRegistry;
    readonly nodeId: string;
    readonly requestedLabels: readonly string[];
    readonly sourceGlobalId: number;
  }): Promise<NeighborhoodBitmapCandidate[]>;
  resolveLiveNode(globalId: number): Promise<string | null>;
};

type NeighborhoodCollectOptions = {
  readonly after: NeighborhoodCandidatePosition | null;
  readonly direction: Direction;
  readonly labels: NeighborhoodLabelRegistry;
  readonly limit: number;
  readonly loader: NeighborhoodBitmapPageSource;
  readonly nodeId: string;
  readonly requestedLabels: readonly string[];
  readonly sourceGlobalId: number;
};

export type NeighborhoodBitmapPageResult = {
  readonly edges: NeighborhoodOpticEdge[];
  readonly hasMore: boolean;
  readonly last: NeighborhoodCandidatePosition | null;
  readonly resumeAfter: Array<NeighborhoodCandidatePosition | null>;
};

export async function collectNeighborhoodBitmapPage(
  options: NeighborhoodCollectOptions,
): Promise<NeighborhoodBitmapPageResult> {
  const edges: NeighborhoodOpticEdge[] = [];
  const resumeAfter: Array<NeighborhoodCandidatePosition | null> = [];
  let last = options.after;
  for (const direction of readableDirections(options.direction, options.after)) {
    const result = await collectDirection({ direction, edges, initialLast: last, options, resumeAfter });
    if (result.hasMore) {
      return { edges, resumeAfter, ...result };
    }
    last = result.last;
  }
  return { edges, hasMore: false, last, resumeAfter };
}

export function createNeighborhoodCandidateHeap(
  buckets: DecodedNeighborhoodEdgeShard,
  options: {
    readonly after: NeighborhoodCandidatePosition | null;
    readonly direction: 'in' | 'out';
    readonly labels: NeighborhoodLabelRegistry;
    readonly requestedLabels: readonly string[];
    readonly sourceGlobalId: number;
  },
): NeighborhoodBitmapCandidate[] {
  const heap: NeighborhoodBitmapCandidate[] = [];
  for (const [label, labelId] of selectedLabels(buckets, options.labels, options.requestedLabels)) {
    addLabelBitmap(heap, buckets, { ...options, label, labelId });
  }
  return heap;
}

async function collectDirection(
  context: {
    readonly direction: 'in' | 'out';
    readonly edges: NeighborhoodOpticEdge[];
    readonly initialLast: NeighborhoodCandidatePosition | null;
    readonly options: NeighborhoodCollectOptions;
    readonly resumeAfter: Array<NeighborhoodCandidatePosition | null>;
  },
): Promise<Omit<NeighborhoodBitmapPageResult, 'edges' | 'resumeAfter'>> {
  const { direction, edges, options } = context;
  const heap = await options.loader.readCandidateHeap({ ...options, direction });
  let last = context.initialLast;
  while (heap.length > 0) {
    const candidate = popAndAdvance(heap);
    const neighborId = await options.loader.resolveLiveNode(candidate.globalId);
    if (neighborId === null) {
      continue;
    }
    if (edges.length === options.limit) {
      return { hasMore: true, last };
    }
    context.resumeAfter.push(last);
    edges.push(Object.freeze({ direction, neighborId, label: candidate.label }));
    last = candidatePosition(candidate);
  }
  return { hasMore: false, last };
}

function addLabelBitmap(
  heap: NeighborhoodBitmapCandidate[],
  buckets: DecodedNeighborhoodEdgeShard,
  options: {
    readonly after: NeighborhoodCandidatePosition | null;
    readonly direction: 'in' | 'out';
    readonly label: string;
    readonly labelId: number;
    readonly sourceGlobalId: number;
  },
): void {
  const bytes = buckets[String(options.labelId)]?.[String(options.sourceGlobalId)];
  if (bytes === undefined) {
    return;
  }
  const bitmap = getRoaringBitmap32().deserialize(toBytes(bytes), true);
  const index = firstCandidateIndex(bitmap, options);
  if (index < bitmap.size) {
    heapPush(heap, candidateAt(bitmap, index, options));
  }
}

function candidateAt(
  bitmap: RoaringBitmapSubset,
  index: number,
  options: { readonly direction: 'in' | 'out'; readonly label: string },
): NeighborhoodBitmapCandidate {
  return {
    direction: options.direction,
    globalId: bitmapValueAt(bitmap, index),
    label: options.label,
    bitmap,
    index,
  };
}

function selectedLabels(
  buckets: DecodedNeighborhoodEdgeShard,
  registry: NeighborhoodLabelRegistry,
  requested: readonly string[],
): readonly (readonly [string, number])[] {
  if (requested.length > 0) {
    return Object.freeze(requested.flatMap((label) => {
      const id = registry.byName.get(label);
      return id === undefined ? [] : [[label, id] as [string, number]];
    }));
  }
  return labelsPresentInShard(buckets, registry);
}

function labelsPresentInShard(
  buckets: DecodedNeighborhoodEdgeShard,
  registry: NeighborhoodLabelRegistry,
): readonly (readonly [string, number])[] {
  return Object.freeze(Object.keys(buckets)
    .filter((bucket) => bucket !== 'all')
    .map((bucket) => [registry.byId.get(Number.parseInt(bucket, 10)), Number.parseInt(bucket, 10)] as const)
    .filter((entry): entry is readonly [string, number] => entry[0] !== undefined)
    .sort(([left], [right]) => compareText(left, right)));
}

function firstCandidateIndex(
  bitmap: RoaringBitmapSubset,
  options: {
    readonly after: NeighborhoodCandidatePosition | null;
    readonly direction: 'in' | 'out';
    readonly label: string;
  },
): number {
  const { after } = options;
  if (after === null || directionOrder(options.direction) > directionOrder(after.direction)) {
    return 0;
  }
  if (directionOrder(options.direction) < directionOrder(after.direction)) {
    return bitmap.size;
  }
  return compareText(options.label, after.label) <= 0
    ? bitmap.rank(after.globalId)
    : rankBefore(bitmap, after.globalId);
}

function rankBefore(bitmap: RoaringBitmapSubset, value: number): number {
  return value === 0 ? 0 : bitmap.rank(value - 1);
}

function popAndAdvance(heap: NeighborhoodBitmapCandidate[]): NeighborhoodBitmapCandidate {
  const candidate = heapPop(heap);
  const nextIndex = candidate.index + 1;
  if (nextIndex < candidate.bitmap.size) {
    heapPush(heap, {
      ...candidate,
      globalId: bitmapValueAt(candidate.bitmap, nextIndex),
      index: nextIndex,
    });
  }
  return candidate;
}

function bitmapValueAt(bitmap: RoaringBitmapSubset, index: number): number {
  const value = bitmap.at(index);
  if (value === undefined) {
    throw new QueryError('Neighborhood bitmap rank resolved outside the candidate set.', {
      code: 'E_OPTIC_BASIS_INVALID',
    });
  }
  return value;
}

function heapPush(
  heap: NeighborhoodBitmapCandidate[],
  candidate: NeighborhoodBitmapCandidate,
): void {
  heap.push(candidate);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (compareCandidates(heap[parent]!, heap[index]!) <= 0) {
      return;
    }
    [heap[parent], heap[index]] = [heap[index]!, heap[parent]!];
    index = parent;
  }
}

function heapPop(heap: NeighborhoodBitmapCandidate[]): NeighborhoodBitmapCandidate {
  const [first] = heap;
  const last = heap.pop();
  if (first === undefined || last === undefined) {
    throw new QueryError('Neighborhood bitmap candidate heap is empty.', { code: 'E_OPTIC_BASIS_INVALID' });
  }
  if (heap.length > 0) {
    heap[0] = last;
    heapSiftDown(heap);
  }
  return first;
}

function heapSiftDown(heap: NeighborhoodBitmapCandidate[]): void {
  let index = 0;
  while (true) {
    const child = smallerChildIndex(heap, index);
    if (child === null || compareCandidates(heap[index]!, heap[child]!) <= 0) {
      return;
    }
    [heap[index], heap[child]] = [heap[child]!, heap[index]!];
    index = child;
  }
}

function smallerChildIndex(heap: NeighborhoodBitmapCandidate[], parent: number): number | null {
  const left = parent * 2 + 1;
  if (left >= heap.length) {
    return null;
  }
  const right = left + 1;
  return right < heap.length && compareCandidates(heap[right]!, heap[left]!) < 0
    ? right
    : left;
}

function compareCandidates(
  left: NeighborhoodCandidatePosition,
  right: NeighborhoodCandidatePosition,
): number {
  return directionOrder(left.direction) - directionOrder(right.direction)
    || left.globalId - right.globalId
    || compareText(left.label, right.label);
}

function candidatePosition(
  candidate: NeighborhoodCandidatePosition,
): NeighborhoodCandidatePosition {
  return Object.freeze({
    direction: candidate.direction,
    globalId: candidate.globalId,
    label: candidate.label,
  });
}

function readableDirections(
  direction: Direction,
  after: NeighborhoodCandidatePosition | null,
): readonly ('in' | 'out')[] {
  return requestedDirections(direction).filter((candidate) => (
    after === null || directionOrder(candidate) >= directionOrder(after.direction)
  ));
}

function requestedDirections(direction: Direction): readonly ('in' | 'out')[] {
  return direction === 'both' ? Object.freeze(['in', 'out']) : Object.freeze([direction]);
}

function directionOrder(direction: 'in' | 'out'): number {
  return direction === 'in' ? 0 : 1;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
