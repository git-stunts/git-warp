import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Plumbing from '@git-stunts/plumbing';
import RuntimeHost from '../../src/domain/RuntimeHost.ts';
import GitCasRepositoryAdapter from '../../src/infrastructure/adapters/GitCasRepositoryAdapter.ts';
import GitTimelineHistoryAdapter, {
  type CollectableStream,
  type GitPlumbing,
} from '../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import { TrailerCommitMessageCodecAdapter } from '../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import WebCryptoAdapter from '../../src/infrastructure/adapters/WebCryptoAdapter.ts';
import defaultCodec from '../../src/infrastructure/codecs/CborCodec.ts';
import type RuntimeStorageProviderPort from '../../src/ports/RuntimeStorageProviderPort.ts';
import type {
  RuntimeStorageRequest,
  RuntimeStorageServices,
} from '../../src/ports/RuntimeStorageProviderPort.ts';
import type { CorpusProfile, PerformanceScenarioName } from './PerformanceModel.ts';

const MANIFEST_NAME = 'git-warp-performance-fixture.json';
const GRAPH_NAME = 'performance';
const WRITER_ID = 'benchmark-writer';

export type CorpusSpec = Readonly<{
  nodeCount: number;
  propertyBytesPerNode: number;
  suffixNodeCount?: number;
}>;

export type PerformanceFixtureManifest = Readonly<{
  corpus: CorpusProfile;
  expectedPropertyBytes: number;
  graphName: string;
  scenario: PerformanceScenarioName;
  targetNodeId: string;
  writerId: string;
}>;

export type OpenPerformanceRuntime = Readonly<{
  gitCommandCount: () => number;
  gitCommandHistogram: () => Readonly<Record<string, number>>;
  runtime: RuntimeHost;
}>;

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
    const opened = await openPerformanceRuntime(repositoryPath);
    let nodeCount: number;
    try {
      await appendCorpus(opened.runtime, 0, spec.nodeCount, spec.propertyBytesPerNode);
      if (scenario === 'warm-property-read' || scenario === 'bounded-memory-read') {
        await opened.runtime.materialize();
      }
      nodeCount = spec.nodeCount;
      if (scenario === 'incremental-materialize') {
        await opened.runtime.materialize();
        const suffixNodeCount = spec.suffixNodeCount ?? 1;
        await appendCorpus(
          opened.runtime,
          nodeCount,
          suffixNodeCount,
          spec.propertyBytesPerNode,
        );
        nodeCount += suffixNodeCount;
      }
    } finally {
      await opened.runtime.close();
    }
    const manifest = fixtureManifest(scenario, nodeCount, spec.propertyBytesPerNode);
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
  const parsed: unknown = JSON.parse(await readFile(join(repositoryPath, MANIFEST_NAME), 'utf8'));
  return requireManifest(parsed);
}

export async function openPerformanceRuntime(
  repositoryPath: string,
): Promise<OpenPerformanceRuntime> {
  const rawPlumbing = await Plumbing.createDefault({ cwd: repositoryPath });
  const plumbing = new CountingPlumbing(rawPlumbing);
  await plumbing.execute({ args: ['init'] });
  await plumbing.execute({ args: ['config', 'user.email', 'performance@git-warp.invalid'] });
  await plumbing.execute({ args: ['config', 'user.name', 'git-warp performance'] });
  const persistence = new GitTimelineHistoryAdapter({ plumbing });
  const runtimeStorage = new CapturingStorageProvider(new GitCasRepositoryAdapter({
    plumbing,
    history: persistence,
  }));
  const runtime = await RuntimeHost.open({
    persistence,
    runtimeStorage,
    graphName: GRAPH_NAME,
    writerId: WRITER_ID,
    codec: defaultCodec,
    crypto: new WebCryptoAdapter(),
    commitMessageCodec: new TrailerCommitMessageCodecAdapter(),
    autoMaterialize: false,
  });
  return Object.freeze({
    gitCommandCount: () => plumbing.commandCount,
    gitCommandHistogram: () => plumbing.commandHistogram(),
    runtime,
  });
}

