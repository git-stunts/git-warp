import defaultCodec from '../../utils/defaultCodec.ts';
import WarpError from '../../errors/WarpError.ts';
import SchemaUnsupportedError from '../../errors/SchemaUnsupportedError.ts';
import type CodecPort from '../../../ports/CodecPort.ts';

/**
 * ProvenanceIndex - Node-to-Patch SHA Index
 *
 * Implements HG/IO/2: Build nodeId-to-patchSha index from I/O declarations.
 * This enables quick answers to "which patches affected node X?" without
 * replaying all patches.
 *
 * The index maps:
 * - nodeId -> Set<patchSha> (patches that read or wrote this node)
 *
 * @module domain/services/provenance/ProvenanceIndex
 */
class ProvenanceIndex {
  #index: Map<string, Set<string>>;

  constructor(initialIndex?: Map<string, Set<string>>) {
    if (initialIndex) {
      this.#index = new Map();
      for (const [k, v] of initialIndex) {
        this.#index.set(k, new Set(v));
      }
    } else {
      this.#index = new Map();
    }
  }

  static empty(): ProvenanceIndex {
    return new ProvenanceIndex();
  }

  addPatch(patchSha: string, reads: string[] | undefined, writes: string[] | undefined): ProvenanceIndex {
    this.#indexEntityList(reads, patchSha);
    this.#indexEntityList(writes, patchSha);
    return this;
  }

  #indexEntityList(entities: string[] | undefined, patchSha: string): void {
    if (entities !== undefined && entities !== null && entities.length > 0) {
      for (const entityId of entities) {
        this.#addEntry(entityId, patchSha);
      }
    }
  }

  #addEntry(entityId: string, patchSha: string): void {
    let shas = this.#index.get(entityId);
    if (!shas) {
      shas = new Set();
      this.#index.set(entityId, shas);
    }
    shas.add(patchSha);
  }

  patchesFor(entityId: string): string[] {
    const shas = this.#index.get(entityId);
    if (!shas || shas.size === 0) { return []; }
    return [...shas].sort();
  }

  has(entityId: string): boolean {
    const shas = this.#index.get(entityId);
    return shas !== undefined && shas.size > 0;
  }

  get size(): number {
    return this.#index.size;
  }

  entities(): string[] {
    return [...this.#index.keys()].sort();
  }

  clear(): ProvenanceIndex {
    this.#index.clear();
    return this;
  }

  merge(other: ProvenanceIndex): ProvenanceIndex {
    for (const [entityId, shas] of other.#index) {
      for (const sha of shas) {
        this.#addEntry(entityId, sha);
      }
    }
    return this;
  }

  clone(): ProvenanceIndex {
    const clonedMap = new Map<string, Set<string>>();
    for (const [entityId, shas] of this.#index) {
      clonedMap.set(entityId, new Set(shas));
    }
    return new ProvenanceIndex(clonedMap);
  }

  #sortedEntries(): Array<[string, string[]]> {
    const entries: Array<[string, string[]]> = [];
    for (const [entityId, shas] of this.#index) {
      entries.push([entityId, [...shas].sort()]);
    }
    entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    return entries;
  }

  serialize({ codec }: { codec?: CodecPort } = {}): Uint8Array {
    const c = codec ?? defaultCodec;
    return c.encode({ version: 1, entries: this.#sortedEntries() });
  }

  static #buildIndex(entries: Array<[string, string[]]>): Map<string, Set<string>> {
    const index = new Map<string, Set<string>>();
    for (const [entityId, shas] of entries) {
      index.set(entityId, new Set(shas));
    }
    return index;
  }

  static deserialize(buffer: Uint8Array, { codec }: { codec?: CodecPort } = {}): ProvenanceIndex {
    const c = codec ?? defaultCodec;
    const obj = c.decode<{ version?: number; entries?: Array<[string, string[]]> }>(buffer);
    ProvenanceIndex.#validateSerialized(obj);
    return new ProvenanceIndex(ProvenanceIndex.#buildIndex(obj.entries ?? []));
  }

  static #validateSerialized(obj: { version?: number; entries?: Array<[string, string[]]> }): void {
    if (obj.version !== 1) {
      throw new SchemaUnsupportedError(
        `Unsupported ProvenanceIndex version: ${obj.version}`,
        { context: { version: obj.version } },
      );
    }
    if (!Array.isArray(obj.entries)) {
      throw new WarpError(
        'Missing or invalid ProvenanceIndex entries',
        'E_PROVENANCE_INDEX_MALFORMED',
      );
    }
  }

  toJSON(): { version: number; entries: Array<[string, string[]]> } {
    return { version: 1, entries: this.#sortedEntries() };
  }

  static fromJSON(json: { version?: number; entries?: Array<[string, string[]]> }): ProvenanceIndex {
    ProvenanceIndex.#validateSerialized(json);
    return new ProvenanceIndex(ProvenanceIndex.#buildIndex(json.entries ?? []));
  }

  *[Symbol.iterator](): Iterator<[string, string[]]> {
    for (const entry of this.#sortedEntries()) {
      yield entry;
    }
  }
}

export default ProvenanceIndex;
export { ProvenanceIndex };
