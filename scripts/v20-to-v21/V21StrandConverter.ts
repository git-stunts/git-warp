import MintId from '../../src/domain/crdt/MintId.ts';
import { STRAND_SCHEMA_VERSION } from '../../src/domain/services/strand/strandShared.ts';
import AssetHandle from '../../src/domain/storage/AssetHandle.ts';
import EdgePropSet from '../../src/domain/types/ops/EdgePropSet.ts';
import NodePropSet from '../../src/domain/types/ops/NodePropSet.ts';
import type Patch from '../../src/domain/types/Patch.ts';
import { textEncode } from '../../src/domain/utils/bytes.ts';
import { buildStrandBraidRef, buildStrandWriterRef } from '../../src/domain/utils/RefLayout.ts';
import { CONTENT_PROPERTY_KEY } from '../../src/domain/graph/LegacyContentPropertyKeys.ts';
import type GitCasStrandStoreAdapter from '../../src/infrastructure/adapters/GitCasStrandStoreAdapter.ts';
import type PatchJournalPort from '../../src/ports/PatchJournalPort.ts';
import type V21LegacyGraph from './V21LegacyGraph.ts';
import type { V21ChainEntry } from './V21LegacyGraph.ts';
import type { V21LegacyStrand } from './V21LegacyStrand.ts';
import type V21PatchTranslator from './V21PatchTranslator.ts';

/** A converted strand's identity, and where each legacy overlay commit went. */
export type V21ConvertedStrand = Readonly<{
  name: string;
  strandId: string;
  owner: string;
  mint: string;
  /** Legacy overlay commit sha to its translated v21 commit sha. */
  commits: ReadonlyMap<string, string>;
  /** Translated chain, oldest first, with the legacy commit each came from. */
  chain: readonly Readonly<{ legacy: V21ChainEntry; commit: string; patch: Patch }>[];
}>;

type RefHistory = {
  readRef(ref: string): Promise<string | null>;
  updateRef(ref: string, oid: string): Promise<void>;
};

/** Writes one legacy strand in the v21 layout: its writer chain, braid pins and descriptor. */
export default class V21StrandConverter {
  readonly #graph: string;
  readonly #legacy: V21LegacyGraph;
  readonly #journal: PatchJournalPort;
  readonly #strands: GitCasStrandStoreAdapter;
  readonly #history: RefHistory;

  constructor(options: Readonly<{
    graph: string;
    legacy: V21LegacyGraph;
    journal: PatchJournalPort;
    strands: GitCasStrandStoreAdapter;
    history: RefHistory;
  }>) {
    this.#graph = options.graph;
    this.#legacy = options.legacy;
    this.#journal = options.journal;
    this.#strands = options.strands;
    this.#history = options.history;
  }

  /**
   * Appends the translated overlay chain to `strands/<id>/writers/<owner>`.
   * A resumed run skips the commits an earlier run already appended, because
   * translation is deterministic.
   */
  async writeChain(
    strand: Readonly<{ strandId: string; owner: string; name: string }>,
    legacyChain: readonly V21ChainEntry[],
    translator: V21PatchTranslator,
  ): Promise<V21ConvertedStrand> {
    const mint = MintId.strand(strand.owner, strand.strandId).encode();
    const targetRef = buildStrandWriterRef(this.#graph, strand.strandId, strand.owner);
    const existingHead = await this.#history.readRef(targetRef);
    const existing = existingHead === null ? [] : await this.#legacy.chain(existingHead);
    let head = existingHead;
    const chain: Array<Readonly<{ legacy: V21ChainEntry; commit: string; patch: Patch }>> = [];
    for (const [index, legacy] of legacyChain.entries()) {
      const patch = translator.patch(legacy.patch);
      const already = existing[index];
      if (already !== undefined) {
        chain.push(Object.freeze({ legacy, commit: already.sha, patch: already.patch }));
        continue;
      }
      const published = await this.#journal.appendPatch({
        patch, graph: this.#graph, writer: mint, targetRef, expectedHead: head, parent: head, attachments: attachmentsOf(patch),
      });
      head = published.sha;
      chain.push(Object.freeze({ legacy, commit: published.sha, patch }));
    }
    return Object.freeze({
      ...strand,
      mint,
      commits: new Map(chain.map((entry) => [entry.legacy.sha, entry.commit])),
      chain: Object.freeze(chain),
    });
  }

  /** Pins each braided support's translated chain head, as v21 braids do. */
  async pinBraids(
    target: V21ConvertedStrand,
    pins: readonly Readonly<{ support: V21ConvertedStrand; legacyHead: string | null }>[],
  ): Promise<Record<string, unknown>[]> {
    const readOverlays: Record<string, unknown>[] = [];
    for (const { support, legacyHead } of pins) {
      const headPatchSha = legacyHead === null ? null : support.commits.get(legacyHead) ?? null;
      const patchCount = headPatchSha === null ? 0 : support.chain.findIndex((entry) => entry.commit === headPatchSha) + 1;
      if (headPatchSha !== null) {
        await this.#history.updateRef(
          buildStrandBraidRef(this.#graph, target.strandId, { braidedStrandId: support.strandId, writerId: support.owner }),
          headPatchSha,
        );
      }
      readOverlays.push({ strandId: support.strandId, overlayId: support.mint, kind: 'overlay', headPatchSha, patchCount });
    }
    return readOverlays;
  }

  async publishDescriptor(
    legacy: V21LegacyStrand,
    converted: V21ConvertedStrand,
    parts: Readonly<{
      genesis: Readonly<Record<string, string | number>>;
      readOverlays: readonly Record<string, unknown>[];
      intents: readonly Readonly<Record<string, unknown>>[];
    }>,
  ): Promise<void> {
    const descriptor = {
      schemaVersion: STRAND_SCHEMA_VERSION,
      strandId: converted.strandId,
      name: legacy.name,
      genesis: parts.genesis,
      graphName: this.#graph,
      createdAt: legacy.createdAt,
      updatedAt: legacy.updatedAt,
      owner: converted.owner,
      scope: legacy.scope,
      lease: { expiresAt: legacy.leaseExpiresAt },
      baseObservation: legacy.baseObservation,
      overlay: { overlayId: converted.mint, kind: legacy.overlayKind, headPatchSha: null, patchCount: 0, writable: legacy.writable },
      braid: { readOverlays: parts.readOverlays },
      intentQueue: { nextIntentSeq: legacy.nextIntentSeq, intents: parts.intents },
      ...(legacy.evolution === null ? {} : { evolution: legacy.evolution }),
      materialization: { cacheAuthority: 'derived' },
    };
    await this.#strands.publishDescriptor({
      graphName: this.#graph,
      strandId: converted.strandId,
      descriptor: textEncode(JSON.stringify(descriptor)),
      attachments: parts.intents.flatMap((intent) => intentAttachments(intent)),
    });
  }
}

/** Content assets a patch's property sets reference, which its commit must retain. */
export function attachmentsOf(patch: Patch): AssetHandle[] {
  const handles = new Set<string>();
  for (const op of patch.ops) {
    if ((op instanceof NodePropSet || op instanceof EdgePropSet) && op.key === CONTENT_PROPERTY_KEY && typeof op.value === 'string') {
      handles.add(op.value);
    }
  }
  return [...handles].sort().map((handle) => new AssetHandle(handle));
}

function intentAttachments(intent: Readonly<Record<string, unknown>>): AssetHandle[] {
  const handles = intent['contentAssetHandles'];
  return Array.isArray(handles) ? handles.map((handle) => new AssetHandle(String(handle))) : [];
}
