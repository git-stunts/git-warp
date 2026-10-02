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

/** Preserve formatting and refuse ambiguous or nonmonotonic threshold changes. */
export function raisedLineThreshold(configuration: string, percentage: number): string {
  const thresholds = [...configuration.matchAll(/\blines:\s*(\d+(?:\.\d+)?),/gu)];
  const threshold = thresholds[0];
  if (thresholds.length !== 1 || !threshold || !Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
    throw new Error('coverage-ratchet: invalid line threshold or configuration');
  }
  if (percentage <= Number(threshold[1])) return configuration;
  return configuration.replace(threshold[0], threshold[0].replace(threshold[1] ?? '', String(percentage)));
}
