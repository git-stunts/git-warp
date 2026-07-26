import z from 'zod';
import { summarizeDistribution } from './PerformanceStatistics.ts';

export const PERFORMANCE_SCHEMA_VERSION = 1;
export const PERFORMANCE_CORPUS_VERSION = 1;

export const PERFORMANCE_SCENARIOS = Object.freeze([
  'cold-materialize',
  'warm-materialize',
  'incremental-materialize',
] as const);

export type PerformanceScenarioName = (typeof PERFORMANCE_SCENARIOS)[number];

const nonNegativeFinite = z.number().finite().nonnegative();
const nonNegativeInteger = z.number().int().nonnegative();
const positiveInteger = z.number().int().positive();

export const CorpusProfileSchema = z.object({
  baseNodeCount: positiveInteger,
  edgeCount: nonNegativeInteger,
  format: z.literal('git-warp.performance.corpus/v1'),
  logicalPropertyBytes: nonNegativeInteger,
  nodeCount: positiveInteger,
  propertyBytesPerNode: positiveInteger,
  propertyCount: positiveInteger,
  seed: nonNegativeInteger,
  suffixNodeCount: nonNegativeInteger,
  topology: z.literal('directed-chain'),
  version: z.literal(PERFORMANCE_CORPUS_VERSION),
}).strict();

const materializationEvidenceSchema = z.object({
  exactHits: nonNegativeInteger,
  exactLookups: nonNegativeInteger,
  predecessorHits: nonNegativeInteger,
  predecessorLookups: nonNegativeInteger,
  replayedPatches: nonNegativeInteger,
  retainRequests: nonNegativeInteger,
}).strict();

const semanticObservationSchema = z.object({
  edgeCount: nonNegativeInteger,
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/u),
  nodeCount: positiveInteger,
  propertyCount: positiveInteger,
  targetPropertyBytes: positiveInteger,
}).strict();

const workerObservationSchema = z.object({
  materialization: materializationEvidenceSchema,
  semantic: semanticObservationSchema,
}).strict();

export const PerformanceSampleSchema = z.object({
  cpuSystemMs: nonNegativeFinite,
  cpuTotalMs: nonNegativeFinite,
  cpuUserMs: nonNegativeFinite,
  gitCommandCount: nonNegativeInteger,
  gitCommandHistogram: z.record(z.string(), nonNegativeInteger),
  maxRssBytes: positiveInteger,
  observation: workerObservationSchema,
  peakHeapUsedBytes: positiveInteger,
  throughputPerSecond: nonNegativeFinite,
  wallMs: nonNegativeFinite,
  workerLifecycleWallMs: nonNegativeFinite.nullable(),
}).strict();

const distributionSchema = z.object({
  mad: nonNegativeFinite,
  maximum: nonNegativeFinite,
  median: nonNegativeFinite,
  minimum: nonNegativeFinite,
  samples: z.array(nonNegativeFinite).min(1).readonly(),
}).strict();

const scenarioResultSchema = z.object({
  corpus: CorpusProfileSchema,
  cpuSystemMs: distributionSchema,
  cpuTotalMs: distributionSchema,
  cpuUserMs: distributionSchema,
  gitCommandCount: distributionSchema,
  maxRssBytes: distributionSchema,
  measuredRuns: positiveInteger,
  peakHeapUsedBytes: distributionSchema,
  samples: z.array(PerformanceSampleSchema).min(1).readonly(),
  scenario: z.enum(PERFORMANCE_SCENARIOS),
  throughputPerSecond: distributionSchema,
  wallMs: distributionSchema,
  warmupRuns: nonNegativeInteger,
}).strict();

