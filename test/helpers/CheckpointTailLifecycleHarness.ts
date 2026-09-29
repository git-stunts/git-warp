/**
 * Builds a checkpoint-tail property read over real index roots and compares
 * it with the state every delivery order of the same operations reduces to.
 *
 * The checkpoint is the JoinReducer state of the checkpoint patches. Its
 * bounded basis is written by `MaterializationIndexRootPlan`, the writer
 * that checkpoints use, or, for `recordsAbsent`, by the logical index
 * builder alone, which is how an index root looks when it was written
 * without node lifecycle records. The tail is served per writer after the
 * checkpoint frontier, as `CheckpointTailWitnessScan` expects.
 */

import ContinuumEvidencePosture from '../../src/domain/continuum/ContinuumEvidencePosture.ts';
import QueryError from '../../src/domain/errors/QueryError.ts';
import { applyPatchOp, createEmptyState } from '../../src/domain/services/JoinReducer.ts';
import { MaterializationIndexRootPlan } from '../../src/domain/services/controllers/MaterializationIndexRoots.ts';
import LogicalIndexBuildService from '../../src/domain/services/index/LogicalIndexBuildService.ts';
import {
  NODE_LIFECYCLE_RECEIPT_PATH,
  nodeLifecycleShardPath,
} from '../../src/domain/services/index/NodeLifecycleShardReader.ts';
import CheckpointTailOpticSource, {
  type CheckpointTailCheckpointFrontier,
  type CheckpointTailPatchEntry,
} from '../../src/domain/services/optic/CheckpointTailOpticSource.ts';
import CheckpointTailFactReducer from '../../src/domain/services/optic/CheckpointTailFactReducer.ts';
import CheckpointTailWitnessLocator from '../../src/domain/services/optic/CheckpointTailWitnessLocator.ts';
import Optic from '../../src/domain/services/optic/Optic.ts';
import OpticAperturePosture from '../../src/domain/services/optic/OpticAperturePosture.ts';
import OpticBasisPosture from '../../src/domain/services/optic/OpticBasisPosture.ts';
import OpticCoordinatePosture from '../../src/domain/services/optic/OpticCoordinatePosture.ts';
import { CURRENT_CHECKPOINT_SCHEMA } from '../../src/domain/services/state/checkpointHelpers.ts';
import { projectState } from '../../src/domain/services/state/StateSerializer.ts';
import type WarpState from '../../src/domain/services/state/WarpState.ts';
import type BundleHandle from '../../src/domain/storage/BundleHandle.ts';
import WarpStream from '../../src/domain/stream/WarpStream.ts';
import Patch from '../../src/domain/types/Patch.ts';
import type { PatchOp } from '../../src/domain/types/ops/unions.ts';
import type { PropValue } from '../../src/domain/types/PropValue.ts';
import { EventId } from '../../src/domain/utils/EventId.ts';
import defaultCodec from '../../src/infrastructure/codecs/CborCodec.ts';
import ArtifactStagingPort from '../../src/ports/ArtifactStagingPort.ts';
import type { CheckpointBasis } from '../../src/ports/CheckpointStorePort.ts';
import type CodecPort from '../../src/ports/CodecPort.ts';
import InMemoryCheckpointStore from './InMemoryCheckpointStore.ts';
import MockIndexStorage from './MockIndexStorage.ts';

export const HARNESS_NODE = 'n';
export const HARNESS_KEY = 'k';
const CHECKPOINT_SHA = 'c'.repeat(40);
const GRAPH_NAME = 'checkpoint-tail-lifecycle';

/** One patch: its writer, lamport, sha and ops. */
export type HarnessPatch = Readonly<{
  writer: string;
  lamport: number;
  sha: string;
  ops: readonly PatchOp[];
}>;

export type HarnessScenario = Readonly<{
  checkpoint: readonly HarnessPatch[];
  tail: readonly HarnessPatch[];
}>;

export type HarnessRead =
  | Readonly<{ kind: 'value'; value: PropValue | null }>
  | Readonly<{ kind: 'refused'; reason: string }>;

type Step = readonly [PatchOp, EventId];

/** Every operation of the patches, with the EventId the reducer gives it. */
export function stepsOf(patches: readonly HarnessPatch[]): readonly Step[] {
  return patches.flatMap((patch) => patch.ops.map((op, opIndex): Step => [
    op,
    new EventId(patch.lamport, patch.writer, patch.sha, opIndex),
  ]));
}

export function replay(steps: readonly Step[]): WarpState {
  const state = createEmptyState();
  for (const [op, eventId] of steps) {
    applyPatchOp(state, op, eventId);
  }
  return state;
}

export function visibleValue(state: WarpState): PropValue | null {
  return projectState(state).props
    .find((row) => row.node === HARNESS_NODE && row.key === HARNESS_KEY)?.value ?? null;
}

/**
 * The visible value after every delivery order of every operation. Throws
 * when two orders disagree, which would make the oracle itself unsound.
 */
