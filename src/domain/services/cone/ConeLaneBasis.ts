import type PatchEntry from '../../artifacts/PatchEntry.ts';
import type ConePatchFeedPort from '../../../ports/ConePatchFeedPort.ts';
import type ConeRecordStorePort from '../../../ports/ConeRecordStorePort.ts';
import type ConeBasis from './ConeBasis.ts';
import ConeIngest from './ConeIngest.ts';
import type ConeObstruction from './ConeObstruction.ts';
import ConeReader from './ConeReader.ts';

/**
 * One lane's cone basis, as the public read and write paths use it (#1039).
 *
 * `advance()` folds every patch new since the published frontier and answers
 * the basis that results, or the obstruction that stopped it; a lane with no
 * basis yet starts from the empty basis, so nothing has to be prepared first.
 * `foldCommitted()` keeps this clone's own writes folded at commit time.
 */
export default class ConeLaneBasis {
  readonly lane: string;
  readonly reader: ConeReader;
  readonly #ingest: ConeIngest;

  constructor(options: {
    readonly store: ConeRecordStorePort;
    readonly feed: ConePatchFeedPort;
    readonly lane: string;
  }) {
    this.lane = options.lane;
    this.reader = new ConeReader(options.store);
    this.#ingest = new ConeIngest({ store: options.store, feed: options.feed, lane: options.lane });
    Object.freeze(this);
  }

  /** Advances to the writers' tips and answers the resulting basis. */
  async advance(): Promise<ConeBasis | ConeObstruction> {
    return (await this.#ingest.advance()).settled();
  }

  /** Folds a patch this clone just committed on top of `parentSha`. */
  async foldCommitted(entry: PatchEntry, parentSha: string | null): Promise<ConeBasis | ConeObstruction> {
    return (await this.#ingest.foldCommitted(entry, parentSha)).settled();
  }
}