export const PerformanceResultSchema = z.object({
  commit: z.string().min(1),
  environment: z.object({
    architecture: z.string().min(1),
    cpuCount: positiveInteger,
    cpuModel: z.string().min(1),
    git: z.string().min(1),
    gitCas: z.string().min(1),
    node: z.string().min(1),
    platform: z.enum([
      'aix',
      'android',
      'darwin',
      'freebsd',
      'haiku',
      'linux',
      'openbsd',
      'sunos',
      'win32',
      'cygwin',
      'netbsd',
    ]),
    runner: z.string().min(1),
  }).strict(),
  generatedAt: z.string().datetime(),
  instrumentation: z.object({
    corpusSetup: z.literal('excluded'),
    cpuScope: z.enum(['process-and-descendants', 'node-process']),
    gitCommands: z.literal('timed-operation-plumbing-calls'),
    memoryScope: z.enum(['worker-lifecycle', 'node-process']),
    wallClock: z.literal('materialize-operation'),
  }).strict(),
  scenarios: z.object({
    'cold-materialize': scenarioResultSchema,
    'incremental-materialize': scenarioResultSchema,
    'warm-materialize': scenarioResultSchema,
  }).strict(),
  schemaVersion: z.literal(PERFORMANCE_SCHEMA_VERSION),
}).strict();

export type CorpusProfile = Readonly<z.infer<typeof CorpusProfileSchema>>;
export type MaterializationEvidence = Readonly<
  z.infer<typeof materializationEvidenceSchema>
>;
export type SemanticObservation = Readonly<z.infer<typeof semanticObservationSchema>>;
export type WorkerObservation = Readonly<z.infer<typeof workerObservationSchema>>;
export type PerformanceSample = Readonly<z.infer<typeof PerformanceSampleSchema>>;
export type Distribution = Readonly<z.infer<typeof distributionSchema>>;
export type ScenarioResult = Readonly<z.infer<typeof scenarioResultSchema>>;
export type PerformanceResult = Readonly<z.infer<typeof PerformanceResultSchema>>;

export function parsePerformanceResult(value: unknown): PerformanceResult {
  const result = PerformanceResultSchema.parse(value);
  validatePerformanceResult(result);
  return result;
}

export function validatePerformanceResult(result: PerformanceResult): void {
  for (const scenario of PERFORMANCE_SCENARIOS) {
    const scenarioResult = result.scenarios[scenario];
    if (scenarioResult.scenario !== scenario) {
      throw new Error(`Performance scenario key does not match its record: ${scenario}`);
    }
    if (scenarioResult.measuredRuns !== scenarioResult.samples.length) {
      throw new Error(`Performance measured-run count is inconsistent: ${scenario}`);
    }
    assertCorpusShape(scenarioResult.corpus, scenario);
    assertDistributions(scenarioResult, scenario);
    const fingerprints = new Set(
      scenarioResult.samples.map((sample) => sample.observation.semantic.fingerprint),
    );
    if (fingerprints.size !== 1) {
      throw new Error(`Performance scenario produced unstable semantics: ${scenario}`);
    }
    for (const sample of scenarioResult.samples) {
      assertSemanticCompletion(sample, scenarioResult.corpus, scenario);
    }
  }

  const cold = result.scenarios['cold-materialize'];
  const warm = result.scenarios['warm-materialize'];
  if (JSON.stringify(cold.corpus) !== JSON.stringify(warm.corpus)) {
    throw new Error('Cold and warm materialization corpora differ');
  }
  const coldFingerprints = new Set(
    cold.samples.map((sample) => sample.observation.semantic.fingerprint),
  );
  const warmFingerprints = new Set(
    warm.samples.map((sample) => sample.observation.semantic.fingerprint),
  );
  if (coldFingerprints.size !== 1 || warmFingerprints.size !== 1) {
    throw new Error('Cold or warm materialization produced unstable semantic results');
  }
  if ([...coldFingerprints][0] !== [...warmFingerprints][0]) {
    throw new Error('Cold and warm materialization produced different semantic results');
  }
}

