import type PatchEntry from '../../artifacts/PatchEntry.ts';
import ConeRecordError from '../../errors/ConeRecordError.ts';
import { compareStrings } from '../../utils/StringComparison.ts';
import type ConePatchFeedPort from '../../../ports/ConePatchFeedPort.ts';
import type ConeRecordStorePort from '../../../ports/ConeRecordStorePort.ts';
import ConeBasis from './ConeBasis.ts';
import ConeContendedObstruction from './ConeContendedObstruction.ts';
import ConeFold from './ConeFold.ts';
import ConeFoldSession from './ConeFoldSession.ts';
import type ConeFrontier from './ConeFrontier.ts';
import ConeIngestAdvanced from './ConeIngestAdvanced.ts';
import ConeIngestCurrent from './ConeIngestCurrent.ts';
import ConeIngestObstructed from './ConeIngestObstructed.ts';
import type ConeIngestOutcome from './ConeIngestOutcome.ts';
import ConeObstruction from './ConeObstruction.ts';
import ConeSharedDotObstruction from './ConeSharedDotObstruction.ts';
import ConeWriterDivergedObstruction from './ConeWriterDivergedObstruction.ts';
import ConeWriterPosition from './ConeWriterPosition.ts';
import type StoredConeBasis from './StoredConeBasis.ts';

/** Publication attempts before an advance reports contention. */
export const CONE_INGEST_ATTEMPTS = 4;

type Progress = { readonly frontier: ConeFrontier; readonly folded: number };

/**
 * Advances a lane's cone basis to its writers' tips.
 *
 * For each writer whose tip differs from the folded frontier, the feed lists
 * the new range once and decodes each patch once; patches fold in writer
 * chain order, writers in id order (any interleaving is equivalent because
 * every per-element join is commutative and idempotent). The new root and
 * frontier publish with compare-and-swap; a lost race re-reads the head and
 * retries. Nothing is published when any patch is obstructed.
 */
export default class ConeIngest {
  readonly #store: ConeRecordStorePort;
  readonly #feed: ConePatchFeedPort;
  readonly #lane: string;
  readonly #attempts: number;

  constructor(options: {
    readonly store: ConeRecordStorePort;
    readonly feed: ConePatchFeedPort;
    readonly lane: string;
    readonly attempts?: number;
  }) {
    this.#store = options.store;
    this.#feed = options.feed;
    this.#lane = options.lane;
    this.#attempts = options.attempts ?? CONE_INGEST_ATTEMPTS;
    if (!Number.isSafeInteger(this.#attempts) || this.#attempts < 1) {
      throw new ConeRecordError('Cone ingest needs at least one attempt');
    }
    Object.freeze(this);
  }

  /** Folds every patch new since the published frontier. */
  async advance(): Promise<ConeIngestOutcome> {
    for (let attempt = 0; attempt < this.#attempts; attempt += 1) {
      const outcome = await this.#attemptAdvance();
      if (outcome !== null) {
        return outcome;
      }
    }
    return new ConeIngestObstructed(new ConeContendedObstruction(this.#lane, this.#attempts));
  }

  /**
   * Folds one patch this clone just committed on top of `parentSha`. When the
   * basis has not folded that parent, or another fold wins the head, this
   * falls back to a full advance, which also folds the patch.
   */
  async foldCommitted(entry: PatchEntry, parentSha: string | null): Promise<ConeIngestOutcome> {
    const { stored, basis } = await this.#readBasis();
    const folded = foldedSha(basis.frontier, entry.patch.writer);
    if (folded === entry.sha) {
      return new ConeIngestCurrent(stored, basis);
    }
    if (folded !== parentSha) {
      return await this.advance();
    }
    const session = new ConeFoldSession({ store: this.#store, root: basis.root });
    const result = await this.#foldEntries(session, { frontier: basis.frontier, folded: 0 }, [entry]);
    if (result instanceof ConeObstruction) {
      return new ConeIngestObstructed(result);
    }
    const published = await this.#publish({ session, stored, progress: result });
    return published ?? await this.advance();
  }

  async #readBasis(): Promise<{ readonly stored: StoredConeBasis | null; readonly basis: ConeBasis }> {
    const stored = await this.#store.readBasis(this.#lane);
    return { stored, basis: stored === null ? ConeBasis.empty() : stored.basis };
  }

  async #attemptAdvance(): Promise<ConeIngestOutcome | null> {
    const { stored, basis } = await this.#readBasis();
    const behind = writersBehind(basis.frontier, await this.#feed.writerTips(this.#lane));
    if (behind.length === 0) {
      return new ConeIngestCurrent(stored, basis);
    }
    const session = new ConeFoldSession({ store: this.#store, root: basis.root });
    let progress: Progress = { frontier: basis.frontier, folded: 0 };
    for (const [writerId, tipSha] of behind) {
      const next = await this.#foldWriter(session, progress, { writerId, tipSha });
      if (next instanceof ConeObstruction) {
        return new ConeIngestObstructed(next);
      }
      progress = next;
    }
    return await this.#publish({ session, stored, progress });
  }

  async #foldWriter(
    session: ConeFoldSession,
    progress: Progress,
    writer: { readonly writerId: string; readonly tipSha: string },
  ): Promise<Progress | ConeObstruction> {
    const fromSha = foldedSha(progress.frontier, writer.writerId);
    const range = await this.#feed.patchesAfter(this.#lane, writer.writerId, { fromSha, toSha: writer.tipSha });
    if (range instanceof ConeWriterDivergedObstruction) {
      return range;
    }
    return await this.#foldEntries(session, progress, range.entries);
  }

  async #foldEntries(
    session: ConeFoldSession,
    start: Progress,
    entries: readonly PatchEntry[],
  ): Promise<Progress | ConeObstruction> {
    let progress = start;
    for (const entry of entries) {
      const result = await ConeFold.fold(session, entry);
      if (result instanceof ConeSharedDotObstruction) {
        return result;
      }
      const position = new ConeWriterPosition(entry.sha, entry.patch.lamport);
      progress = { frontier: progress.frontier.advanced(entry.patch.writer, position), folded: progress.folded + 1 };
    }
    return progress;
  }

  async #publish(run: {
    readonly session: ConeFoldSession;
    readonly stored: StoredConeBasis | null;
    readonly progress: Progress;
  }): Promise<ConeIngestAdvanced | null> {
    const basis = new ConeBasis(await run.session.commit(), run.progress.frontier);
    const published = await this.#store.publishBasis(this.#lane, basis, run.stored);
    return published === null ? null : new ConeIngestAdvanced(published, run.progress.folded);
  }
}

/** The last folded patch of a writer, or null when none is folded. */
function foldedSha(frontier: ConeFrontier, writerId: string): string | null {
  const position = frontier.position(writerId);
  return position === null ? null : position.sha;
}

/** Writers whose tip differs from the folded frontier, in writer-id order. */
function writersBehind(frontier: ConeFrontier, tips: ReadonlyMap<string, string>): Array<readonly [string, string]> {
  return [...tips]
    .filter(([writerId, tipSha]) => foldedSha(frontier, writerId) !== tipSha)
    .sort(([left], [right]) => compareStrings(left, right));
}
