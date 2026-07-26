import z from 'zod';

export const STREAMING_SCHEMA_VERSION = 1;

const positiveFinite = z.number().finite().positive();
const nonNegativeFinite = z.number().finite().nonnegative();
const positiveInteger = z.number().int().positive();
const nonNegativeInteger = z.number().int().nonnegative();

export const StreamingFixtureManifestSchema = z.object({
  batchNodeCount: positiveInteger,
  expectedFingerprint: z.string().regex(/^[0-9a-f]{64}$/u),
  graphName: z.literal('performance'),
  logicalPropertyBytes: positiveInteger,
  minimumLogicalToOldSpaceRatio: positiveFinite,
  minimumPropertyPages: positiveInteger,
  nodeCount: positiveInteger,
  persistenceMode: z.literal('streaming-descriptor-checkpoint-v1'),
  propertyBytesPerNode: positiveInteger,
  seed: nonNegativeInteger,
  writerId: z.literal('benchmark-writer'),
}).strict();

export type StreamingFixtureManifest = Readonly<
  z.infer<typeof StreamingFixtureManifestSchema>
>;

export const StreamingPerformanceResultSchema = z.object({
  config: z.object({
    consumerDelayMs: nonNegativeInteger,
    expectedReadingCount: positiveInteger,
    logicalPropertyBytes: positiveInteger,
    logicalToOldSpaceRatio: positiveFinite,
    maxOldSpaceBytes: positiveInteger,
    maximumRssBytes: positiveInteger,
    minimumPropertyPages: positiveInteger,
    observedHeapLimitBytes: positiveInteger,
  }).strict(),
  evidence: z.object({
    decodedReadings: positiveInteger,
    materializeCalls: nonNegativeInteger,
    maximumPlanningLead: nonNegativeInteger,
    plannedReadings: positiveInteger,
    uniquePropertyPages: positiveInteger,
    wholeIndexScans: nonNegativeInteger,
  }).strict(),
  metrics: z.object({
    maxRssBytes: positiveInteger,
    peakHeapUsedBytes: positiveInteger,
    throughputPerSecond: positiveFinite,
    timeToFirstReadingMs: nonNegativeFinite,
    wallMs: positiveFinite,
  }).strict(),
  receipt: z.object({
    basisId: z.string().min(1),
    status: z.literal('completed'),
    tickId: z.string().min(1).nullable(),
  }).strict(),
  schemaVersion: z.literal(STREAMING_SCHEMA_VERSION),
  semantic: z.object({
    fingerprint: z.string().regex(/^[0-9a-f]{64}$/u),
    readingCount: positiveInteger,
    resultBytes: positiveInteger,
  }).strict(),
}).strict();

export type StreamingPerformanceResult = Readonly<
  z.infer<typeof StreamingPerformanceResultSchema>
>;

export function parseStreamingPerformanceResult(
  value: unknown,
): StreamingPerformanceResult {
  return StreamingPerformanceResultSchema.parse(value);
}

export function validateStreamingPerformanceResult(
  result: StreamingPerformanceResult,
  manifest: StreamingFixtureManifest,
): void {
  validateCardinality(result, manifest);
  validateSemanticBytes(result, manifest);
  validateStreamingPath(result, manifest);
  validateMemoryEnvelope(result);
}

function validateCardinality(
  result: StreamingPerformanceResult,
  manifest: StreamingFixtureManifest,
): void {
  if (
    result.config.expectedReadingCount !== manifest.nodeCount
    || result.semantic.readingCount !== manifest.nodeCount
    || result.evidence.plannedReadings !== manifest.nodeCount
    || result.evidence.decodedReadings !== manifest.nodeCount
  ) {
    throw new Error('Streaming performance result has incomplete cardinality');
  }
}

function validateSemanticBytes(
  result: StreamingPerformanceResult,
  manifest: StreamingFixtureManifest,
): void {
  if (
    result.config.logicalPropertyBytes !== manifest.logicalPropertyBytes
    || result.semantic.resultBytes !== manifest.logicalPropertyBytes
  ) {
    throw new Error('Streaming performance result has incomplete logical bytes');
  }
  if (result.semantic.fingerprint !== manifest.expectedFingerprint) {
    throw new Error('Streaming performance result changed semantic bytes');
  }
  const actualRatio = manifest.logicalPropertyBytes / result.config.maxOldSpaceBytes;
  if (
    Math.abs(result.config.logicalToOldSpaceRatio - actualRatio) > Number.EPSILON
    || result.config.logicalToOldSpaceRatio < manifest.minimumLogicalToOldSpaceRatio
  ) {
    throw new Error('Streaming performance result did not satisfy its size multiplier');
  }
}

function validateStreamingPath(
  result: StreamingPerformanceResult,
  manifest: StreamingFixtureManifest,
): void {
  if (
    result.evidence.materializeCalls !== 0
    || result.evidence.wholeIndexScans !== 0
  ) {
    throw new Error('Streaming performance result used a prohibited whole-state path');
  }
  if (result.evidence.uniquePropertyPages < manifest.minimumPropertyPages) {
    throw new Error('Streaming performance result did not exercise enough property pages');
  }
  if (result.config.minimumPropertyPages !== manifest.minimumPropertyPages) {
    throw new Error('Streaming performance result changed its property-page contract');
  }
  if (result.evidence.maximumPlanningLead > 1) {
    throw new Error('Streaming performance result violated consumer backpressure');
  }
}

function validateMemoryEnvelope(result: StreamingPerformanceResult): void {
  if (result.metrics.peakHeapUsedBytes >= result.config.observedHeapLimitBytes) {
    throw new Error('Streaming performance result exceeded its heap cap');
  }
  if (result.metrics.maxRssBytes > result.config.maximumRssBytes) {
    throw new Error('Streaming performance result exceeded its RSS envelope');
  }
}