export function materializedValue(scenario: HarnessScenario): PropValue | null {
  const values = permutations(stepsOf([...scenario.checkpoint, ...scenario.tail]))
    .map((order) => visibleValue(replay(order)));
  const [first] = values;
  if (first === undefined || values.some((value) => value !== first)) {
    throw new Error(`delivery orders disagree: ${values.map(String).join(', ')}`);
  }
  return first;
}

/**
 * Damage applied to the index root after the checkpoint writer wrote it:
 * `drop-node-lifecycle-shard` removes the harness node's `life_XX` member and
 * keeps the receipt; `receipt-schema-version` replaces the receipt with one
 * whose schema version this runtime does not read.
 */
export type HarnessRootDamage = 'drop-node-lifecycle-shard' | 'receipt-schema-version';

const UNREAD_RECEIPT_SCHEMA_VERSION = 2;

/** Reads the property through CheckpointTailWitnessLocator over a written basis. */
export async function tailRead(
  scenario: HarnessScenario,
  options: Readonly<{ recordsAbsent?: boolean; damage?: HarnessRootDamage }> = {},
): Promise<HarnessRead> {
  const checkpoint = replay(stepsOf(scenario.checkpoint));
  const indexStore = new MockIndexStorage();
  const written = await writeBasis(checkpoint, indexStore, options.recordsAbsent ?? false);
  const roots = options.damage === undefined ? written : await damageRoot(written, indexStore, options.damage);
  const source = new HarnessSource({ indexStore, scenario, roots });
  const locator = new CheckpointTailWitnessLocator({ source });
  try {
    const result = await locator.readNodeProperty(propertyOptic());
    return { kind: 'value', value: result.value ?? null };
  } catch (error) {
    return { kind: 'refused', reason: refusalReason(error) };
  }
}

/**
 * The reducer's answer for every order of the tail patches, given what the
 * written basis carries: the checkpoint's lifecycle records, the register
 * EventId that is not stale, the visible value and the node's liveness.
 */
export function reducerReadsInEveryTailOrder(scenario: HarnessScenario): readonly HarnessRead[] {
  const checkpoint = replay(stepsOf(scenario.checkpoint));
  const register = checkpoint.getNodeProp(HARNESS_NODE, HARNESS_KEY);
  const reducer = new CheckpointTailFactReducer({ graphName: GRAPH_NAME });
  return permutations(scenario.tail).map((order) => {
    try {
      const value = reducer.reduceProperty({
        baseValue: visibleValue(checkpoint) ?? undefined,
        checkpointLifecycle: {
          kind: 'witnessed',
          lifecycle: checkpoint,
          baseRegisterEvent: register === undefined || checkpoint.isStaleNodeRegister(HARNESS_NODE, register)
            ? null
            : register.eventId,
          baseAlive: checkpoint.nodeAlive.contains(HARNESS_NODE),
          floatingTombstones: floatingTombstones(checkpoint),
        },
        tailEntries: order.map(tailEntry),
        nodeId: HARNESS_NODE,
        propertyKey: HARNESS_KEY,
      });
      return { kind: 'value', value: value ?? null };
    } catch (error) {
      if (error instanceof QueryError && typeof error.context['reason'] === 'string') {
        return { kind: 'refused', reason: error.context['reason'] };
      }
      throw error;
    }
  });
}

/** Node tombstones whose dot no node entry of the state holds. */
function floatingTombstones(state: WarpState): ReadonlySet<string> {
  const held = new Set(state.nodeAlive.entryDotsIter());
  return new Set([...state.nodeAlive.tombstonesIter()].filter((dot) => !held.has(dot)));
}

function tailEntry(patch: HarnessPatch): CheckpointTailPatchEntry {
  return {
    sha: patch.sha,
    patch: new Patch({ schema: 3, writer: patch.writer, lamport: patch.lamport, context: {}, ops: [...patch.ops] }),
  };
}

type WrittenBasis = Readonly<{ indexRoot: BundleHandle | null; propertyRoot: BundleHandle | null }>;

async function writeBasis(
  state: WarpState,
  store: MockIndexStorage,
  recordsAbsent: boolean,
): Promise<WrittenBasis> {
  const roots = await MaterializationIndexRootPlan.create({ state, store }).write(new UnusedStaging());
  const indexRoot = recordsAbsent
    ? await store.writeShards(WarpStream.from(
      new LogicalIndexBuildService().buildLogicalIndexBuilder(state).yieldShards(),
    ))
    : roots.roaringIndexes.handle;
  return { indexRoot, propertyRoot: roots.properties.handle };
}

