import z from 'zod';
import { PerformanceResultSchema, validatePerformanceResult }
  from './PerformanceModel.ts';
import {
  StreamingPerformanceReportSchema,
  requireStreamingProofReport,
} from './StreamingPerformanceReport.ts';

export const PERFORMANCE_COMPARISON_SCHEMA_VERSION = 1;

const executionStepSchema = z.enum([
  'base-materialization-a',
  'base-materialization-b',
  'base-streaming',
  'head-materialization-a',
  'head-materialization-b',
  'head-streaming',
]);

const refEvidenceSchema = z.object({
  materialization: PerformanceResultSchema,
  streaming: StreamingPerformanceReportSchema,
}).strict();

export const PerformanceComparisonSchema = z.object({
  base: refEvidenceSchema,
  executionOrder: z.array(executionStepSchema).length(6).readonly(),
  generatedAt: z.string().datetime(),
  head: refEvidenceSchema,
  schemaVersion: z.literal(PERFORMANCE_COMPARISON_SCHEMA_VERSION),
}).strict();

export type PerformanceExecutionStep = Readonly<
  z.infer<typeof executionStepSchema>
>;
export type PerformanceComparison = Readonly<
  z.infer<typeof PerformanceComparisonSchema>
>;

export function parsePerformanceComparison(value: unknown): PerformanceComparison {
  const comparison = PerformanceComparisonSchema.parse(value);
  validatePerformanceResult(comparison.base.materialization);
  validatePerformanceResult(comparison.head.materialization);
  requireStreamingProofReport(comparison.base.streaming);
  requireStreamingProofReport(comparison.head.streaming);
  validatePerformanceExecutionOrder(comparison.executionOrder);
  return comparison;
}

export function validatePerformanceExecutionOrder(
  order: readonly PerformanceExecutionStep[],
): void {
  if (new Set(order).size !== order.length) {
    throw new Error('Performance comparison execution order contains duplicates');
  }
  const materialization = order.slice(0, 4);
  const refs = materialization.map((step) => step.split('-')[0]);
  if (
    refs[0] === refs[1]
    || refs[0] !== refs[3]
    || refs[1] !== refs[2]
  ) {
    throw new Error('Performance comparison did not use ABBA materialization order');
  }
  const phases = materialization.map((step) => step.split('-')[2]);
  if (phases.join(',') !== 'a,a,b,b') {
    throw new Error('Performance comparison materialization phases are inconsistent');
  }
  const streaming = order.slice(4);
  if (
    !streaming.includes('base-streaming')
    || !streaming.includes('head-streaming')
  ) {
    throw new Error('Performance comparison did not run both streaming proofs');
  }
}