class CountingPlumbing implements GitPlumbing {
  readonly emptyTree: string;
  commandCount = 0;
  readonly #commands = new Map<string, number>();
  readonly #delegate: GitPlumbing;

  constructor(delegate: GitPlumbing) {
    this.#delegate = delegate;
    this.emptyTree = delegate.emptyTree;
  }

  async execute(options: Parameters<GitPlumbing['execute']>[0]): Promise<string> {
    this.#record(options.args);
    return await this.#delegate.execute(options);
  }

  async executeStream(
    options: Parameters<GitPlumbing['executeStream']>[0],
  ): Promise<CollectableStream> {
    this.#record(options.args);
    return await this.#delegate.executeStream(options);
  }

  commandHistogram(): Readonly<Record<string, number>> {
    return Object.freeze(Object.fromEntries(this.#commands));
  }

  #record(args: readonly string[]): void {
    this.commandCount += 1;
    const command = commandCategory(args);
    this.#commands.set(command, (this.#commands.get(command) ?? 0) + 1);
  }
}

function commandCategory(args: readonly string[]): string {
  const command = args[0] ?? '<empty>';
  if (command === 'ls-tree') {
    return args.includes('--') ? 'ls-tree:targeted' : 'ls-tree:full';
  }
  if (command === 'cat-file') {
    const mode = args[1] ?? '<missing>';
    if (mode.startsWith('--batch-check=')) {
      return 'cat-file:batch-check';
    }
    return `cat-file:${mode}`;
  }
  return command;
}

class CapturingStorageProvider implements RuntimeStorageProviderPort {
  readonly #delegate: RuntimeStorageProviderPort;

  constructor(delegate: RuntimeStorageProviderPort) {
    this.#delegate = delegate;
  }

  async createRuntimeStorageServices(
    request: RuntimeStorageRequest,
  ): Promise<RuntimeStorageServices> {
    return await this.#delegate.createRuntimeStorageServices(request);
  }
}

async function appendCorpus(
  runtime: RuntimeHost,
  start: number,
  count: number,
  propertyBytesPerNode: number,
): Promise<void> {
  await runtime.patch((patch) => {
    for (let offset = 0; offset < count; offset += 1) {
      const index = start + offset;
      const nodeId = performanceNodeId(index);
      patch
        .addNode(nodeId)
        .setProperty(nodeId, 'payload', deterministicPayload(index, propertyBytesPerNode));
      if (index > 0) {
        patch.addEdge(performanceNodeId(index - 1), nodeId, 'next');
      }
    }
  });
}

function deterministicPayload(index: number, byteLength: number): string {
  const prefix = `${index.toString(16).padStart(12, '0')}:`;
  if (byteLength < prefix.length) {
    throw new Error('Performance property size is smaller than its deterministic prefix');
  }
  const fill = String.fromCharCode(97 + (index % 26));
  return `${prefix}${fill.repeat(byteLength - prefix.length)}`;
}

function fixtureManifest(
  scenario: PerformanceScenarioName,
  nodeCount: number,
  propertyBytesPerNode: number,
): PerformanceFixtureManifest {
  const logicalPropertyBytes = nodeCount * propertyBytesPerNode;
  return Object.freeze({
    corpus: Object.freeze({
      edgeCount: Math.max(0, nodeCount - 1),
      logicalPropertyBytes,
      nodeCount,
      propertyBytesPerNode,
      propertyCount: nodeCount,
      topology: 'directed-chain',
    }),
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

function requireManifest(value: unknown): PerformanceFixtureManifest {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Performance fixture manifest must be an object');
  }
  const candidate = value as Partial<PerformanceFixtureManifest>; // nosemgrep: ts-no-unsafe-type-assertion -- parsed benchmark fixture validated below
  if (
    typeof candidate.graphName !== 'string'
    || typeof candidate.writerId !== 'string'
    || typeof candidate.targetNodeId !== 'string'
    || typeof candidate.expectedPropertyBytes !== 'number'
    || candidate.corpus === undefined
  ) {
    throw new Error('Performance fixture manifest is incomplete');
  }
  return candidate as PerformanceFixtureManifest; // nosemgrep: ts-no-unsafe-type-assertion -- validated required fixture fields
}
