/**
 * Publication can be neither established nor ruled out, so this is not permission to
 * retry. `AuthoredWarp.reconcile` asks again from the attempt's actual evidence. It usually
 * stays unresolved until a different write by this writer shows what happened.
 */
export default class IndeterminateWriteReceipt {
  readonly operation: 'write' = 'write';
  readonly graph: string;
  readonly writer: string;
  /** Opaque evidence naming the attempt. */
  readonly attempt: string;
  /**
   * What must become known first, such as `publication-unresolved`. With
   * `publication-walk-exhausted` nothing more can become known yet: see `AuthoredWarp.reconcile`.
   */
  readonly requirement: string;

  constructor(fields: {
    readonly graph: string;
    readonly writer: string;
    readonly attempt: string;
    readonly requirement: string;
  }) {
    this.graph = fields.graph;
    this.writer = fields.writer;
    this.attempt = fields.attempt;
    this.requirement = fields.requirement;
    Object.freeze(this);
  }
}
