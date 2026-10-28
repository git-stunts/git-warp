import type { GitProcessSnapshot } from './GitProcessCounter.ts';

/** One timed public-API call and the Git processes it started. */
export type Sample = Readonly<{
  ms: number;
  gitProcesses: number;
  byCommand: Readonly<Record<string, number>>;
  /** Write outcome kind, Observation status, or `error`. */
  result: string;
  reason: string | null;
}>;

export type Distribution = Readonly<{
  n: number;
  p50: number | null;
  p95: number | null;
  max: number | null;
}>;

export type PhaseSummary = Readonly<{
  samples: number;
  ms: Distribution;
  gitProcesses: Distribution;
  results: Readonly<Record<string, number>>;
  reasons: Readonly<Record<string, number>>;
}>;

function percentile(sorted: readonly number[], fraction: number): number | null {
  if (sorted.length === 0) {
    return null;
  }
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return Math.round((sorted[index] ?? 0) * 100) / 100;
}

export function distribution(values: readonly number[]): Distribution {
  const sorted = [...values].sort((left, right) => left - right);
  return Object.freeze({
    n: sorted.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: percentile(sorted, 1),
  });
}

function tally(values: readonly string[]): Readonly<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const value of values) {
    out[value] = (out[value] ?? 0) + 1;
  }
  return Object.freeze(out);
}

export function summarize(samples: readonly Sample[]): PhaseSummary {
  return Object.freeze({
    samples: samples.length,
    ms: distribution(samples.map((sample) => sample.ms)),
    gitProcesses: distribution(samples.map((sample) => sample.gitProcesses)),
    results: tally(samples.map((sample) => sample.result)),
    reasons: tally(samples.flatMap((sample) => sample.reason === null ? [] : [sample.reason])),
  });
}

export function sample(fields: Readonly<{ ms: number; processes: GitProcessSnapshot; result: string; reason: string | null }>): Sample {
  return Object.freeze({
    ms: Math.round(fields.ms * 100) / 100,
    gitProcesses: fields.processes.total,
    byCommand: fields.processes.byCommand,
    result: fields.result,
    reason: fields.reason,
  });
}

/** An exception from the public API, reduced to its name, code and message. */
export function failure(error: Error): string {
  const code = 'code' in error && typeof error.code === 'string' ? ` ${error.code}` : '';
  return `${error.name}${code}: ${error.message}`.slice(0, 400);
}
