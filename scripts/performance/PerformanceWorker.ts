import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { clearInterval, setInterval } from 'node:timers';
import { pathToFileURL } from 'node:url';
import { encodePropKey } from '../../src/domain/services/KeyCodec.ts';
import type SnapshotWarpState
  from '../../src/domain/services/snapshot/SnapshotWarpState.ts';
import {
  readPerformanceFixtureManifest,
  type PerformanceFixtureManifest,
} from './PerformanceFixture.ts';
import type {
  PerformanceSample,
  PerformanceScenarioName,
  SemanticObservation,
} from './PerformanceModel.ts';
import { assertMaterializationEvidence }
  from './PerformanceMaterializationEvidence.ts';
import { openPerformanceRuntime } from './PerformanceRuntime.ts';

const RESULT_PREFIX = 'GIT_WARP_PERFORMANCE_SAMPLE=';

export type PerformanceWorkerOptions = Readonly<{
  repositoryPath: string;
  scenario: PerformanceScenarioName;
}>;

async function main(): Promise<void> {
  const options = parseWorkerOptions(process.argv.slice(2));
  const sample = await runPerformanceWorker(options);
  process.stdout.write(`${RESULT_PREFIX}${JSON.stringify(sample)}\n`);
}

export async function runPerformanceWorker(
  options: PerformanceWorkerOptions,
): Promise<PerformanceSample> {
  const manifest = await readPerformanceFixtureManifest(options.repositoryPath);
  if (manifest.scenario !== options.scenario) {
    throw new Error('Performance worker scenario does not match its fixture');
  }
  const opened = await openPerformanceRuntime(options.repositoryPath);
  const gitCommandsBefore = opened.gitCommandCount();
  const gitHistogramBefore = opened.gitCommandHistogram();
  let replayedPatches = 0;
  const loadPatchChain = opened.runtime._loadPatchChainFromSha.bind(opened.runtime);
  opened.runtime._loadPatchChainFromSha = async (...args) => {
    const patches = await loadPatchChain(...args);
    replayedPatches += patches.length;
    return patches;
  };

  let peakHeapUsedBytes = 0;
  let peakRssBytes = 0;
  const sampleMemory = (): void => {
    const memory = process.memoryUsage();
    peakHeapUsedBytes = Math.max(peakHeapUsedBytes, memory.heapUsed);
    peakRssBytes = Math.max(peakRssBytes, memory.rss);
  };
  const sampler = setInterval(sampleMemory, 5);
  sampler.unref();
  sampleMemory();

  try {
    const cpuStart = process.cpuUsage();
    const wallStart = performance.now();
    const state = await opened.runtime.materialize();
    const wallMs = performance.now() - wallStart;
    const cpu = process.cpuUsage(cpuStart);
    sampleMemory();
    const semantic = summarizeSemanticState(state, manifest);
    assertSemanticCompletion(semantic, manifest);
    const evidence = Object.freeze({
      ...opened.materializationEvidence(),
      replayedPatches,
    });
    assertMaterializationEvidence(evidence, options.scenario, manifest.corpus);
    return Object.freeze({
      cpuSystemMs: cpu.system / 1000,
      cpuTotalMs: (cpu.user + cpu.system) / 1000,
      cpuUserMs: cpu.user / 1000,
      gitCommandCount: opened.gitCommandCount() - gitCommandsBefore,
      gitCommandHistogram: subtractHistograms(
        opened.gitCommandHistogram(),
        gitHistogramBefore,
      ),
      maxRssBytes: Math.max(
        peakRssBytes,
        process.resourceUsage().maxRSS * 1024,
      ),
      observation: Object.freeze({
        materialization: evidence,
        semantic,
      }),
      peakHeapUsedBytes,
      throughputPerSecond: semantic.nodeCount / (wallMs / 1000),
      wallMs,
      workerLifecycleWallMs: null,
    });
  } finally {
    clearInterval(sampler);
    await opened.close();
  }
}

function summarizeSemanticState(
  state: SnapshotWarpState,
  manifest: PerformanceFixtureManifest,
): SemanticObservation {
  const nodes = [...state.nodeAlive.elements()].sort();
  const edges = [...state.edgeAlive.elements()].sort();
  const properties = [...state.prop]
    .map(([key, register]) => [key, register.value] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  const targetValue = state.prop.get(
    encodePropKey(manifest.targetNodeId, 'payload'),
  )?.value;
  if (typeof targetValue !== 'string') {
    throw new Error('Performance corpus target property is not a string');
  }
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ edges, nodes, properties }))
    .digest('hex');
  return Object.freeze({
    edgeCount: edges.length,
    fingerprint,
    nodeCount: nodes.length,
    propertyCount: properties.length,
    targetPropertyBytes: Buffer.byteLength(targetValue),
  });
}

function assertSemanticCompletion(
  observation: SemanticObservation,
  manifest: PerformanceFixtureManifest,
): void {
  if (
    observation.nodeCount !== manifest.corpus.nodeCount
    || observation.edgeCount !== manifest.corpus.edgeCount
    || observation.propertyCount !== manifest.corpus.propertyCount
    || observation.targetPropertyBytes !== manifest.expectedPropertyBytes
  ) {
    throw new Error('Performance materialization did not produce the expected corpus');
  }
}

function subtractHistograms(
  after: Readonly<Record<string, number>>,
  before: Readonly<Record<string, number>>,
): Readonly<Record<string, number>> {
  return Object.freeze(Object.fromEntries(
    Object.entries(after)
      .map(([command, count]) => [command, count - (before[command] ?? 0)] as const)
      .filter(([, count]) => count > 0),
  ));
}

function parseWorkerOptions(args: readonly string[]): PerformanceWorkerOptions {
  let repositoryPath: string | undefined;
  let scenario: PerformanceScenarioName | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const value = args[index + 1];
    if (argument === '--repo' && value !== undefined) {
      repositoryPath = value;
      index += 1;
    } else if (argument === '--scenario' && isScenario(value)) {
      scenario = value;
      index += 1;
    } else {
      throw new Error(`Unknown performance worker argument: ${String(argument)}`);
    }
  }
  if (repositoryPath === undefined || scenario === undefined) {
    throw new Error('Performance worker requires --repo and --scenario');
  }
  return Object.freeze({ repositoryPath, scenario });
}

function isScenario(value: string | undefined): value is PerformanceScenarioName {
  return value === 'cold-materialize'
    || value === 'warm-materialize'
    || value === 'incremental-materialize';
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

if (isMainModule()) {
  void main().catch((raw: unknown) => {
    const message = raw instanceof Error ? raw.stack ?? raw.message : String(raw);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
