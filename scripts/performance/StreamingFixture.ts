import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  deterministicPayload,
  PERFORMANCE_CORPUS_SEED,
  performanceNodeId,
} from './PerformanceFixture.ts';
import { openPerformanceRuntime } from './PerformanceRuntime.ts';
import {
  StreamingFixtureManifestSchema,
  type StreamingFixtureManifest,
} from './StreamingPerformanceModel.ts';

const MANIFEST_NAME = 'git-warp-streaming-fixture.json';

export type StreamingCorpusSpec = Readonly<{
  batchNodeCount: number;
  minimumLogicalToOldSpaceRatio: number;
  minimumPropertyPages: number;
  nodeCount: number;
  propertyBytesPerNode: number;
  seed?: number;
}>;

export type PreparedStreamingFixture = Readonly<{
  cleanup: () => Promise<void>;
  manifest: StreamingFixtureManifest;
  repositoryPath: string;
}>;

export async function prepareStreamingFixture(
  spec: StreamingCorpusSpec,
): Promise<PreparedStreamingFixture> {
  const repositoryPath = await mkdtemp(join(tmpdir(), 'git-warp-streaming-'));
  try {
    const seed = spec.seed ?? PERFORMANCE_CORPUS_SEED;
    const expectedFingerprint = createHash('sha256');
    const opened = await openPerformanceRuntime(repositoryPath);
    try {
      for (let start = 0; start < spec.nodeCount; start += spec.batchNodeCount) {
        const count = Math.min(spec.batchNodeCount, spec.nodeCount - start);
        await appendBatch(
          opened.runtime,
          start,
          count,
          spec.propertyBytesPerNode,
          seed,
          expectedFingerprint,
        );
      }
      await opened.runtime.materialize();
      await opened.runtime.createCheckpoint();
      const fingerprint = expectedFingerprint.digest('hex');
      const manifest: StreamingFixtureManifest = Object.freeze({
        batchNodeCount: spec.batchNodeCount,
        expectedFingerprint: fingerprint,
        graphName: 'performance',
        logicalPropertyBytes: spec.nodeCount * spec.propertyBytesPerNode,
        minimumLogicalToOldSpaceRatio: spec.minimumLogicalToOldSpaceRatio,
        minimumPropertyPages: spec.minimumPropertyPages,
        nodeCount: spec.nodeCount,
        persistenceMode: 'streaming-descriptor-checkpoint-v1',
        propertyBytesPerNode: spec.propertyBytesPerNode,
        seed,
        writerId: 'benchmark-writer',
      });
      await writeFixtureManifest(repositoryPath, manifest);
      return Object.freeze({
        cleanup: async () => await rm(repositoryPath, { recursive: true, force: true }),
        manifest,
        repositoryPath,
      });
    } finally {
      await opened.close();
    }
  } catch (raw) {
    await rm(repositoryPath, { recursive: true, force: true });
    throw raw;
  }
}

export async function readStreamingFixtureManifest(
  repositoryPath: string,
): Promise<StreamingFixtureManifest> {
  const parsed: unknown = JSON.parse(
    await readFile(join(repositoryPath, MANIFEST_NAME), 'utf8'),
  );
  return StreamingFixtureManifestSchema.parse(parsed);
}

async function appendBatch(
  runtime: Awaited<ReturnType<typeof openPerformanceRuntime>>['runtime'],
  start: number,
  count: number,
  propertyBytesPerNode: number,
  seed: number,
  fingerprint: ReturnType<typeof createHash>,
): Promise<void> {
  const descriptors = Array.from({ length: count }, (_, offset) => (
    streamingPayloadDescriptor(start + offset, propertyBytesPerNode, seed)
  ));
  for (const descriptor of descriptors) {
    fingerprint.update(decodeStreamingPayloadDescriptor(descriptor));
  }
  await runtime.patch((patch) => {
    for (const [offset, descriptor] of descriptors.entries()) {
      const index = start + offset;
      const nodeId = performanceNodeId(index);
      patch.addNode(nodeId).setProperty(nodeId, 'payload', descriptor);
      if (index > 0) {
        patch.addEdge(performanceNodeId(index - 1), nodeId, 'next');
      }
    }
  });
}

export function streamingPayloadDescriptor(
  index: number,
  byteLength: number,
  seed: number,
): string {
  return `git-warp.streaming-payload/v1:${String(index)}:${String(byteLength)}:${String(seed)}`;
}

export function decodeStreamingPayloadDescriptor(descriptor: string): string {
  const fields = descriptor.split(':');
  if (
    fields.length !== 4
    || fields[0] !== 'git-warp.streaming-payload/v1'
  ) {
    throw new Error('Streaming payload descriptor is invalid');
  }
  const index = descriptorInteger(fields[1], 'index');
  const byteLength = descriptorInteger(fields[2], 'byteLength');
  const seed = descriptorInteger(fields[3], 'seed');
  return deterministicPayload(index, byteLength, seed);
}

function descriptorInteger(value: string | undefined, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Streaming payload descriptor has an invalid ${field}`);
  }
  return parsed;
}

async function writeFixtureManifest(
  repositoryPath: string,
  manifest: StreamingFixtureManifest,
): Promise<void> {
  await writeFile(
    join(repositoryPath, MANIFEST_NAME),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
}
