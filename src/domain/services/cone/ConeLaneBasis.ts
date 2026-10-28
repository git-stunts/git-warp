import type PatchEntry from '../../artifacts/PatchEntry.ts';
import type ConePatchFeedPort from '../../../ports/ConePatchFeedPort.ts';
import type ConeRecordStorePort from '../../../ports/ConeRecordStorePort.ts';
import type ConeBasis from './ConeBasis.ts';
import type ConeBasisScope from './ConeBasisScope.ts';
import ConeIngest from './ConeIngest.ts';
import ConeIngestAdvanced from './ConeIngestAdvanced.ts';
import ConeIngestCurrent from './ConeIngestCurrent.ts';
import type ConeIngestOutcome from './ConeIngestOutcome.ts';
import type ConeObstruction from './ConeObstruction.ts';
import ConeReader from './ConeReader.ts';
import type ConeTipSource from './ConeTipSource.ts';
import LaneConeScope from './LaneConeScope.ts';
import StrandBaseConeScope from './StrandBaseConeScope.ts';
import StrandConeScope from './StrandConeScope.ts';
import type StoredConeBasis from './StoredConeBasis.ts';

type ConePorts = { readonly store: ConeRecordStorePort; readonly feed: ConePatchFeedPort };

/**
 * One Lane's cone basis, as the public read and write paths use it (#1039):
 * a worldline Lane's own basis, or a strand Lane's pinned base with the
 * strand's own patches folded on top.
 *
 * `advance()` folds every patch new since the published frontier and answers
 * the basis that results, or the obstruction that stopped it; a basis with
 * nothing published yet starts from its scope's seed, so nothing has to be
 * prepared first. `foldCommitted()` keeps this clone's own writes folded at
 * commit time. `capture()` advances and keeps the result reachable for a
 * saved Coordinate.
 */
export default class ConeLaneBasis {
  readonly lane: string;
  readonly reader: ConeReader;
  readonly #store: ConeRecordStorePort;
  readonly #ingest: ConeIngest;

  constructor(options: ConePorts & { readonly scope: ConeBasisScope }) {
    this.lane = options.scope.head.lane;
    this.reader = new ConeReader(options.store);
    this.#store = options.store;
    this.#ingest = new ConeIngest({ store: options.store, feed: options.feed, scope: options.scope });
    Object.freeze(this);
  }

  /** A worldline Lane's basis: every writer chain of the lane. */
  static ofLane(options: ConePorts & { readonly lane: string }): ConeLaneBasis {
    return new ConeLaneBasis({ ...options, scope: new LaneConeScope(options.lane) });
  }

  /** The lane basis a strand was forked from, pinned at the strand's base frontier. */
  static ofStrandBase(options: ConePorts & {
    readonly lane: string;
    readonly strandId: string;
    readonly baseFrontier: ReadonlyMap<string, string>;
  }): ConeLaneBasis {
    const { store, feed, lane, strandId } = options;
    return new ConeLaneBasis({ store, feed, scope: new StrandBaseConeScope({ lane, strandId, frontier: options.baseFrontier }) });
  }

  /**
   * A strand Lane's basis: its pinned `base`, plus the strand's own writer
   * chains up to the tips `tips` supplies.
   */
  static ofStrand(options: ConePorts & {
    readonly strandId: string;
    readonly tips: ConeTipSource;
    readonly base: ConeLaneBasis;
  }): ConeLaneBasis {
    const { store, feed, strandId, tips, base } = options;
    return new ConeLaneBasis({ store, feed, scope: new StrandConeScope({ lane: base.lane, strandId, tips, base }) });
  }

  /** Advances to the writers' tips and answers the resulting basis. */
  async advance(): Promise<ConeBasis | ConeObstruction> {
    return (await this.refresh()).settled();
  }

  /**
   * Advances to the writers' tips and answers what the advance did: the
   * patches it folded, that the basis was already current, or the
   * obstruction that stopped it. The bounded basis repair reports it.
   */
  async refresh(): Promise<ConeIngestOutcome> {
    return await this.#ingest.advance();
  }

  /**
   * Advances like `advance()` and keeps the resulting basis reachable, so a
   * Coordinate captured on it still reads after its head moves on and Git
   * prunes unreachable objects.
   */
  async capture(): Promise<ConeBasis | ConeObstruction> {
    const outcome = await this.refresh();
    const stored = publishedBasis(outcome);
    if (stored !== null) {
      await this.#store.retainBasis(this.lane, stored);
    }
    return outcome.settled();
  }

  /**
   * Advances like `advance()` without retaining anything, and answers how to
   * retain the basis it settled on later, once a caller knows it needs it
   * (an entity admission inventory page that leaves a continuation).
   */
  async advanceRetainable(): Promise<{ readonly basis: ConeBasis | ConeObstruction; readonly retain: () => Promise<void> }> {
    const outcome = await this.refresh();
    const stored = publishedBasis(outcome);
    return {
      basis: outcome.settled(),
      retain: async () => {
        if (stored !== null) {
          await this.#store.retainBasis(this.lane, stored);
        }
      },
    };
  }

  /** The bases this lane's captures retained, oldest first. */
  async retainedBases(): Promise<readonly ConeBasis[]> {
    return (await this.#store.readRetainedBases(this.lane)).map((stored) => stored.basis);
  }

  /** Folds a patch this clone just committed on top of `parentSha`. */
  async foldCommitted(entry: PatchEntry, parentSha: string | null): Promise<ConeBasis | ConeObstruction> {
    return (await this.#ingest.foldCommitted(entry, parentSha)).settled();
  }
}

/**
 * The published basis an outcome settled on, or null for an obstruction or
 * for a scope seed nothing is published under yet (an empty basis, or a
 * strand's base, which its own pin already keeps reachable).
 */
function publishedBasis(outcome: ConeIngestOutcome): StoredConeBasis | null {
  if (outcome instanceof ConeIngestAdvanced) {
    return outcome.stored;
  }
  return outcome instanceof ConeIngestCurrent ? outcome.stored : null;
}
