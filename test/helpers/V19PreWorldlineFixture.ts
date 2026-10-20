import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';

import GitStorage from '../../src/application/GitStorage.ts';
import { getDefaultRuntimeHostNodePorts } from '../../src/application/RuntimeHostNodeDefaults.ts';
import { resolveWarpStorage } from '../../src/application/WarpStorageRegistry.ts';
import { Dot } from '../../src/domain/crdt/Dot.ts';
import EdgeAdd from '../../src/domain/types/ops/EdgeAdd.ts';
import NodeAdd from '../../src/domain/types/ops/NodeAdd.ts';
import type { SnapshotPropValue } from '../../src/domain/services/snapshot/SnapshotPropValue.ts';
import type SnapshotWarpState from '../../src/domain/services/snapshot/SnapshotWarpState.ts';
import type { PatchOp } from '../../src/domain/types/ops/unions.ts';
import type Patch from '../../src/domain/types/Patch.ts';
import {
  openRuntimeHostProduct,
  type RuntimeHostProduct,
} from '../../src/domain/warp/RuntimeHostProduct.ts';

export const V19_PRE_WORLDLINE_DIR = resolve('fixtures/v19/pre-worldline');

/**
 * Git honors these over `-C` and cwd. A hook or wrapper shell can export
 * them, which would point the restore and the runtime's own git children at
 * the caller's repository instead of the scratch restore.
 */
const GIT_LOCATION_VARIABLES = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_COMMON_DIR',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_PREFIX',
] as const;

export type FixtureRef = Readonly<{
  refName: string;
  expectedHead: string;
  expectedObjectType: string;
}>;

export type FixtureScenario = Readonly<{
  graph: string;
  classification: 'golden' | 'edge-case' | 'known-failure';
  description: string;
  proposedMigration: Readonly<{
    verdict: 'migrate' | 'refuse';
    refusal?: 'duplicate-dot' | 'ownerless-strand';
    mints: readonly string[];
  }>;
}>;

export type V19PreWorldlineManifest = Readonly<{
  fixtureId: string;
  release: Readonly<{ tag: string; commit: string }>;
  bundlePath: string;
  bundleSha256: string;
  releaseCensusPath: string;
  excludedRefs: readonly string[];
  refs: readonly FixtureRef[];
  scenarios: readonly FixtureScenario[];
}>;

type AddSite = { type: string; target: string; dot: string };
type ChainCensus = {
  refName: string;
  patches: Array<{ sha: string; writer: string; lamport: number; adds: AddSite[] }>;
};
type VisibleState = { nodes: string[]; edges: string[] };
export type GraphCensus = {
  chains: ChainCensus[];
  duplicateDots: Array<{ dot: string; sites: Array<{ refName: string; sha: string; target: string }> }>;
  strands: Array<{
    strandId: string;
    owner: string | null;
    overlayId: string;
    overlayPatchCount: number;
    readOverlays: string[];
    visible: VisibleState;
  }>;
  visible: VisibleState & { properties: Record<string, Readonly<Record<string, SnapshotPropValue>>> };
};

export async function readV19PreWorldlineManifest(): Promise<V19PreWorldlineManifest> {
  const text = await readFile(join(V19_PRE_WORLDLINE_DIR, 'manifest.json'), 'utf8');
  return JSON.parse(text) as V19PreWorldlineManifest;
}

export async function readReleaseCensus(
  manifest: V19PreWorldlineManifest,
): Promise<Record<string, GraphCensus>> {
  const text = await readFile(join(V19_PRE_WORLDLINE_DIR, manifest.releaseCensusPath), 'utf8');
  return JSON.parse(text) as Record<string, GraphCensus>;
}

/** Restores the bundle into a fresh repository and verifies every pinned ref. */
export async function restoreV19PreWorldlineFixture(
  manifest: V19PreWorldlineManifest,
): Promise<string> {
  const bundlePath = join(V19_PRE_WORLDLINE_DIR, manifest.bundlePath);
  const digest = createHash('sha256').update(await readFile(bundlePath)).digest('hex');
  if (digest !== manifest.bundleSha256) {
    throw new Error(`v19 fixture bundle digest mismatch: ${digest}`);
  }
  for (const name of GIT_LOCATION_VARIABLES) {
    delete process.env[name];
  }
  const repository = await mkdtemp(join(tmpdir(), 'git-warp-v19-pre-worldline-'));
  git(repository, ['init', '-q', '--initial-branch=fixture']);
  git(repository, ['fetch', '-q', bundlePath, 'refs/warp/*:refs/warp/*']);
  const restored = git(repository, [
    'for-each-ref',
    '--format=%(refname) %(objectname) %(objecttype)',
    'refs/',
  ]);
  const expected = manifest.refs
    .map((ref) => `${ref.refName} ${ref.expectedHead} ${ref.expectedObjectType}`)
    .join('\n');
  if (restored !== expected) {
    throw new Error(`v19 fixture refs differ from manifest:\n${restored}`);
  }
  return repository;
}

