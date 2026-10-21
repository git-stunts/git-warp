import type Patch from '../../src/domain/types/Patch.ts';
import { textDecode } from '../../src/domain/utils/bytes.ts';
import type CommitMessageCodecPort from '../../src/ports/CommitMessageCodecPort.ts';
import type PatchJournalPort from '../../src/ports/PatchJournalPort.ts';
import type { NodeInfo } from '../../src/ports/CommitPort.ts';
import type GitCasStrandStoreAdapter from '../../src/infrastructure/adapters/GitCasStrandStoreAdapter.ts';
import { parseV21LegacyStrand, type V21LegacyStrand } from './V21LegacyStrand.ts';

export const PRE_WORLDLINE_MARKER = 'git-warp-retained-substrate\nversion: 19\n';

/** One patch commit in a chain, oldest first. */
export type V21ChainEntry = Readonly<{ sha: string; patch: Patch }>;

export type V21LegacyHistory = {
  listRefs(prefix: string): Promise<string[]>;
  readRef(ref: string): Promise<string | null>;
  showNode(sha: string): Promise<string>;
  getNodeInfo(sha: string): Promise<NodeInfo>;
  readBlob(oid: string): Promise<Uint8Array>;
};

/** The refs of one graph as the v19/v20 runtime laid them out. */
export type V21LegacyInventory = Readonly<{
  graph: string;
  marker: string | null;
  laneHeads: ReadonlyMap<string, string>;
  strandDescriptors: ReadonlyMap<string, string>;
  overlayHeads: ReadonlyMap<string, string>;
  braidPins: ReadonlyMap<string, ReadonlyMap<string, string>>;
}>;

/** Reads pre-worldline refs, legacy descriptors and patch chains for the migration. */
export default class V21LegacyGraph {
  readonly #history: V21LegacyHistory;
  readonly #codec: CommitMessageCodecPort;
  readonly #journal: PatchJournalPort;
  readonly #strands: GitCasStrandStoreAdapter;
  readonly #chains = new Map<string, readonly V21ChainEntry[]>();

  constructor(options: Readonly<{
    history: V21LegacyHistory;
    codec: CommitMessageCodecPort;
    journal: PatchJournalPort;
    strands: GitCasStrandStoreAdapter;
  }>) {
    this.#history = options.history;
    this.#codec = options.codec;
    this.#journal = options.journal;
    this.#strands = options.strands;
  }

  async inventory(graph: string): Promise<V21LegacyInventory> {
    const root = `refs/warp/${graph}/`;
    const markerOid = await this.#history.readRef(`${root}substrate-version`);
    return Object.freeze({
      graph,
      marker: markerOid === null ? null : textDecode(await this.#history.readBlob(markerOid)),
      laneHeads: await this.#family(`${root}writers/`),
      strandDescriptors: await this.#legacyDescriptors(`${root}strands/`),
      overlayHeads: await this.#family(`${root}strand-overlays/`),
      braidPins: await this.#braidPins(`${root}strand-braids/`),
    });
  }

  async strand(graph: string, name: string, descriptorSha: string): Promise<V21LegacyStrand> {
    const bytes = await this.#strands.readDescriptorRevision(graph, name, descriptorSha);
    return parseV21LegacyStrand(name, descriptorSha, textDecode(bytes));
  }

  /** The chain ending at `head`, oldest first; each patch commit read once per run. */
  async chain(head: string): Promise<readonly V21ChainEntry[]> {
    const cached = this.#chains.get(head);
    if (cached !== undefined) { return cached; }
    const entries: V21ChainEntry[] = [];
    let sha: string | null = head;
    while (sha !== null) {
      const message = await this.#history.showNode(sha);
      if (this.#codec.detectKind(message) === 'patch') {
        entries.push(Object.freeze({ sha, patch: await this.#journal.readPatch(this.#codec.decodePatch(message)) }));
      }
      sha = (await this.#history.getNodeInfo(sha)).parents[0] ?? null;
    }
    const chain = Object.freeze(entries.reverse());
    this.#chains.set(head, chain);
    return chain;
  }

  async #family(prefix: string): Promise<ReadonlyMap<string, string>> {
    const heads = new Map<string, string>();
    for (const ref of (await this.#history.listRefs(prefix)).sort()) {
      const id = ref.slice(prefix.length);
      const head = await this.#history.readRef(ref);
      if (id.length > 0 && !id.includes('/') && head !== null) { heads.set(id, head); }
    }
    return heads;
  }

  /** Legacy descriptors are `strands/<name>`; v21 ones are `strands/<id>/descriptor`. */
  async #legacyDescriptors(prefix: string): Promise<ReadonlyMap<string, string>> {
    return await this.#family(prefix);
  }

  async #braidPins(prefix: string): Promise<ReadonlyMap<string, ReadonlyMap<string, string>>> {
    const pins = new Map<string, Map<string, string>>();
    for (const ref of (await this.#history.listRefs(prefix)).sort()) {
      const [target, support, ...rest] = ref.slice(prefix.length).split('/');
      const head = await this.#history.readRef(ref);
      if (target === undefined || support === undefined || rest.length > 0 || head === null) { continue; }
      const forTarget = pins.get(target) ?? new Map<string, string>();
      forTarget.set(support, head);
      pins.set(target, forTarget);
    }
    return pins;
  }
}