async function damageRoot(
  roots: WrittenBasis,
  store: MockIndexStorage,
  damage: HarnessRootDamage,
): Promise<WrittenBasis> {
  if (roots.indexRoot === null) {
    throw new Error('harness damage needs an index root');
  }
  const members = await store.readShardHandles(roots.indexRoot);
  const target = damage === 'drop-node-lifecycle-shard'
    ? nodeLifecycleShardPath(HARNESS_NODE)
    : NODE_LIFECYCLE_RECEIPT_PATH;
  const handle = members[target];
  if (handle === undefined) {
    throw new Error(`harness damage expected member ${target}`);
  }
  const kept = Object.fromEntries(Object.entries(members).filter(([path]) => path !== target));
  if (damage === 'receipt-schema-version') {
    const receipt = defaultCodec.decode<{ nodeCount: number; shardCount: number; floatingTombstones: string[] }>(
      await readAll(store.openShard(handle)),
    );
    kept[target] = await store.writeBlob(defaultCodec.encode({
      schemaVersion: UNREAD_RECEIPT_SCHEMA_VERSION,
      nodeCount: receipt.nodeCount,
      shardCount: receipt.shardCount,
      floatingTombstones: receipt.floatingTombstones,
    }));
  }
  return { indexRoot: store.writeIndex(kept), propertyRoot: roots.propertyRoot };
}

async function readAll(source: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of source) {
    chunks.push(chunk);
  }
  const bytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

function propertyOptic(): Optic {
  return Optic.nodeProperty({
    coordinatePosture: OpticCoordinatePosture.capturedCoordinate(),
    aperturePosture: OpticAperturePosture.defaultFullRead(),
    basisPosture: OpticBasisPosture.checkpointTailBasisVerified(),
    evidencePosture: ContinuumEvidencePosture.translatedGitWarpEvidence(),
    nodeId: HARNESS_NODE,
    propertyKey: HARNESS_KEY,
  });
}

function refusalReason(error: unknown): string {
  if (!(error instanceof Error)) {
    throw error;
  }
  const context: unknown = Reflect.get(error, 'context');
  const cause = typeof context === 'object' && context !== null ? Reflect.get(context, 'cause') : undefined;
  if (typeof cause !== 'string') {
    throw error;
  }
  return cause;
}

function permutations<T>(items: readonly T[]): readonly (readonly T[])[] {
  if (items.length <= 1) {
    return [items];
  }
  return items.flatMap((item, index) => permutations([
    ...items.slice(0, index),
    ...items.slice(index + 1),
  ]).map((rest) => [item, ...rest]));
}

/** MockIndexStorage writes shards itself and never stages through this port. */
class UnusedStaging extends ArtifactStagingPort {
  override stagePage(): Promise<string> {
    return Promise.reject(new Error('harness index writes do not stage pages'));
  }

  override stageOrderedBundle(): Promise<BundleHandle> {
    return Promise.reject(new Error('harness index writes do not stage bundles'));
  }
}

class HarnessCheckpointStore extends InMemoryCheckpointStore {
  readonly #basis: CheckpointBasis;

  constructor(basis: CheckpointBasis) {
    super();
    this.#basis = basis;
  }

  override async loadBasis(): Promise<CheckpointBasis> {
    return this.#basis;
  }
}

class HarnessSource extends CheckpointTailOpticSource {
  readonly graphName = GRAPH_NAME;
  readonly _codec: CodecPort = defaultCodec;
  readonly _checkpointStore: HarnessCheckpointStore;
  readonly _indexStore: MockIndexStorage;
  readonly #tail: readonly HarnessPatch[];

  constructor(options: Readonly<{
    indexStore: MockIndexStorage;
    scenario: HarnessScenario;
    roots: WrittenBasis;
  }>) {
    super();
    this._indexStore = options.indexStore;
    this.#tail = options.scenario.tail;
    this._checkpointStore = new HarnessCheckpointStore({
      checkpointSha: CHECKPOINT_SHA,
      stateHash: 'harness-state',
      schema: CURRENT_CHECKPOINT_SCHEMA,
      frontier: frontierOf(options.scenario.checkpoint),
      indexShardHandles: Object.freeze({}),
      indexRoot: options.roots.indexRoot,
      propertyRoot: options.roots.propertyRoot,
    });
  }

  discoverWriters(): Promise<string[]> {
    return Promise.resolve([...new Set(this.#tail.map((patch) => patch.writer))]);
  }

  _readCheckpointSha(): Promise<string | null> {
    return Promise.resolve(CHECKPOINT_SHA);
  }

  _loadPatchChainFromSha(): Promise<CheckpointTailPatchEntry[]> {
    return Promise.resolve([]);
  }

  _loadWriterPatches(writerId: string): Promise<CheckpointTailPatchEntry[]> {
    return Promise.resolve(this.#tail.filter((patch) => patch.writer === writerId).map(tailEntry));
  }

  _validatePatchAgainstCheckpoint(
    _writerId: string,
    _incomingSha: string,
    _checkpoint: CheckpointTailCheckpointFrontier | null | undefined,
  ): Promise<void> {
    return Promise.resolve();
  }
}

function frontierOf(patches: readonly HarnessPatch[]): Map<string, string> {
  const frontier = new Map<string, string>();
  for (const patch of patches) {
    frontier.set(patch.writer, patch.sha);
  }
  return frontier;
}