function assertCorpusShape(
  corpus: CorpusProfile,
  scenario: PerformanceScenarioName,
): void {
  if (corpus.nodeCount !== corpus.baseNodeCount + corpus.suffixNodeCount) {
    throw new Error(`Performance corpus node counts are inconsistent: ${scenario}`);
  }
  if (corpus.edgeCount !== Math.max(0, corpus.nodeCount - 1)) {
    throw new Error(`Performance corpus edge count is inconsistent: ${scenario}`);
  }
  if (corpus.propertyCount !== corpus.nodeCount) {
    throw new Error(`Performance corpus property count is inconsistent: ${scenario}`);
  }
  if (corpus.logicalPropertyBytes !== corpus.nodeCount * corpus.propertyBytesPerNode) {
    throw new Error(`Performance corpus logical size is inconsistent: ${scenario}`);
  }
  if (
    scenario === 'incremental-materialize'
      ? corpus.suffixNodeCount === 0
      : corpus.suffixNodeCount !== 0
  ) {
    throw new Error(`Performance corpus suffix does not match its scenario: ${scenario}`);
  }
}

function assertSemanticCompletion(
  sample: PerformanceSample,
  corpus: CorpusProfile,
  scenario: PerformanceScenarioName,
): void {
  const histogramCount = Object.values(sample.gitCommandHistogram)
    .reduce((total, count) => total + count, 0);
  if (histogramCount !== sample.gitCommandCount) {
    throw new Error(`Performance Git-command evidence is inconsistent: ${scenario}`);
  }
  const semantic = sample.observation.semantic;
  if (
    semantic.nodeCount !== corpus.nodeCount
    || semantic.edgeCount !== corpus.edgeCount
    || semantic.propertyCount !== corpus.propertyCount
    || semantic.targetPropertyBytes !== corpus.propertyBytesPerNode
  ) {
    throw new Error(`Performance sample did not complete semantically: ${scenario}`);
  }
  assertMaterializationEvidence(sample.observation.materialization, scenario);
}

function assertMaterializationEvidence(
  evidence: MaterializationEvidence,
  scenario: PerformanceScenarioName,
): void {
  if (
    evidence.exactHits > evidence.exactLookups
    || evidence.predecessorHits > evidence.predecessorLookups
  ) {
    throw new Error(`Performance git-cas evidence is inconsistent: ${scenario}`);
  }
  if (
    scenario === 'cold-materialize'
    && (evidence.exactHits !== 0
      || evidence.predecessorHits !== 0
      || evidence.replayedPatches === 0
      || evidence.retainRequests === 0)
  ) {
    throw new Error('Cold materialization did not prove a cold replay');
  }
  if (
    scenario === 'warm-materialize'
    && (evidence.exactHits === 0
      || evidence.replayedPatches !== 0
      || evidence.retainRequests !== 0)
  ) {
    throw new Error('Warm materialization did not prove an exact git-cas hit');
  }
  if (
    scenario === 'incremental-materialize'
    && (evidence.predecessorHits === 0 || evidence.replayedPatches === 0)
  ) {
    throw new Error('Incremental materialization did not prove git-cas predecessor reuse');
  }
}

function assertDistributions(
  result: ScenarioResult,
  scenario: PerformanceScenarioName,
): void {
  const checks = [
    [result.cpuSystemMs, result.samples.map((sample) => sample.cpuSystemMs)],
    [result.cpuTotalMs, result.samples.map((sample) => sample.cpuTotalMs)],
    [result.cpuUserMs, result.samples.map((sample) => sample.cpuUserMs)],
    [result.gitCommandCount, result.samples.map((sample) => sample.gitCommandCount)],
    [result.maxRssBytes, result.samples.map((sample) => sample.maxRssBytes)],
    [result.peakHeapUsedBytes, result.samples.map((sample) => sample.peakHeapUsedBytes)],
    [
      result.throughputPerSecond,
      result.samples.map((sample) => sample.throughputPerSecond),
    ],
    [result.wallMs, result.samples.map((sample) => sample.wallMs)],
  ] as const;
  if (
    checks.some(([actual, samples]) => (
      JSON.stringify(actual) !== JSON.stringify(summarizeDistribution(samples))
    ))
  ) {
    throw new Error(`Performance distributions do not match raw samples: ${scenario}`);
  }
}
