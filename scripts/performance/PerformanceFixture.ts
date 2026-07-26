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
  propertyBytesPerNode: number;
  seed?: number;
  suffixNodeCount?: number;
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
    const suffixNodeCount = scenario === 'incremental-materialize'
      ? spec.suffixNodeCount ?? 1
      : 0;
    const seed = spec.seed ?? PERFORMANCE_CORPUS_SEED;
    const opened = await openPerformanceRuntime(repositoryPath);
    try {
      await appendCorpus(
        opened.runtime,
        0,
        spec.baseNodeCount,
        spec.propertyBytesPerNode,
        seed,
      );
      if (scenario === 'warm-materialize' || scenario === 'incremental-materialize') {
        await opened.runtime.materialize();
      }
      if (scenario === 'incremental-materialize') {
        await appendCorpus(
          opened.runtime,
          spec.baseNodeCount,
          suffixNodeCount,
          spec.propertyBytesPerNode,
          seed,
        );
      }
    } finally {
      await opened.close();
    }

    const manifest = fixtureManifest(
      scenario,
      spec.baseNodeCount,
      suffixNodeCount,
      spec.propertyBytesPerNode,
      seed,
    );
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
  start: number,
  count: number,
  propertyBytesPerNode: number,
  seed: number,
): Promise<void> {
  await runtime.patch((patch) => {
    for (let offset = 0; offset < count; offset += 1) {
      const index = start + offset;
      const nodeId = performanceNodeId(index);
      patch
        .addNode(nodeId)
        .setProperty(
          nodeId,
          'payload',
          deterministicPayload(index, propertyBytesPerNode, seed),
        );
      if (index > 0) {
        patch.addEdge(performanceNodeId(index - 1), nodeId, 'next');
      }
    }
  });
}

function deterministicPayload(index: number, byteLength: number, seed: number): string {
  const prefix = `${index.toString(16).padStart(12, '0')}:`;
  if (byteLength < prefix.length) {
    throw new Error('Performance property size is smaller than its deterministic prefix');
  }
  let state = (seed ^ index) >>> 0;
  let payload = prefix;
  while (payload.length < byteLength) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    payload += String.fromCharCode(97 + ((state >>> 0) % 26));
  }
  return payload;
}

function fixtureManifest(
  scenario: PerformanceScenarioName,
  baseNodeCount: number,
  suffixNodeCount: number,
  propertyBytesPerNode: number,
  seed: number,
): PerformanceFixtureManifest {
  const nodeCount = baseNodeCount + suffixNodeCount;
  const corpus: CorpusProfile = Object.freeze({
    baseNodeCount,
    edgeCount: Math.max(0, nodeCount - 1),
    format: 'git-warp.performance.corpus/v1',
    logicalPropertyBytes: nodeCount * propertyBytesPerNode,
    nodeCount,
    propertyBytesPerNode,
    propertyCount: nodeCount,
    seed,
    suffixNodeCount,
    topology: 'directed-chain',
    version: PERFORMANCE_CORPUS_VERSION,
  });
  return Object.freeze({
    corpus,
    expectedPropertyBytes: propertyBytesPerNode,
    graphName: GRAPH_NAME,
    scenario,
    targetNodeId: performanceNodeId(nodeCount - 1),
    writerId: WRITER_ID,
  });
}

function performanceNodeId(index: number): string {
  return `node:${index.toString().padStart(8, '0')}`;
}
