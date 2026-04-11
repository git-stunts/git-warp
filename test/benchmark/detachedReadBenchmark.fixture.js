// @ts-nocheck

import WarpCore from '../../src/domain/WarpCore.ts';
import { Dot } from '../../src/domain/crdt/Dot.ts';
import VersionVector from '../../src/domain/crdt/VersionVector.ts';

/** @typedef {any} WarpCoreRuntime */

/** @type {number[]} */
export const DETACHED_READ_BENCHMARK_SCALES = [250, 1000, 2500];
/** @type {ReadonlyArray<'live'|'coordinate'|'strand'>} */
export const DETACHED_READ_BENCHMARK_KINDS = ['live', 'coordinate', 'strand'];

/**
 * @param {number[]} [scales]
 * @returns {Array<{ patchCount: number, kind: 'live'|'coordinate'|'strand', label: string }>}
 */
export function createDetachedReadBenchmarkPlan(scales = DETACHED_READ_BENCHMARK_SCALES) {
  return scales.flatMap((patchCount) => DETACHED_READ_BENCHMARK_KINDS.map((kind) => ({
    patchCount,
    kind: /** @type {'live'|'coordinate'|'strand'} */ (kind),
    label: `${kind}:${patchCount}`,
  })));
}

/**
 * @param {number} counter
 * @returns {string}
 */
function hexSha(counter) {
  return String(counter).padStart(40, '0');
}

/**
 * @returns {any}
 */
function createMockPersistence() {
  const refs = new Map();
  const blobs = new Map();
  const commits = new Map();
  const trees = new Map();
  let blobCounter = 0;
  let commitCounter = 0;
  let treeCounter = 0;

  return {
    _refs: refs,
    _blobs: blobs,
    _commits: commits,
    _trees: trees,
    readRef: async (/** @type {string} */ ref) => refs.get(ref) || null,
    listRefs: async (/** @type {string} */ prefix) => {
      const result = [];
      for (const key of refs.keys()) {
        if (key.startsWith(prefix)) {
          result.push(key);
        }
      }
      return result;
    },
    updateRef: async (/** @type {string} */ ref, /** @type {string} */ sha) => {
      refs.set(ref, sha);
    },
    deleteRef: async (/** @type {string} */ ref) => {
      refs.delete(ref);
    },
    configGet: async () => null,
    configSet: async () => {},
    showNode: async (/** @type {string} */ sha) => {
      const commit = commits.get(sha);
      return commit ? commit.message : '';
    },
    getNodeInfo: async (/** @type {string} */ sha) => {
      const commit = commits.get(sha);
      return commit || { message: '', parents: [] };
    },
    writeTree: async (/** @type {unknown} */ entries) => {
      const oid = hexSha(2000000 + (++treeCounter));
      trees.set(oid, entries);
      return oid;
    },
    commitNodeWithTree: async (/** @type {{ treeOid: string, message: string, parents?: string[] }} */ { treeOid, message, parents }) => {
      const sha = hexSha(3000000 + (++commitCounter));
      commits.set(sha, { treeOid, message, parents: parents || [] });
      return sha;
    },
    readBlob: async (/** @type {string} */ oid) => blobs.get(oid) || null,
    writeBlob: async (/** @type {Uint8Array} */ buf) => {
      const oid = hexSha(++blobCounter);
      blobs.set(oid, buf);
      return oid;
    },
    commitNode: async (/** @type {{ message: string, parents?: string[] }} */ { message, parents }) => {
      const sha = hexSha(1000000 + (++commitCounter));
      commits.set(sha, { message, parents: parents || [] });
      return sha;
    },
    nodeExists: async (/** @type {string} */ sha) => commits.has(sha),
    readTreeOids: async () => ({}),
  };
}

/**
 * @param {any} persistence
 * @param {{
 *   graphName: string,
 *   writerId: string,
 *   lamport: number,
 *   ops: Array<Record<string, unknown>>,
 *   reads?: string[],
 *   writes?: string[],
 *   context?: Map<string, number>|Record<string, number>|null
 * }} options
 * @returns {Promise<string>}
 */
