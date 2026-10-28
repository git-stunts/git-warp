import type ConeBasis from './ConeBasis.ts';
import ConeBasisHead from './ConeBasisHead.ts';
import ConeBasisScope from './ConeBasisScope.ts';
import type ConeLaneBasis from './ConeLaneBasis.ts';
import type ConeObstruction from './ConeObstruction.ts';
import type ConeTipSource from './ConeTipSource.ts';

/**
 * A strand's cone basis (#1039): its pinned base, with the patches of the
 * strand's own writer chains folded on top. It starts from the base, so the
 * overlay root path-copies the base root and every record the strand never
 * touched stays shared with the base.
 */
export default class StrandConeScope extends ConeBasisScope {
  readonly head: ConeBasisHead;
  readonly #tips: ConeTipSource;
  readonly #base: ConeLaneBasis;

  constructor(fields: {
    readonly lane: string;
    readonly strandId: string;
    readonly tips: ConeTipSource;
    readonly base: ConeLaneBasis;
  }) {
    super();
    this.head = ConeBasisHead.forStrand(fields.lane, fields.strandId);
    this.#tips = fields.tips;
    this.#base = fields.base;
    Object.freeze(this);
  }

  override async tips(): Promise<ReadonlyMap<string, string>> {
    return await this.#tips.tips();
  }

  override async seed(): Promise<ConeBasis | ConeObstruction> {
    return await this.#base.advance();
  }
}