/** Runs the census of `census.mjs` through the current source tree. */
export async function censusWithCurrentRuntime(
  repository: string,
  graphs: readonly string[],
): Promise<Record<string, GraphCensus>> {
  const refs = git(repository, ['for-each-ref', '--format=%(refname)', 'refs/warp/'])
    .split('\n')
    .map((refName) => refName.split('/'));
  const idsUnder = (graph: string, family: string): string[] => refs
    .filter((parts) => parts[2] === graph && parts[3] === family && parts.length === 5)
    .map((parts) => parts[4] ?? '')
    .sort();
  const census: Record<string, GraphCensus> = {};
  for (const graph of graphs) {
    census[graph] = await withHost(repository, graph, async (host) => {
      const chains: ChainCensus[] = [];
      for (const writerId of idsUnder(graph, 'writers')) {
        chains.push(describeChain(
          `refs/warp/${graph}/writers/${writerId}`,
          await host.getWriterPatches(writerId),
        ));
      }
      const strands: GraphCensus['strands'] = [];
      for (const strandId of idsUnder(graph, 'strands')) {
        const descriptor = await host.getStrand(strandId);
        if (descriptor === null) {
          throw new Error(`strand ${strandId} has no descriptor`);
        }
        chains.push(describeChain(
          `refs/warp/${graph}/strand-overlays/${strandId}`,
          await host.getStrandOverlayPatches(strandId),
        ));
        strands.push({
          strandId,
          owner: descriptor.owner,
          overlayId: descriptor.overlay.overlayId,
          overlayPatchCount: descriptor.overlay.patchCount,
          readOverlays: descriptor.braid.readOverlays.map((overlay) => overlay.strandId),
          visible: visibleState(await host.materializeStrand(strandId)),
        });
      }
      const visible = visibleState(await host.materialize());
      const properties: GraphCensus['visible']['properties'] = {};
      for (const node of visible.nodes) {
        const bag = await host.getNodeProps(node);
        if (bag !== null && Object.keys(bag).length > 0) {
          properties[node] = bag;
        }
      }
      return { chains, duplicateDots: duplicateDots(chains), strands, visible: { ...visible, properties } };
    });
  }
  return census;
}

async function withHost<T>(
  repository: string,
  graphName: string,
  work: (host: RuntimeHostProduct) => Promise<T>,
): Promise<T> {
  const storage = await GitStorage.open({ cwd: repository });
  try {
    const binding = resolveWarpStorage(storage);
    const ports = getDefaultRuntimeHostNodePorts();
    const host = await openRuntimeHostProduct({
      persistence: binding.history,
      runtimeStorage: binding.runtimeStorage,
      graphName,
      writerId: 'fixture-census',
      codec: ports.codec,
      crypto: ports.crypto,
      trustCrypto: ports.trustCrypto,
      commitMessageCodec: ports.commitMessageCodec,
    });
    return await work(host);
  } finally {
    await storage.close();
  }
}

function describeChain(
  refName: string,
  entries: ReadonlyArray<{ readonly sha: string; readonly patch: Patch }>,
): ChainCensus {
  return {
    refName,
    patches: entries.map(({ sha, patch }) => ({
      sha,
      writer: patch.writer,
      lamport: patch.lamport,
      adds: patch.ops.flatMap(describeAdd),
    })),
  };
}

function describeAdd(op: PatchOp): AddSite[] {
  if (op instanceof NodeAdd) {
    return [{ type: 'NodeAdd', target: op.node, dot: Dot.encode(op.dot) }];
  }
  if (op instanceof EdgeAdd) {
    return [{ type: 'EdgeAdd', target: `${op.from}->${op.to}:${op.label}`, dot: Dot.encode(op.dot) }];
  }
  return [];
}

function duplicateDots(chains: readonly ChainCensus[]): GraphCensus['duplicateDots'] {
  const sites = new Map<string, Array<{ refName: string; sha: string; target: string }>>();
  for (const chain of chains) {
    for (const patch of chain.patches) {
      for (const add of patch.adds) {
        const list = sites.get(add.dot) ?? [];
        list.push({ refName: chain.refName, sha: patch.sha, target: add.target });
        sites.set(add.dot, list);
      }
    }
  }
  return [...sites]
    .filter(([, list]) => list.length > 1)
    .map(([dot, list]) => ({ dot, sites: list }))
    .sort((left, right) => left.dot.localeCompare(right.dot));
}

function visibleState(state: SnapshotWarpState): VisibleState {
  return {
    nodes: [...state.nodeAlive.elements()].sort(),
    edges: [...state.edgeAlive.elements()].map((edge) => edge.split('\0').join('|')).sort(),
  };
}

function git(cwd: string, args: readonly string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
}
