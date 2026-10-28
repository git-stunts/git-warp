import ConeObstruction from './ConeObstruction.ts';

/**
 * A writer's tip no longer descends from the position the basis folded, so
 * the folded patches are not a prefix of the chain. Folds cannot be undone;
 * the clone must rebuild its cone basis from the writer chains.
 */
export default class ConeWriterDivergedObstruction extends ConeObstruction {
  readonly code = 'E_CONE_WRITER_DIVERGED';
  readonly writerId: string;
  readonly foldedSha: string | null;
  readonly tipSha: string;

  constructor(fields: { readonly writerId: string; readonly foldedSha: string | null; readonly tipSha: string }) {
    super();
    this.writerId = fields.writerId;
    this.foldedSha = fields.foldedSha;
    this.tipSha = fields.tipSha;
    Object.freeze(this);
  }

  describe(): string {
    return `Writer ${this.writerId} tip ${this.tipSha} does not descend from folded patch `
      + `${this.foldedSha ?? '(none)'}; rebuild the cone basis`;
  }
}
