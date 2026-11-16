// Count Git processes for saves, margins reads and cold reads at admitted scales.
import '../../scripts/RequireDockerTests.ts';

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { TRACE_FILE_LIMIT } from './GitProcessCounter.ts';
import WitnessArguments from './WitnessArguments.ts';

const WORKER = fileURLToPath(new URL('./ScaleWorker.ts', import.meta.url));
const WORKER_OUTPUT_LIMIT = 4 * 1024 * 1024;
const PILOT_TIMEOUT_MS = 900_000;
const SCALE_TIMEOUT_MS = 1_500_000;
const usage = 'Usage: node benchmarks/cone-showcase/ConeShowcaseWitness.ts [200] [2000]\nDefaults: 200 and 2000 threads. Pilot: 200.\n';

const arguments_ = process.argv.slice(2);
if (arguments_.length === 1 && arguments_[0] === '--help') {
  process.stdout.write(usage);
  process.exit(0);
}
const parsed = WitnessArguments.parse(arguments_);
if (parsed === null) {
  process.stderr.write(usage);
  process.exit(2);
}

process.stdout.write('metric\tgit-trace2-file-identities\tincludes-configured-git-descendants\n');
for (const threads of parsed.scales) {
  const work = mkdtempSync(join(tmpdir(), 'cone-showcase-'));
  let cleanupAllowed = false;
  try {
    const traces = join(work, 'traces');
    const config = join(work, 'gitconfig');
    mkdirSync(traces);
    if (/[\r\n\0]/.test(traces)) {
      throw new TypeError('the owned trace path cannot contain configuration delimiters');
    }
    const target = traces.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
    writeFileSync(config, '[trace2]\n\teventTarget = "' + target + '"\n\tmaxFiles = ' + String(TRACE_FILE_LIMIT - 1) + '\n', { mode: 0o600 });
    const child = spawnSync('env', [
      'GIT_CONFIG_GLOBAL=' + config, process.execPath, WORKER, join(work, 'repo'), String(threads), traces,
    ], {
      encoding: 'utf8', timeout: threads === 200 ? PILOT_TIMEOUT_MS : SCALE_TIMEOUT_MS,
      maxBuffer: WORKER_OUTPUT_LIMIT,
    });
    const output = child.stdout || '';
    process.stdout.write(output);
    process.stderr.write(child.stderr || '');
    const complete = 'scale-end\t' + String(threads) + '\tcomplete\n';
    const incomplete = 'scale-end\t' + String(threads) + '\tincomplete\n';
    cleanupAllowed = child.error === undefined && child.signal === null && child.status !== null
      && (output.endsWith(complete) || output.endsWith(incomplete));
    if (!cleanupAllowed || child.status !== 0 || !output.endsWith(complete)) {
      process.exitCode = 1;
      if (child.error !== undefined) {
        process.stderr.write('scale invocation failed: ' + child.error.message.slice(0, 2048) + '\n');
      }
    }
  } finally {
    if (cleanupAllowed) {
      rmSync(work, { recursive: true, force: true });
    } else {
      // The outer guarded worker stops possible writers before discarding tmpfs.
      process.stderr.write('retained-scratch\t' + basename(work) + '\n');
    }
  }
}
