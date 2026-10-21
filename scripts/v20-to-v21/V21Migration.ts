import MintId from '../../src/domain/crdt/MintId.ts';
import openDotMint, { reserveAllocation } from '../../src/domain/services/openDotMint.ts';
import { STRAND_GENESIS_KIND } from '../../src/domain/services/strand/strandShared.ts';
import { computeChecksum } from '../../src/domain/utils/checksumUtils.ts';
import { textEncode } from '../../src/domain/utils/bytes.ts';
import type { MigrationStorageServices } from '../../src/infrastructure/adapters/GitCasRepositoryAdapter.ts';
import { CURRENT_SUBSTRATE_MARKER } from '../../src/infrastructure/adapters/SubstrateVersionGate.ts';
import type CommitMessageCodecPort from '../../src/ports/CommitMessageCodecPort.ts';
import type CryptoPort from '../../src/ports/CryptoPort.ts';
import { scanV21Damage, type V21Damage } from './V21DamageReport.ts';
import V21LegacyGraph, { PRE_WORLDLINE_MARKER, type V21LegacyHistory, type V21LegacyInventory } from './V21LegacyGraph.ts';
import type { V21LegacyStrand } from './V21LegacyStrand.ts';
import V21MigrationRecordStore, { type V21MigrationRecord, type V21StrandRecord } from './V21MigrationRecord.ts';
import V21PatchTranslator, { V21TranslationBlocked } from './V21PatchTranslator.ts';
import V21Provenance from './V21Provenance.ts';
import V21StrandConverter, { type V21ConvertedStrand } from './V21StrandConverter.ts';
import { buildV21LaneView, buildV21StrandView, orderV21Strands } from './V21StrandViews.ts';

export type V21MigrationHistory = V21LegacyHistory & {
  writeBlob(content: Uint8Array | string): Promise<string>;
  compareAndSwapRef(ref: string, newOid: string, expectedOid: string | null): Promise<void>;
  updateRef(ref: string, oid: string): Promise<void>;
};

export type V21MigrationOutcome =
  | Readonly<{ status: 'migrated' | 'already-migrated'; record: V21MigrationRecord }>
  | Readonly<{ status: 'refused'; reason: 'ownerless-strand' | 'not-pre-worldline'; strands: readonly string[] }>;

/**
 * Migrates one graph from the v19/v20 substrate to v21 (#1015). Lane history
 * is untouched; legacy strands are converted, floors persisted, provenance
 * mapped and damage reported; the substrate marker advances last.
 */
export default class V21Migration {
  readonly #history: V21MigrationHistory;
  readonly #services: MigrationStorageServices;
  readonly #codec: CommitMessageCodecPort;
  readonly #crypto: CryptoPort;

  constructor(deps: Readonly<{
    history: V21MigrationHistory;
    services: MigrationStorageServices;
    codec: CommitMessageCodecPort;
    crypto: CryptoPort;
  }>) {
    this.#history = deps.history;
    this.#services = deps.services;
    this.#codec = deps.codec;
    this.#crypto = deps.crypto;
  }

