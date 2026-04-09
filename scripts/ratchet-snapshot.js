#!/usr/bin/env node

import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import {
  buildSnapshotPath,
  createSnapshot,
  extractEslintCounts,
  extractTypecheckErrorCount,
  extractVitestCounts,
  writeSnapshot,
} from './ratchet-telemetry.js';

const execFile = promisify(execFileCallback);

/**
 * @param {string[]} args
 * @returns {{ baseRef: string, label?: string, outputRoot: string }}
 */
function parseArgs(args) {
  /** @type {{ baseRef: string, label?: string, outputRoot: string }} */
  const options = { baseRef: 'main', outputRoot: 'docs/method/ratchet' };
  for (const arg of args) {
    if (arg.startsWith('--base=')) {
      options.baseRef = arg.slice('--base='.length);
      continue;
    }
    if (arg.startsWith('--label=')) {
      options.label = arg.slice('--label='.length);
      continue;
    }
    if (arg.startsWith('--output-root=')) {
      options.outputRoot = arg.slice('--output-root='.length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

/**
 * @param {string[]} args
 * @returns {Promise<string>}
 */
async function run(args) {
  const [command, ...commandArgs] = args;
  if (command === undefined) {
    throw new Error('Missing command');
  }
  try {
    const { stdout, stderr } = await execFile(command, commandArgs, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 50 });
    return `${stdout}${stderr}`;
  } catch (error) {
    const stdout = typeof error === 'object' && error !== null && 'stdout' in error && typeof error.stdout === 'string'
      ? error.stdout
      : '';
    const stderr = typeof error === 'object' && error !== null && 'stderr' in error && typeof error.stderr === 'string'
      ? error.stderr
      : '';
    return `${stdout}${stderr}`;
  }
}

/**
 * @param {string[]} args
 * @returns {Promise<void>}
 */
async function main(args) {
  const options = parseArgs(args);
  const branch = (await run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'])).trim();
  const commit = (await run(['git', 'rev-parse', 'HEAD'])).trim();
  const mergeBase = (await run(['git', 'merge-base', 'HEAD', options.baseRef])).trim();
  const label = options.label ?? commit.slice(0, 8);
  const tempDir = await mkdtemp('/tmp/git-warp-ratchet-');
  const vitestOutputPath = join(tempDir, 'vitest.json');

  const [typecheckOutput, eslintOutput] = await Promise.all([
    run(['npm', 'run', '--silent', 'typecheck', '--', '--pretty', 'false']),
    run(['npm', 'run', '--silent', 'lint', '--', '--format', 'json']),
  ]);
  await run(['npx', 'vitest', 'run', 'test/unit', '--reporter=json', '--outputFile', vitestOutputPath]);
  const vitestOutput = await readFile(vitestOutputPath, 'utf8');

  const snapshot = createSnapshot({
    branch,
    baseRef: options.baseRef,
    mergeBase,
    commit,
    label,
    capturedAt: new Date().toISOString(),
    typecheckErrors: extractTypecheckErrorCount(typecheckOutput),
    lintErrors: extractEslintCounts(eslintOutput).errors,
    lintWarnings: extractEslintCounts(eslintOutput).warnings,
    testsPassed: extractVitestCounts(vitestOutput).passed,
    testsFailed: extractVitestCounts(vitestOutput).failed,
    testSuites: extractVitestCounts(vitestOutput).suites,
    failedSuites: extractVitestCounts(vitestOutput).failedSuites,
  });
  const outputPath = buildSnapshotPath({ outputRoot: options.outputRoot, branch, label });
  await writeSnapshot(outputPath, snapshot);
  console.log(outputPath);
}

main(process.argv.slice(2)).catch(error => {
  console.error(`ratchet-snapshot: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