async function simulatePatchCommit(persistence, {
  graphName,
  writerId,
  lamport,
  ops,
  reads,
  writes,
  context,
}) {
  const { encode } = await import('../../src/infrastructure/codecs/CborCodec.js');
  const { encodePatchMessage } = await import('../../src/domain/services/codec/WarpMessageCodec.js');
  const { buildWriterRef } = await import('../../src/domain/utils/RefLayout.ts');

  const patch = {
    schema: 2,
    writer: writerId,
    lamport,
    ops,
    ...(reads ? { reads } : {}),
    ...(writes ? { writes } : {}),
    context: context || VersionVector.empty(),
  };

  const patchBuffer = encode(patch);
  const patchOid = await persistence.writeBlob(patchBuffer);

  const writerRef = buildWriterRef(graphName, writerId);
  const parentSha = await persistence.readRef(writerRef);
  const parents = parentSha ? [parentSha] : [];
  const message = encodePatchMessage({
    graph: graphName,
    writer: writerId,
    patchOid,
    lamport,
  });
  const sha = await persistence.commitNode({ message, parents });
  await persistence.updateRef(writerRef, sha);
  return sha;
}

/**
 * @param {{
 *   patchCount: number,
 *   writerCount?: number,
 *   overlayPatchCount?: number
 * }} options
 * @returns {Promise<{
 *   graph: WarpCoreRuntime,
 *   coordinateSource: { kind: 'coordinate', frontier: Record<string, string>, ceiling: null },
 *   strandId: string,
 *   patchCount: number,
 *   captureAt: number,
 *   overlayPatchCount: number
 * }>}
 */
export async function seedDetachedReadBenchmarkFixture({
  patchCount,
  writerCount = 4,
  overlayPatchCount = Math.max(8, Math.min(64, Math.floor(patchCount / 20))),
}) {
  const persistence = createMockPersistence();
  const graphName = `detached-read-bench-${patchCount}`;
  const graph = /** @type {WarpCoreRuntime} */ (await WarpCore.open({
    persistence,
    graphName,
    writerId: 'bench',
    autoMaterialize: false,
  }));

  const captureAt = patchCount;
  const writers = Array.from({ length: writerCount }, (_, index) => `writer-${index}`);
  const lamports = new Map();
  /** @type {Map<string, string>|null} */
  let coordinateFrontier = null;
  const strandId = 'ws_bench';

  for (let index = 1; index <= patchCount; index += 1) {
    const writerId = writers[(index - 1) % writers.length];
    const lamport = (lamports.get(writerId) || 0) + 1;
    lamports.set(writerId, lamport);

    await simulatePatchCommit(persistence, {
      graphName,
      writerId,
      lamport,
      ops: [
        { type: 'NodeAdd', node: `task:${index}`, dot: Dot.create(writerId, lamport) },
        { type: 'PropSet', node: `task:${index}`, key: 'status', value: index <= captureAt ? 'captured' : 'live' },
        { type: 'PropSet', node: `task:${index}`, key: 'ordinal', value: index },
      ],
    });

  }

  coordinateFrontier = await graph.getFrontier();
  if (!coordinateFrontier) {
    throw new Error('benchmark fixture failed to capture coordinate frontier');
  }

  await graph.createStrand({
    strandId,
    owner: 'bench',
  });

  for (let index = 0; index < overlayPatchCount; index += 1) {
    const nodeOrdinal = (index % captureAt) + 1;
    await graph.patchStrand(strandId, (patch) => {
      patch.setProperty(`task:${nodeOrdinal}`, 'reviewState', `overlay-${index}`);
    });
  }

  return {
    graph,
    coordinateSource: {
      kind: 'coordinate',
      frontier: Object.fromEntries(coordinateFrontier),
      ceiling: null,
    },
    strandId,
    patchCount,
    captureAt,
    overlayPatchCount,
  };
}