  async run(graph: string, assignOwners: ReadonlyMap<string, string> = new Map()): Promise<V21MigrationOutcome> {
    const legacy = new V21LegacyGraph({
      history: this.#history, codec: this.#codec, journal: this.#services.patchJournal, strands: this.#services.strands,
    });
    const inventory = await legacy.inventory(graph);
    const records = new V21MigrationRecordStore(this.#history, graph);
    const existing = await records.read();
    if (inventory.marker === CURRENT_SUBSTRATE_MARKER && existing?.status === 'complete') {
      return Object.freeze({ status: 'already-migrated', record: existing });
    }
    if (inventory.marker !== PRE_WORLDLINE_MARKER) {
      return Object.freeze({ status: 'refused', reason: 'not-pre-worldline', strands: [] });
    }
    const strands = await Promise.all([...inventory.strandDescriptors].map(([name, sha]) => legacy.strand(graph, name, sha)));
    const ownerless = strands.filter((strand) => (assignOwners.get(strand.name) ?? strand.owner) === null).map((strand) => strand.name);
    if (ownerless.length > 0) {
      return Object.freeze({ status: 'refused', reason: 'ownerless-strand', strands: ownerless.sort() });
    }
    const record = existing ?? newRecord(inventory, strands);
    record.provenance = [];
    record.damage = { duplicateDots: [], collateralDeletions: [] };
    await records.write(record);
    await this.#persistFloors(inventory, record);
    await records.write(record);
    const provenance = await indexAllocations(legacy, inventory);
    const converted = await this.#convertStrands({ graph, legacy, inventory, strands, assignOwners, record, records, provenance });
    await mapLane({ legacy, inventory, record, converted, provenance });
    record.status = 'complete';
    await records.write(record);
    await this.#advanceMarker(graph);
    return Object.freeze({ status: 'migrated', record });
  }

  async #persistFloors(inventory: V21LegacyInventory, record: V21MigrationRecord): Promise<void> {
    for (const [writerId, headSha] of inventory.laneHeads) {
      const mint = await openDotMint({ ...this.#lane(writerId, headSha) });
      record.floors[writerId] = mint.issued;
    }
  }

  async #convertStrands(run: Readonly<{
    graph: string;
    legacy: V21LegacyGraph;
    inventory: V21LegacyInventory;
    strands: readonly V21LegacyStrand[];
    assignOwners: ReadonlyMap<string, string>;
    record: V21MigrationRecord;
    records: V21MigrationRecordStore;
    provenance: V21Provenance;
  }>): Promise<Map<string, V21ConvertedStrand>> {
    const converter = new V21StrandConverter({
      graph: run.graph, legacy: run.legacy, journal: this.#services.patchJournal, strands: this.#services.strands, history: this.#history,
    });
    const { provenance } = run;
    const mints = new Map<string, string>();
    const converted = new Map<string, V21ConvertedStrand>();
    const damage: V21Damage[] = [];
    for (const strand of orderV21Strands(run.strands)) {
      const entry = requireStrandRecord(run.record, strand.name);
      const owner = requireOwner(strand, run.assignOwners);
      try {
        await this.#identify(run, entry, strand, owner);
        mints.set(strand.name, entry.mint ?? '');
        const view = await buildV21StrandView(run.legacy, strand, run.inventory);
        const translator = new V21PatchTranslator(view, strand.name, mints);
        const overlayHead = run.inventory.overlayHeads.get(strand.name);
        const result = await converter.writeChain(
          { strandId: entry.strandId ?? '', owner, name: strand.name },
          overlayHead === undefined ? [] : await run.legacy.chain(overlayHead),
          translator,
        );
        const readOverlays = await converter.pinBraids(result, strand.readOverlays.map((pin) => ({
          support: requireConverted(converted, strand.name, pin.strandId), legacyHead: pin.headPatchSha,
        })));
        await converter.publishDescriptor(strand, result, {
          genesis: genesisOf(run.graph, strand, entry), readOverlays, intents: strand.intents.map((intent) => translator.intent(intent.raw)),
        });
        converted.set(strand.name, result);
        damage.push(scanV21Damage(`strand:${strand.name}`, view, {
          identityOf: (site) => (site.origin.kind === 'lane' ? site.dot : `${mints.get(site.origin.name) ?? '?'}:${site.counter}`),
          removesFrom: (patch) => patch.origin.kind === 'strand' && patch.origin.name === strand.name,
        }));
        run.record.provenance.push(...result.chain.flatMap((link) => provenance.resolve(
          link.legacy.patch, { commit: link.commit, legacyCommit: link.legacy.sha }, (name) => converted.get(name)?.mint ?? null,
        )));
        entry.status = 'converted';
      } catch (error) {
        if (!(error instanceof V21TranslationBlocked)) { throw error; }
        mints.delete(strand.name);
        Object.assign(entry, { status: 'blocked', reason: error.reason });
      }
      await run.records.write(run.record);
    }
    run.record.damage = mergeDamage([run.record.damage, ...damage]);
    return converted;
  }

  /** Reserves the strand's creation occurrence once, journaling it before anything depends on it. */
  async #identify(
    run: Readonly<{ graph: string; inventory: V21LegacyInventory; record: V21MigrationRecord; records: V21MigrationRecordStore }>,
    entry: V21StrandRecord,
    strand: V21LegacyStrand,
    owner: string,
  ): Promise<void> {
    if (entry.occurrence === null || entry.owner !== owner) {
      entry.owner = owner;
      entry.occurrence = await reserveAllocation(this.#lane(owner, run.inventory.laneHeads.get(owner) ?? null));
      await run.records.write(run.record);
    }
    const strandId = await computeChecksum({ kind: STRAND_GENESIS_KIND, ...genesisOf(run.graph, strand, entry) }, this.#crypto);
    entry.strandId = strandId;
    entry.mint = MintId.strand(owner, strandId).encode();
  }

  async #advanceMarker(graph: string): Promise<void> {
    const markerRef = `refs/warp/${graph}/substrate-version`;
    const legacyOid = await this.#history.readRef(markerRef);
    const currentOid = await this.#history.writeBlob(textEncode(CURRENT_SUBSTRATE_MARKER));
    await this.#history.compareAndSwapRef(markerRef, currentOid, legacyOid);
  }

  #lane(writerId: string, headSha: string | null) {
    return {
      writerId, commits: this.#history, codec: this.#codec, journal: this.#services.patchJournal, headSha, floors: this.#services.allocationFloors,
    };
  }
}

