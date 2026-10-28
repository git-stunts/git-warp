import ConeBasis from './ConeBasis.ts';
import ConeBasisHead from './ConeBasisHead.ts';
import ConeBasisScope from './ConeBasisScope.ts';

/**
 * The lane basis a strand was forked from, pinned at the strand's base
 * frontier (#1039). Forking publishes it from the lane basis it captured, so
 * it costs nothing; a clone without the pin refolds the base frontier once.
 */
export default class StrandBaseConeScope extends ConeBasisScope {
  readonly head: ConeBasisHead;
  readonly #frontier: ReadonlyMap<string, string>;

  constructor(fields: { readonly lane: string; readonly strandId: string; readonly frontier: ReadonlyMap<string, string> }) {
    super();
    this.head = ConeBasisHead.forStrandBase(fields.lane, fields.strandId);
    this.#frontier = new Map(fields.frontier);
    Object.freeze(this);
  }

  override tips(): Promise<ReadonlyMap<string, string>> {
    return Promise.resolve(this.#frontier);
  }

  override seed(): Promise<ConeBasis> {
    return Promise.resolve(ConeBasis.empty());
  }
}
