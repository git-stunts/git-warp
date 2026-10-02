#!/usr/bin/env node
import './RequireDockerTests.ts';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createVitest, parseCLI, type Vitest } from 'vitest/node';
import { coverageRunCompleted, raisedLineThreshold } from './coverage-ratchet.ts';
import { readCoverageLines } from './coverage-runner/ReadCoverageSummary.ts';

const COVERAGE_INCLUDE = [
  'test/unit/**/*.{test,spec}.?(c|m)[jt]s?(x)',
  'test/conformance/v18*Optic*.test.ts',
  'test/integration/application/Runtime.entityAdmissionInventory.integration.test.ts',
];
const INSTRUMENTED_WORKERS = 1;
const COVERAGE_PROCESSING_CONCURRENCY = 1;

async function runCoverageTests(): Promise<void> {
  const args = process.argv.slice(2);
  const ratchetRequested = process.env['npm_lifecycle_event'] === 'test:coverage' && args.length === 0;
  const configurationPath = resolve('vitest.config.ts');
  const baseline = readFileSync(configurationPath, 'utf8');
  const { filter, options } = parseCLI(['vitest', 'run', ...args]);
  const vitest = await createVitest('test', {
    ...options, run: true, watch: false, allowOnly: false, passWithNoTests: false,
    include: COVERAGE_INCLUDE, maxWorkers: INSTRUMENTED_WORKERS, fileParallelism: false,
    coverage: {
      ...options.coverage, enabled: true, processingConcurrency: COVERAGE_PROCESSING_CONCURRENCY,
      reporter: ['text', 'html', 'clover', 'json-summary'],
      thresholds: { ...options.coverage?.thresholds, autoUpdate: false },
    },
  });
  console.log(`coverage-tests: instrumented workers=${INSTRUMENTED_WORKERS}; processing concurrency=${COVERAGE_PROCESSING_CONCURRENCY}`);
  try {
    const selected = await vitest.getRelevantTestSpecifications(filter);
    const result = await vitest.start(filter);
    const teardownFailed = await closeVitest(vitest);
    if (teardownFailed || !coverageRunCompleted(selected, result.testModules) || result.unhandledErrors.length > 0
      || vitest.state.getUnhandledErrors().length > 0 || Number(process.exitCode ?? 0) !== 0) {
      console.error('coverage-tests: incomplete or failed run; coverage ratchet unchanged');
      process.exitCode = 1;
      return;
    }
    console.log(`coverage-tests: complete (${selected.length} files); zero errors`);
    if (ratchetRequested) await updateRatchet(configurationPath, baseline, vitest.config.coverage.reportsDirectory);
    else console.log('coverage-tests: reporting only; coverage ratchet unchanged');
  } finally {
    await vitest.close();
  }
}

/** Vitest reports teardown errors through its logger rather than rejecting close(). */
async function closeVitest(vitest: Vitest): Promise<boolean> {
  let failed = false;
  const error = vitest.logger.error.bind(vitest.logger);
  const original = vitest.logger.error;
  vitest.logger.error = (...args) => { failed = true; error(...args); };
  try {
    await vitest.close();
    return failed;
  } finally {
    vitest.logger.error = original;
  }
}

async function updateRatchet(path: string, baseline: string, reportsDirectory: string): Promise<void> {
  const percentage = await readCoverageLines(resolve(reportsDirectory, 'coverage-summary.json'));
  const candidate = raisedLineThreshold(baseline, percentage);
  if (readFileSync(path, 'utf8') !== baseline) throw new Error('coverage-ratchet: configuration changed during the run');
  if (candidate === baseline) return;
  const temporary = `${path}.coverage-candidate`;
  writeFileSync(temporary, candidate, { flag: 'wx' });
  renameSync(temporary, path);
  console.log(`coverage-tests: completed full-suite line ratchet raised to ${percentage}`);
}

try {
  await runCoverageTests();
} catch (error) {
  console.error('coverage-tests: run failed; coverage ratchet unchanged', error);
  process.exitCode = 1;
}
