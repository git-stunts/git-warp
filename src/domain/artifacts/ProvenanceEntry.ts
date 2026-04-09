import WarpError from '../errors/WarpError.ts';

/**
 * A provenance entry from a provenance scan stream.
 *
 * Maps an entity (node or edge) to the set of patch SHAs that
 * produced it. This is the semantic unit yielded by
 * ProvenanceStorePort.scanEntries().
 */
export default class ProvenanceEntry {
  readonly entityId: string;
  readonly patchShas: Set<string>;

  constructor({ entityId, patchShas }: { entityId: string; patchShas: Set<string> }) {
    if (typeof entityId !== 'string' || entityId.length === 0) {
      throw new WarpError('ProvenanceEntry requires a non-empty entityId', 'E_INVALID_ENTRY');
    }
    if (!(patchShas instanceof Set)) {
      throw new WarpError('ProvenanceEntry requires a Set of patchShas', 'E_INVALID_ENTRY');
    }
    this.entityId = entityId;
    this.patchShas = patchShas;
    Object.freeze(this);
  }
}