async function indexAllocations(legacy: V21LegacyGraph, inventory: V21LegacyInventory): Promise<V21Provenance> {
  const provenance = new V21Provenance();
  for (const [writerId, head] of inventory.laneHeads) {
    for (const entry of await legacy.chain(head)) { provenance.index({ kind: 'lane', writerId }, entry.patch); }
  }
  for (const [name, head] of inventory.overlayHeads) {
    for (const entry of await legacy.chain(head)) { provenance.index({ kind: 'strand', name }, entry.patch); }
  }
  return provenance;
}

/** Lane damage and the provenance of allocations retained in lane patches. */
async function mapLane(run: Readonly<{
  legacy: V21LegacyGraph;
  inventory: V21LegacyInventory;
  record: V21MigrationRecord;
  converted: ReadonlyMap<string, V21ConvertedStrand>;
  provenance: V21Provenance;
}>): Promise<void> {
  const view = await buildV21LaneView(run.legacy, run.inventory);
  run.record.damage = mergeDamage([run.record.damage, scanV21Damage('lane', view, { identityOf: (site) => site.dot, removesFrom: () => true })]);
  for (const entry of view.patches) {
    run.record.provenance.push(...run.provenance.resolve(
      entry.patch, { commit: entry.sha, legacyCommit: entry.sha }, (name) => run.converted.get(name)?.mint ?? null,
    ));
  }
}

function requireOwner(strand: V21LegacyStrand, assignOwners: ReadonlyMap<string, string>): string {
  const owner = assignOwners.get(strand.name) ?? strand.owner;
  if (owner === null) { throw new Error(`strand '${strand.name}' has no owner`); }
  return owner;
}

function newRecord(inventory: V21LegacyInventory, strands: readonly V21LegacyStrand[]): V21MigrationRecord {
  return {
    format: 'git-warp-v21-migration',
    version: 1,
    graph: inventory.graph,
    status: 'in-progress',
    frontier: {
      lanes: Object.fromEntries(inventory.laneHeads),
      legacyStrands: Object.fromEntries(inventory.strandDescriptors),
      legacyOverlays: Object.fromEntries(inventory.overlayHeads),
    },
    floors: {},
    strands: strands.map((strand) => ({
      name: strand.name, legacyDescriptor: strand.descriptorSha, status: 'pending',
      owner: null, occurrence: null, strandId: null, mint: null, reason: null,
    })),
    provenance: [],
    damage: { duplicateDots: [], collateralDeletions: [] },
  };
}

function genesisOf(graph: string, strand: V21LegacyStrand, entry: V21StrandRecord): Record<string, string | number> {
  return {
    lane: graph,
    creator: entry.owner ?? '',
    occurrence: entry.occurrence ?? 0,
    name: strand.name,
    base: strand.baseObservation.frontierDigest,
    legacyDescriptor: strand.descriptorSha,
  };
}

function requireStrandRecord(record: V21MigrationRecord, name: string): V21StrandRecord {
  const entry = record.strands.find((candidate) => candidate.name === name);
  if (entry === undefined) { throw new Error(`migration record has no entry for strand '${name}'`); }
  return entry;
}

function requireConverted(converted: ReadonlyMap<string, V21ConvertedStrand>, target: string, support: string): V21ConvertedStrand {
  const strand = converted.get(support);
  if (strand === undefined) {
    throw new V21TranslationBlocked(`strand '${target}' braids strand '${support}', which is not converted`);
  }
  return strand;
}

function mergeDamage(parts: readonly V21Damage[]): V21Damage {
  return {
    duplicateDots: parts.flatMap((part) => part.duplicateDots),
    collateralDeletions: parts.flatMap((part) => part.collateralDeletions),
  };
}
