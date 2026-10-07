import InvalidWriteObservationError from '../errors/InvalidWriteObservationError.ts';
import { compareStrings } from '../utils/StringComparison.ts';
import ObservedWriterHead from './ObservedWriterHead.ts';

/** Directly inspected heads, without claiming an atomic cross-writer snapshot. */
export default class ObservedWriteFrontier {
  readonly graphName: string;
  readonly heads: readonly ObservedWriterHead[];

  constructor(graphName: string, heads: readonly ObservedWriterHead[]) {
    validateGraph(graphName, heads);
    validateHeads(heads);
    this.graphName = graphName;
    this.heads = Object.freeze([...heads].sort((left, right) => compareStrings(left.writerId, right.writerId)));
    Object.freeze(this);
  }

  frontier(): Map<string, string> {
    return new Map(this.heads.map(head => [head.writerId, head.patchSha]));
  }

  maxLamport(): number {
    return this.heads.reduce((maximum, head) => Math.max(maximum, head.lamport), 0);
  }
}

function validateGraph(graphName: string, heads: readonly ObservedWriterHead[]): void {
  if (typeof graphName !== 'string' || graphName.length === 0 || !Array.isArray(heads)) {
    throw new InvalidWriteObservationError('Observed frontier requires a graph and inspected heads');
  }
}

function validateHeads(heads: readonly ObservedWriterHead[]): void {
  const writers = new Set<string>();
  for (const head of heads) {
    if (!(head instanceof ObservedWriterHead) || writers.has(head.writerId)) {
      throw new InvalidWriteObservationError('Observed frontier requires one validated head per writer');
    }
    writers.add(head.writerId);
  }
}
