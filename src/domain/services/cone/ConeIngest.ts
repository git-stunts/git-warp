import type PatchEntry from '../../artifacts/PatchEntry.ts';
import ConeRecordError from '../../errors/ConeRecordError.ts';
import { compareStrings } from '../../utils/StringComparison.ts';
import type ConePatchFeedPort from '../../../ports/ConePatchFeedPort.ts';
import type ConeRecordStorePort from '../../../ports/ConeRecordStorePort.ts';
import ConeBasis from './ConeBasis.ts';
import type ConeBasisScope from './ConeBasisScope.ts';
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
 * Advances one cone basis to its writers' tips (#1039). The scope names the
 * basis: the lane's own, a strand's pinned base, or a strand's base plus its
 * own patches; it supplies the tips and the basis to start from.
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
  readonly #scope: ConeBasisScope;
  readonly #attempts: number;

  constructor(options: {
    readonly store: ConeRecordStorePort;
    readonly feed: ConePatchFeedPort;
    readonly scope: ConeBasisScope;
    readonly attempts?: number;
  }) {
    this.#store = options.store;
    this.#feed = options.feed;
    this.#scope = options.scope;
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
    return new ConeIngestObstructed(new ConeContendedObstruction(this.#scope.head.lane, this.#attempts));
  }

  /**
   * Folds one patch this clone just committed on top of `parentSha`. When the
   * basis has not folded that parent, or another fold wins the head, this
   * falls back to a full advance, which also folds the patch.
   */
  async foldCommitted(entry: PatchEntry, parentSha: string | null): Promise<ConeIngestOutcome> {
    const read = await this.#readBasis();
    return read instanceof ConeObstruction ? new ConeIngestObstructed(read) : await this.#foldOnto(read, { entry, parentSha });
  }

  async #foldOnto(
    { stored, basis }: { readonly stored: StoredConeBasis | null; readonly basis: ConeBasis },
    { entry, parentSha }: { readonly entry: PatchEntry; readonly parentSha: string | null },
  ): Promise<ConeIngestOutcome> {
    const folded = foldedSha(basis.frontier, entry.patch.writer);
    if (folded === entry.sha) {
      return new ConeIngestCurrent(stored, basis);
    }
    if (folded !== parentSha) {
      return await this.advance();
    }
    const session = new ConeFoldSession({ store: this.#store, root: basis.root, from: basis.frontier });
    const result = await this.#foldEntries(session, { frontier: basis.frontier, folded: 0 }, [entry]);
    if (result instanceof ConeObstruction) {
      return new ConeIngestObstructed(result);
    }
    const published = await this.#publish({ session, stored, progress: result, from: basis });
    return published ?? await this.advance();
  }

  /** The published basis, or the scope's seed while nothing is published under its head. */
  async #readBasis(): Promise<{ readonly stored: StoredConeBasis | null; readonly basis: ConeBasis } | ConeObstruction> {
    const stored = await this.#store.readBasis(this.#scope.head);
    if (stored !== null) {
      return { stored, basis: stored.basis };
    }
    const seed = await this.#scope.seed();
    return seed instanceof ConeObstruction ? seed : { stored: null, basis: seed };
  }

  async #attemptAdvance(): Promise<ConeIngestOutcome | null> {
    const read = await this.#readBasis();
    if (read instanceof ConeObstruction) {
      return new ConeIngestObstructed(read);
    }
    const { stored, basis } = read;
    const behind = writersBehind(basis.frontier, await this.#scope.tips(this.#feed));
    if (behind.length === 0) {
      return new ConeIngestCurrent(stored, basis);
    }
    const session = new ConeFoldSession({ store: this.#store, root: basis.root, from: basis.frontier });
    let progress: Progress = { frontier: basis.frontier, folded: 0 };
    for (const [writerId, tipSha] of behind) {
      const next = await this.#foldWriter(session, progress, { writerId, tipSha });
      if (next instanceof ConeObstruction) {
        return new ConeIngestObstructed(next);
      }
      progress = next;
    }
    return await this.#publish({ session, stored, progress, from: basis });
  }

  async #foldWriter(
    session: ConeFoldSession,
    progress: Progress,
    writer: { readonly writerId: string; readonly tipSha: string },
  ): Promise<Progress | ConeObstruction> {
    const fromSha = foldedSha(progress.frontier, writer.writerId);
    const range = await this.#feed.patchesAfter(this.#scope.head.lane, writer.writerId, { fromSha, toSha: writer.tipSha });
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
    readonly from: ConeBasis;
  }): Promise<ConeIngestAdvanced | null> {
    const basis = new ConeBasis(await run.session.commit(), run.progress.frontier);
    const published = await this.#store.publishBasis(this.#scope.head, basis, run.stored);
    return published === null ? null : new ConeIngestAdvanced(published, run.progress.folded, run.from);
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
