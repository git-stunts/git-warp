import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import z from 'zod';
import type RuntimeHost from '../../src/domain/RuntimeHost.ts';
import {
  CorpusProfileSchema,
  PERFORMANCE_CORPUS_VERSION,
  PERFORMANCE_SCENARIOS,
  type CorpusProfile,
  type PerformanceScenarioName,
} from './PerformanceModel.ts';
import { openPerformanceRuntime } from './PerformanceRuntime.ts';

const MANIFEST_NAME = 'git-warp-performance-fixture.json';
const GRAPH_NAME = 'performance';
const WRITER_ID = 'benchmark-writer';

export const PERFORMANCE_CORPUS_SEED = 0x19c0ffee;

export type CorpusSpec = Readonly<{
  baseNodeCount: number;
  basePatchCount?: number;
  propertyBytesPerNode: number;
  seed?: number;
  suffixNodeCount?: number;
  suffixPatchCount?: number;
}>;

type ResolvedCorpusSpec = Readonly<{
  baseNodeCount: number;
  basePatchCount: number;
  propertyBytesPerNode: number;
  seed: number;
  suffixNodeCount: number;
  suffixPatchCount: number;
  version: 1 | 2;
}>;

type CorpusSegment = Readonly<{
  nodeCount: number;
  patchCount: number;
  propertyBytesPerNode: number;
  seed: number;
  start: number;
}>;

const manifestSchema = z.object({
  corpus: CorpusProfileSchema,
  expectedPropertyBytes: z.number().int().positive(),
  graphName: z.literal(GRAPH_NAME),
  scenario: z.enum(PERFORMANCE_SCENARIOS),
  targetNodeId: z.string().min(1),
  writerId: z.literal(WRITER_ID),
}).strict();

export type PerformanceFixtureManifest = Readonly<z.infer<typeof manifestSchema>>;

export type PreparedPerformanceFixture = Readonly<{
  cleanup: () => Promise<void>;
  manifest: PerformanceFixtureManifest;
  repositoryPath: string;
}>;

export async function preparePerformanceFixture(
  scenario: PerformanceScenarioName,
  spec: CorpusSpec,
): Promise<PreparedPerformanceFixture> {
  const repositoryPath = await mkdtemp(join(tmpdir(), `git-warp-${scenario}-`));
  try {
    const corpusSpec = resolveCorpusSpec(scenario, spec);
    const opened = await openPerformanceRuntime(repositoryPath);
    try {
      await appendCorpus(opened.runtime, Object.freeze({
        nodeCount: corpusSpec.baseNodeCount,
        patchCount: corpusSpec.basePatchCount,
        propertyBytesPerNode: corpusSpec.propertyBytesPerNode,
        seed: corpusSpec.seed,
        start: 0,
      }));
      if (scenario === 'warm-materialize' || scenario === 'incremental-materialize') {
        await opened.runtime.materialize();
      }
      if (scenario === 'incremental-materialize') {
        await appendCorpus(opened.runtime, Object.freeze({
          nodeCount: corpusSpec.suffixNodeCount,
          patchCount: corpusSpec.suffixPatchCount,
          propertyBytesPerNode: corpusSpec.propertyBytesPerNode,
          seed: corpusSpec.seed,
          start: corpusSpec.baseNodeCount,
        }));
      }
    } finally {
      await opened.close();
    }

    const manifest = fixtureManifest(scenario, corpusSpec);
    await writeFile(
      join(repositoryPath, MANIFEST_NAME),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    );
    return Object.freeze({
      cleanup: async () => await rm(repositoryPath, { recursive: true, force: true }),
      manifest,
      repositoryPath,
    });
  } catch (raw) {
    await rm(repositoryPath, { recursive: true, force: true });
    throw raw;
  }
}

export async function readPerformanceFixtureManifest(
  repositoryPath: string,
): Promise<PerformanceFixtureManifest> {
  const parsed: unknown = JSON.parse(
    await readFile(join(repositoryPath, MANIFEST_NAME), 'utf8'),
  );
  return manifestSchema.parse(parsed);
}

async function appendCorpus(
  runtime: RuntimeHost,
  segment: CorpusSegment,
): Promise<void> {
  let start = segment.start;
  for (const nodeCount of partitionNodeCounts(segment)) {
    await appendPatch(runtime, Object.freeze({ ...segment, nodeCount, start }));
    start += nodeCount;
  }
}

