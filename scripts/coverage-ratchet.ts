import type { TestModule, TestSpecification } from 'vitest/node';

/** A selected file is complete only after its terminal result is recorded. */
export function coverageRunCompleted(specifications: readonly TestSpecification[], modules: readonly TestModule[]): boolean {
  if (specifications.length === 0 || specifications.length !== modules.length) return false;
  const completed = new Set(modules.map(module => module.moduleId));
  if (completed.size !== specifications.length) return false;
  if (!specifications.every(specification => completed.has(specification.moduleId))) return false;
  return modules.every(module => module.state() === 'passed' || module.state() === 'skipped')
    && modules.some(module => [...module.children.allTests()].some(test => test.result().state === 'passed'));
}

/** Istanbul reports line coverage floored to hundredths of a percent; one step is 0.01. */
const REPORTING_STEPS_PER_PERCENT = 100;
/** Tolerance for binary floating point when a reported percentage is scaled to steps. */
const STEP_EPSILON = 1e-6;
/**
 * The ratchet writes one reporting step below the measurement (#1133). Some lines are
 * covered or not depending on run timing, so CI can measure one or more lines below a
 * local run of the same commit. One step absorbs up to 0.01% of that variance.
 */
const RATCHET_MARGIN_STEPS = 1;

/** The threshold that a measured percentage may write: floored to one step, minus the margin. */
function ratchetCandidate(percentage: number): number {
  const steps = Math.floor(percentage * REPORTING_STEPS_PER_PERCENT + STEP_EPSILON);
  return Math.max(0, steps - RATCHET_MARGIN_STEPS) / REPORTING_STEPS_PER_PERCENT;
}

/** Preserve formatting and refuse ambiguous or nonmonotonic threshold changes. */
export function raisedLineThreshold(configuration: string, percentage: number): string {
  const thresholds = [...configuration.matchAll(/\blines:\s*(\d+(?:\.\d+)?),/gu)];
  const threshold = thresholds[0];
  if (thresholds.length !== 1 || !threshold || !Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
    throw new Error('coverage-ratchet: invalid line threshold or configuration');
  }
  const candidate = ratchetCandidate(percentage);
  if (candidate <= Number(threshold[1])) return configuration;
  return configuration.replace(threshold[0], threshold[0].replace(/\d+(?:\.\d+)?/u, String(candidate)));
}
