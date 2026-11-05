import type Coordinate from './Coordinate.ts';
import type WriteAdmission from './WriteAdmission.ts';
import type WriteOccurrence from './WriteOccurrence.ts';
import type WritePublication from './WritePublication.ts';

/** Published and durably retained: `coordinate` binds the observation that justified the write. */
export default class RetainedWriteReceipt {
  readonly operation: 'write' = 'write';
  readonly graph: string;
  readonly writer: string;
  readonly outcome: WriteAdmission;
  readonly occurrences: readonly WriteOccurrence[];
  readonly publication: WritePublication;
  readonly coordinate: Coordinate;

  constructor(fields: {
    readonly graph: string;
    readonly writer: string;
    readonly outcome: WriteAdmission;
    readonly occurrences: readonly WriteOccurrence[];
    readonly publication: WritePublication;
    readonly coordinate: Coordinate;
  }) {
    this.graph = fields.graph;
    this.writer = fields.writer;
    this.outcome = fields.outcome;
    this.occurrences = Object.freeze([...fields.occurrences]);
    this.publication = fields.publication;
    this.coordinate = fields.coordinate;
    Object.freeze(this);
  }
}
