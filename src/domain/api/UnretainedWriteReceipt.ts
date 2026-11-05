import type WriteAdmission from './WriteAdmission.ts';
import type WriteOccurrence from './WriteOccurrence.ts';
import type WritePublication from './WritePublication.ts';

/** Published, but its durable retention did not complete. This is not an unapplied write: do not submit it again. */
export default class UnretainedWriteReceipt {
  readonly operation: 'write' = 'write';
  readonly graph: string;
  readonly writer: string;
  readonly outcome: WriteAdmission;
  readonly occurrences: readonly WriteOccurrence[];
  readonly publication: WritePublication;
  /** Why no Coordinate was issued. */
  readonly retention: string;
  /** Opaque evidence naming the attempt: `AuthoredWarp.reconcile` may still retain it, unless null means it never can. */
  readonly attempt: string | null;

  constructor(fields: {
    readonly graph: string;
    readonly writer: string;
    readonly outcome: WriteAdmission;
    readonly occurrences: readonly WriteOccurrence[];
    readonly publication: WritePublication;
    readonly retention: string;
    readonly attempt: string | null;
  }) {
    this.graph = fields.graph;
    this.writer = fields.writer;
    this.outcome = fields.outcome;
    this.occurrences = Object.freeze([...fields.occurrences]);
    this.publication = fields.publication;
    this.retention = fields.retention;
    this.attempt = fields.attempt;
    Object.freeze(this);
  }
}
