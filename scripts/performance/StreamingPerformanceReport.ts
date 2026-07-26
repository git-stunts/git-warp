import z from 'zod';
import {
  StreamingFixtureManifestSchema,
  StreamingPerformanceResultSchema,
  validateStreamingPerformanceResult,
} from './StreamingPerformanceModel.ts';

const positiveInteger = z.number().int().positive();

export const StreamingPerformanceReportSchema = z.object({
  fixture: StreamingFixtureManifestSchema,
  generation: z.object({
    maximumHeapUsedBytes: positiveInteger,
    maxRssBytes: positiveInteger,
    peakHeapUsedBytes: positiveInteger,
  }).strict(),
  hostileControl: z.enum([
    'failed-with-memory-exhaustion',
    'not-run-mini-profile',
  ]),
  profile: z.enum(['mini', 'proof']),
  streaming: StreamingPerformanceResultSchema,
}).strict();

export type StreamingPerformanceReport = Readonly<
  z.infer<typeof StreamingPerformanceReportSchema>
>;

export function parseStreamingPerformanceReport(
  value: unknown,
): StreamingPerformanceReport {
  const report = StreamingPerformanceReportSchema.parse(value);
  validateStreamingPerformanceResult(report.streaming, report.fixture);
  if (
    report.generation.peakHeapUsedBytes
    > report.generation.maximumHeapUsedBytes
  ) {
    throw new Error('Streaming report exceeded its fixture-generation heap envelope');
  }
  if (
    report.profile === 'proof'
    && report.hostileControl !== 'failed-with-memory-exhaustion'
  ) {
    throw new Error('Streaming proof report did not exhaust the hostile control heap');
  }
  if (
    report.profile === 'mini'
    && report.hostileControl !== 'not-run-mini-profile'
  ) {
    throw new Error('Streaming mini report has inconsistent hostile-control evidence');
  }
  return report;
}

export function requireStreamingProofReport(
  value: unknown,
): StreamingPerformanceReport {
  const report = parseStreamingPerformanceReport(value);
  if (report.profile !== 'proof') {
    throw new Error('Performance CI requires the streaming proof profile');
  }
  return report;
}
