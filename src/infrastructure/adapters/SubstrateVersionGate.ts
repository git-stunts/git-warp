import WarpError from '../../domain/errors/WarpError.ts';
import {
  buildSubstrateVersionRef,
  buildWritersPrefix,
  REF_PREFIX,
  validateGraphName,
} from '../../domain/utils/RefLayout.ts';
import { textDecode, textEncode } from '../../domain/utils/bytes.ts';
import type CommitMessageCodecPort from '../../ports/CommitMessageCodecPort.ts';

export const CURRENT_SUBSTRATE_MARKER = 'git-warp-retained-substrate\nversion: 21\n';

/** The v19/v20 marker: lane history is current, strands still use the pre-worldline layout (#1014). */
export const PRE_WORLDLINE_SUBSTRATE_MARKER = 'git-warp-retained-substrate\nversion: 19\n';

type SubstrateVersionHistory = {
  compareAndSwapRef(ref: string, newOid: string, expectedOid: string | null): Promise<void>;
  listRefs(prefix: string, options?: { readonly limit?: number }): Promise<string[]>;
  readBlob(oid: string): Promise<Uint8Array>;
  readObjectType(oid: string): Promise<string>;
  readRef(ref: string): Promise<string | null>;
  showNode(sha: string): Promise<string>;
  writeBlob(content: Uint8Array | string): Promise<string>;
};

/** What the writer heads of an unmarked timeline show about its substrate. */
type UnmarkedEvidence = 'legacy-patch-commits' | 'current-patch-commits' | 'no-writer-patches';

/** Refuses retained state that has not crossed the current migration boundary. */
export default class SubstrateVersionGate {
  readonly #checks = new Map<string, Promise<void>>();
  readonly #history: SubstrateVersionHistory;
  readonly #codec: CommitMessageCodecPort;

  constructor(history: SubstrateVersionHistory, codec: CommitMessageCodecPort) {
    this.#history = history;
    this.#codec = codec;
  }

  ensure(graphName: string): Promise<void> {
    validateGraphName(graphName);
    const existing = this.#checks.get(graphName);
    if (existing !== undefined) {
      return existing;
    }
    const check = this.#ensureOnce(graphName);
    this.#checks.set(graphName, check);
    void check.catch(() => {
      if (this.#checks.get(graphName) === check) {
        this.#checks.delete(graphName);
      }
    });
    return check;
  }

  async #ensureOnce(graphName: string): Promise<void> {
    const markerRef = buildSubstrateVersionRef(graphName);
    const markerOid = await this.#history.readRef(markerRef);
    if (markerOid !== null) {
      await this.#requireCurrentMarker(markerRef, markerOid);
      return;
    }

    const refs = await this.#history.listRefs(`${REF_PREFIX}/${graphName}/`, { limit: 1 });
    if (refs.length > 0) {
      throw await this.#unmarkedFailure(graphName, markerRef);
    }

    const newMarkerOid = await this.#history.writeBlob(textEncode(CURRENT_SUBSTRATE_MARKER));
    try {
      await this.#history.compareAndSwapRef(markerRef, newMarkerOid, null);
    } catch (error) {
      const concurrentMarker = await this.#history.readRef(markerRef);
      if (concurrentMarker === null) {
        throw error;
      }
      await this.#requireCurrentMarker(markerRef, concurrentMarker);
    }
  }

  async #unmarkedFailure(graphName: string, markerRef: string): Promise<WarpError> {
    const evidence = await this.#unmarkedEvidence(graphName);
    return evidence === 'legacy-patch-commits'
      ? migrationRequired(graphName)
      : markerMissing(graphName, markerRef, evidence);
  }

  /**
   * Marker absence alone does not prove legacy data: a receiver may have
   * fetched current writer chains without the marker. Only a writer head whose
   * patch commit lacks the current git-cas storage route confirms pre-migration data.
   */
  async #unmarkedEvidence(graphName: string): Promise<UnmarkedEvidence> {
    let evidence: UnmarkedEvidence = 'no-writer-patches';
    for (const ref of await this.#history.listRefs(buildWritersPrefix(graphName))) {
      const head = await this.#history.readRef(ref);
      const message = head === null ? '' : await this.#history.showNode(head);
      if (this.#codec.detectKind(message) === 'patch') {
        if (!this.#isCurrentPatch(message)) { return 'legacy-patch-commits'; }
        evidence = 'current-patch-commits';
      }
    }
    return evidence;
  }

  #isCurrentPatch(message: string): boolean {
    try {
      this.#codec.decodePatch(message);
      return true;
    } catch {
      return false;
    }
  }

  async #requireCurrentMarker(markerRef: string, markerOid: string): Promise<void> {
    const objectType = await this.#history.readObjectType(markerOid);
    const marker = objectType === 'blob'
      ? textDecode(await this.#history.readBlob(markerOid))
      : null;
    if (marker === PRE_WORLDLINE_SUBSTRATE_MARKER) {
      throw worldlineMigrationRequired(markerRef);
    }
    if (marker !== CURRENT_SUBSTRATE_MARKER) {
      throw new WarpError(
        `Unsupported retained-substrate marker at ${markerRef}`,
        'E_SUBSTRATE_VERSION_UNSUPPORTED',
        { context: { markerRef, markerOid, objectType } },
      );
    }
  }
}

function markerMissing(graphName: string, markerRef: string, evidence: UnmarkedEvidence): WarpError {
  return new WarpError(
    `Timeline '${graphName}' has WARP refs but no substrate marker at ${markerRef}. `
      + 'If its writer chains came from another clone, fetch that marker with them '
      + '(see docs/topics/sync.md). git-warp does not create a marker over existing refs.',
    'E_SUBSTRATE_MARKER_MISSING',
    { context: { graphName, markerRef, evidence } },
  );
}

function migrationRequired(graphName: string): WarpError {
  return new WarpError(
    `Timeline '${graphName}' requires the one-shot retained-substrate migration. `
      + 'Run git-warp-v18-to-v19 before opening it with this runtime.',
    'E_SUBSTRATE_MIGRATION_REQUIRED',
    { context: { graphName, migration: 'retained-substrate' } },
  );
}

function worldlineMigrationRequired(markerRef: string): WarpError {
  return new WarpError(
    `Timeline at ${markerRef} uses the v19/v20 substrate. `
      + 'Run the v20-to-v21 worldline migration (docs/migrations/v21) before opening it with this runtime.',
    'E_SUBSTRATE_MIGRATION_REQUIRED',
    { context: { markerRef, migration: 'worldline-dot-mints' } },
  );
}