async function appendPatch(
  runtime: RuntimeHost,
  segment: CorpusSegment,
): Promise<void> {
  await runtime.patch((patch) => {
    for (let offset = 0; offset < segment.nodeCount; offset += 1) {
      const index = segment.start + offset;
      const nodeId = performanceNodeId(index);
      patch
        .addNode(nodeId)
        .setProperty(
          nodeId,
          'payload',
          deterministicPayload(
            index,
            segment.propertyBytesPerNode,
            segment.seed,
          ),
        );
      if (index > 0) {
        patch.addEdge(performanceNodeId(index - 1), nodeId, 'next');
      }
    }
  });
}

function partitionNodeCounts(segment: CorpusSegment): readonly number[] {
  const baseSize = Math.floor(segment.nodeCount / segment.patchCount);
  const remainder = segment.nodeCount % segment.patchCount;
  return Object.freeze(Array.from(
    { length: segment.patchCount },
    (_, index) => baseSize + (index < remainder ? 1 : 0),
  ));
}

export function deterministicPayload(
  index: number,
  byteLength: number,
  seed: number,
): string {
  const prefix = `${index.toString(16).padStart(12, '0')}:`;
  if (byteLength < prefix.length) {
    throw new Error('Performance property size is smaller than its deterministic prefix');
  }
  let state = (seed ^ index) >>> 0;
  const payload = Buffer.allocUnsafe(byteLength);
  payload.write(prefix, 0, 'ascii');
  for (let offset = prefix.length; offset < byteLength; offset += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    payload[offset] = 97 + ((state >>> 0) % 26);
  }
  return payload.toString('ascii');
}

function fixtureManifest(
  scenario: PerformanceScenarioName,
  spec: ResolvedCorpusSpec,
): PerformanceFixtureManifest {
  const nodeCount = spec.baseNodeCount + spec.suffixNodeCount;
  const common = Object.freeze({
    baseNodeCount: spec.baseNodeCount,
    edgeCount: Math.max(0, nodeCount - 1),
    logicalPropertyBytes: nodeCount * spec.propertyBytesPerNode,
    nodeCount,
    propertyBytesPerNode: spec.propertyBytesPerNode,
    propertyCount: nodeCount,
    seed: spec.seed,
    suffixNodeCount: spec.suffixNodeCount,
    topology: 'directed-chain',
  });
  const corpus: CorpusProfile = spec.version === PERFORMANCE_CORPUS_VERSION
    ? Object.freeze({
      ...common,
      basePatchCount: spec.basePatchCount,
      format: 'git-warp.performance.corpus/v2',
      suffixPatchCount: spec.suffixPatchCount,
      version: PERFORMANCE_CORPUS_VERSION,
    })
    : Object.freeze({
      ...common,
      format: 'git-warp.performance.corpus/v1',
      version: 1,
    });
  return Object.freeze({
    corpus,
    expectedPropertyBytes: spec.propertyBytesPerNode,
    graphName: GRAPH_NAME,
    scenario,
    targetNodeId: performanceNodeId(nodeCount - 1),
    writerId: WRITER_ID,
  });
}

function resolveCorpusSpec(
  scenario: PerformanceScenarioName,
  spec: CorpusSpec,
): ResolvedCorpusSpec {
  const version = spec.basePatchCount === undefined && spec.suffixPatchCount === undefined
    ? 1
    : 2;
  const suffixNodeCount = scenario === 'incremental-materialize'
    ? spec.suffixNodeCount ?? 1
    : 0;
  const basePatchCount = version === 1 ? 1 : spec.basePatchCount ?? 1;
  const suffixPatchCount = scenario === 'incremental-materialize'
    ? version === 1 ? 1 : spec.suffixPatchCount ?? 1
    : 0;
  assertSegmentCardinality('base', spec.baseNodeCount, basePatchCount);
  if (scenario === 'incremental-materialize') {
    assertSegmentCardinality('suffix', suffixNodeCount, suffixPatchCount);
  }
  return Object.freeze({
    baseNodeCount: spec.baseNodeCount,
    basePatchCount,
    propertyBytesPerNode: spec.propertyBytesPerNode,
    seed: spec.seed ?? PERFORMANCE_CORPUS_SEED,
    suffixNodeCount,
    suffixPatchCount,
    version,
  });
}

function assertSegmentCardinality(
  name: 'base' | 'suffix',
  nodeCount: number,
  patchCount: number,
): void {
  if (!Number.isSafeInteger(nodeCount) || nodeCount <= 0) {
    throw new Error(`Performance ${name} node count must be a positive safe integer`);
  }
  if (!Number.isSafeInteger(patchCount) || patchCount <= 0) {
    throw new Error(`Performance ${name} patch count must be a positive safe integer`);
  }
  if (patchCount > nodeCount) {
    throw new Error(`Performance ${name} patch count cannot exceed its node count`);
  }
}

export function performanceNodeId(index: number): string {
  return `node:${index.toString().padStart(8, '0')}`;
}
