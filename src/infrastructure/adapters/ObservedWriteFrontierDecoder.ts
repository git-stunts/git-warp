import InvalidWriteObservationError from '../../domain/errors/InvalidWriteObservationError.ts';
import ObservedWriteFrontier from '../../domain/types/ObservedWriteFrontier.ts';
import ObservedWriterHead from '../../domain/types/ObservedWriterHead.ts';

type RawRecord = { readonly [key: string]: unknown };

/** Optional legacy-compatible wire metadata becomes protected runtime observation. */
export default function decodeObservedWriteFrontier(decoded: unknown): ObservedWriteFrontier | undefined {
  const patch = record(decoded);
  const value = patch['observedFrontier'];
  if (value === undefined) { return undefined; }
  const frontier = record(value);
  const { heads } = frontier;
  if (!Array.isArray(heads)) { throw new InvalidWriteObservationError('Observed frontier heads must be an array'); }
  return new ObservedWriteFrontier(text(frontier['graphName']), heads.map(readHead));
}

function readHead(value: unknown): ObservedWriterHead {
  const head = record(value);
  const { lamport } = head;
  if (typeof lamport !== 'number') { throw new InvalidWriteObservationError('Observed head requires a numeric clock'); }
  return new ObservedWriterHead(text(head['writerId']), text(head['patchSha']), lamport);
}

function record(value: unknown): RawRecord {
  if (!isRecord(value)) {
    throw new InvalidWriteObservationError('Observed frontier metadata requires an object');
  }
  return value;
}

function isRecord(value: unknown): value is RawRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): string {
  if (typeof value !== 'string') { throw new InvalidWriteObservationError('Observed frontier identity must be a string'); }
  return value;
}
