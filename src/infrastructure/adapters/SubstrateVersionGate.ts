import WarpError from '../../domain/errors/WarpError.ts';
import {
  buildSubstrateVersionRef,
  REF_PREFIX,
  validateGraphName,
} from '../../domain/utils/RefLayout.ts';
import { textDecode, textEncode } from '../../domain/utils/bytes.ts';

export const CURRENT_SUBSTRATE_MARKER = 'git-warp-retained-substrate\nversion: 19\n';

type SubstrateVersionHistory = {
  compareAndSwapRef(ref: string, newOid: string, expectedOid: string | null): Promise<void>;
  listRefs(prefix: string, options?: { readonly limit?: number }): Promise<string[]>;
  readBlob(oid: string): Promise<Uint8Array>;
  readObjectType(oid: string): Promise<string>;
  readRef(ref: string): Promise<string | null>;
  writeBlob(content: Uint8Array | string): Promise<string>;
};

/** Refuses retained state that has not crossed the current migration boundary. */
export default class SubstrateVersionGate {
  readonly #checks = new Map<string, Promise<void>>();
  readonly #history: SubstrateVersionHistory;

  constructor(history: SubstrateVersionHistory) {
    this.#history = history;
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
      throw migrationRequired(graphName);
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

  async #requireCurrentMarker(markerRef: string, markerOid: string): Promise<void> {
    const objectType = await this.#history.readObjectType(markerOid);
    const marker = objectType === 'blob'
      ? textDecode(await this.#history.readBlob(markerOid))
      : null;
    if (marker !== CURRENT_SUBSTRATE_MARKER) {
      throw new WarpError(
        `Unsupported retained-substrate marker at ${markerRef}`,
        'E_SUBSTRATE_VERSION_UNSUPPORTED',
        { context: { markerRef, markerOid, objectType } },
      );
    }
  }
}

function migrationRequired(graphName: string): WarpError {
  return new WarpError(
    `Timeline '${graphName}' requires the one-shot retained-substrate migration. `
      + 'Run git-warp-v18-to-v19 before opening it with this runtime.',
    'E_SUBSTRATE_MIGRATION_REQUIRED',
    { context: { graphName, migration: 'retained-substrate' } },
  );
}
