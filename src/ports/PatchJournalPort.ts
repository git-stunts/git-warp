import type Patch from '../domain/types/Patch.ts';
import type WarpStream from '../domain/stream/WarpStream.ts';
import type PatchEntry from '../domain/artifacts/PatchEntry.ts';

/**
 * Port for patch journal persistence.
 *
 * Domain-facing port that speaks Patch domain objects. No bytes cross
 * this boundary. The adapter implementation owns the codec and talks to
 * the raw Git ports (BlobPort, BlobStoragePort) internally.
 *
 * This is part of the two-stage persistence boundary (P5 compliance):
 *   Domain Service -> PatchJournalPort (domain objects)
 *     -> Adapter (codec + raw Git ports) -> Git
 *
 * @see CborPatchJournalAdapter - Reference implementation
 */

export interface ReadPatchOptions {
  encrypted?: boolean;
}

/** Port for patch journal persistence. */
export default abstract class PatchJournalPort {
  /** Persists a patch and returns its storage OID. */
  abstract writePatch(_patch: Patch): Promise<string>;

  /** Reads a patch by its storage OID. */
  abstract readPatch(_patchOid: string, _options?: ReadPatchOptions): Promise<Patch>;

  /**
   * Whether this journal uses external blob storage.
   *
   * When true, readers must use the `encrypted` flag in the commit
   * message trailer to retrieve blobs via BlobStoragePort rather than
   * reading them directly from Git.
   */
  get usesExternalStorage(): boolean {
    return false;
  }

  /**
   * Scans patches in a writer's chain between two SHAs, yielding
   * PatchEntry instances in chronological order (oldest first).
   *
   * This is the unbounded streaming alternative to the legacy
   * loadPatchRange() which returns a whole array.
   */
  abstract scanPatchRange(
    _writerId: string,
    _fromSha: string | null,
    _toSha: string,
  ): WarpStream<PatchEntry>;
}
