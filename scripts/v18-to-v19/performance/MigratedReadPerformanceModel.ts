import { z } from 'zod';

export const MIGRATED_READ_SCHEMA_VERSION = 1;
export const MIGRATED_READ_RUNTIMES = ['v18', 'v19'] as const;
export const MIGRATED_READ_SCENARIOS = ['cold', 'warm'] as const;

export const MigratedReadRuntimeSchema = z.enum(MIGRATED_READ_RUNTIMES);
export const MigratedReadScenarioSchema = z.enum(MIGRATED_READ_SCENARIOS);

const DistributionSchema = z.object({
  maximum: z.number().nonnegative(),
  median: z.number().nonnegative(),
  minimum: z.number().nonnegative(),
  samples: z.array(z.number().nonnegative()).min(1),
});

export const MigratedReadSampleSchema = z.object({
  basisId: z.string().min(1),
  basisKind: z.enum(['checkpoint-tail', 'opaque-evidence']),
  cpuSystemMs: z.number().nonnegative(),
  cpuTotalMs: z.number().nonnegative(),
  cpuUserMs: z.number().nonnegative(),
  gitCommandCount: z.number().int().nonnegative(),
  gitCommandHistogram: z.record(
    z.string().min(1),
    z.number().int().nonnegative(),
  ),
  key: z.literal('ordinal'),
  maxRssBytes: z.number().int().positive(),
  peakHeapUsedBytes: z.number().int().positive(),
  receiptStatus: z.literal('completed').nullable(),
  runtime: MigratedReadRuntimeSchema,
  scenario: MigratedReadScenarioSchema,
  subject: z.literal('medium:document:015'),
  supportStatus: z.enum(['checkpoint-tail', 'supported']),
  value: z.literal(15),
  wallMs: z.number().positive(),
  workerLifecycleWallMs: z.number().positive(),
});

const ScenarioSummarySchema = z.object({
  cpuTotalMs: DistributionSchema,
  gitCommandCount: DistributionSchema,
  maxRssBytes: DistributionSchema,
  peakHeapUsedBytes: DistributionSchema,
  samples: z.array(MigratedReadSampleSchema).min(1),
  wallMs: DistributionSchema,
  workerLifecycleWallMs: DistributionSchema,
});

const RuntimeSummarySchema = z.object({
  cold: ScenarioSummarySchema,
  warm: ScenarioSummarySchema,
});

export const MigratedReadPerformancePolicySchema = z.object({
  cpuNoiseFloorMs: z.number().nonnegative(),
  maximumCpuRatio: z.number().positive(),
  maximumHeapRatio: z.number().positive(),
  maximumRssRatio: z.number().positive(),
  minimumGitCommandImprovementRatio: z.number().min(0).max(1),
  minimumWallImprovementMs: z.number().nonnegative(),
  minimumWallImprovementRatio: z.number().min(0).max(1),
  schemaVersion: z.literal(MIGRATED_READ_SCHEMA_VERSION),
});

export const MigratedReadPerformanceReportSchema = z.object({
  environment: z.object({
    architecture: z.string().min(1),
    git: z.string().min(1),
    node: z.string().min(1),
    platform: z.string().min(1),
    v18GitCas: z.literal('6.0.0'),
    v18GitWarp: z.literal('18.2.1'),
    v19Commit: z.string().regex(/^[0-9a-f]{40}$/u),
    v19GitCas: z.string().min(1),
    v19PackageVersion: z.string().min(1),
  }),
  executionOrder: z.array(z.object({
    measured: z.boolean(),
    round: z.number().int().nonnegative(),
    runtime: MigratedReadRuntimeSchema,
  })).min(1),
  failures: z.array(z.string()),
  fixture: z.object({
    bundleBytes: z.number().int().positive(),
    fixtureId: z.literal('v18-retained-substrate-medium-001'),
    graph: z.literal('v18-medium-retained-substrate'),
    patchCount: z.literal(18),
  }),
  generatedAt: z.string().datetime(),
  measuredRuns: z.number().int().positive(),
  migration: z.object({
    status: z.literal('migrated'),
    wallMs: z.number().positive(),
  }),
  policy: MigratedReadPerformancePolicySchema,
  result: z.enum(['PASS', 'FAIL']),
  runtimes: z.object({
    v18: RuntimeSummarySchema,
    v19: RuntimeSummarySchema,
  }),
  schemaVersion: z.literal(MIGRATED_READ_SCHEMA_VERSION),
  warmupRuns: z.number().int().nonnegative(),
}).superRefine((report, context) => {
  for (const runtime of MIGRATED_READ_RUNTIMES) {
    for (const scenario of MIGRATED_READ_SCENARIOS) {
      const count = report.runtimes[runtime][scenario].samples.length;
      if (count !== report.measuredRuns) {
        context.addIssue({
          code: 'custom',
          message: `${runtime} ${scenario} has ${String(count)} samples; `
            + `expected ${String(report.measuredRuns)}`,
          path: ['runtimes', runtime, scenario, 'samples'],
        });
      }
    }
  }
  const expectedOrderEntries = (
    report.measuredRuns + report.warmupRuns
  ) * MIGRATED_READ_RUNTIMES.length;
  if (report.executionOrder.length !== expectedOrderEntries) {
    context.addIssue({
      code: 'custom',
      message: `execution order has ${String(report.executionOrder.length)} `
        + `entries; expected ${String(expectedOrderEntries)}`,
      path: ['executionOrder'],
    });
  }
  if (
    (report.result === 'PASS' && report.failures.length !== 0)
    || (report.result === 'FAIL' && report.failures.length === 0)
  ) {
    context.addIssue({
      code: 'custom',
      message: 'result and failure list disagree',
      path: ['result'],
    });
  }
});

export type MigratedReadRuntime = z.infer<typeof MigratedReadRuntimeSchema>;
export type MigratedReadScenario = z.infer<typeof MigratedReadScenarioSchema>;
export type MigratedReadSample = z.infer<typeof MigratedReadSampleSchema>;
export type MigratedReadScenarioSummary = z.infer<
  typeof ScenarioSummarySchema
>;
export type MigratedReadRuntimeSummary = z.infer<typeof RuntimeSummarySchema>;
export type MigratedReadPerformancePolicy = z.infer<
  typeof MigratedReadPerformancePolicySchema
>;
export type MigratedReadPerformanceReport = z.infer<
  typeof MigratedReadPerformanceReportSchema
>;

export function parseMigratedReadPerformanceReport(
  value: unknown,
): MigratedReadPerformanceReport {
  return MigratedReadPerformanceReportSchema.parse(value);
}
