import z from 'zod';

/**
 * Version 2 added the structural Git-command thresholds
 * (`absolute.gitCommandMedian`, `relative.gitCommandRegressionRatio`). Both are
 * required, so a version-1 policy no longer parses and must not claim to.
 */
export const PERFORMANCE_POLICY_SCHEMA_VERSION = 2;

const scenarioThresholds = z.object({
  'cold-materialize': z.number().finite().nonnegative(),
  'incremental-materialize': z.number().finite().nonnegative(),
  'warm-materialize': z.number().finite().nonnegative(),
}).strict();

const scenarioCountThresholds = z.object({
  'cold-materialize': z.number().int().nonnegative(),
  'incremental-materialize': z.number().int().nonnegative(),
  'warm-materialize': z.number().int().nonnegative(),
}).strict();

export const PerformancePolicySchema = z.object({
  absolute: z.object({
    cpuTotalMedianMs: scenarioThresholds,
    gitCommandMedian: scenarioCountThresholds,
    maxRssBytes: scenarioThresholds,
    peakHeapUsedBytes: scenarioThresholds,
  }).strict(),
  relative: z.object({
    cpuNoiseFloorMs: scenarioThresholds,
    cpuRegressionRatio: z.number().finite().gte(1),
    gitCommandRegressionRatio: z.number().finite().gte(1),
  }).strict(),
  schemaVersion: z.literal(PERFORMANCE_POLICY_SCHEMA_VERSION),
  streaming: z.object({
    maxRssBytes: z.number().finite().positive(),
    peakHeapUsedBytes: z.number().finite().positive(),
  }).strict(),
  wallTime: z.literal('diagnostic'),
}).strict();

export type PerformancePolicy = Readonly<z.infer<typeof PerformancePolicySchema>>;
