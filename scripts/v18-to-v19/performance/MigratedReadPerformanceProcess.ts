import { execFileSync } from 'node:child_process';
import { delimiter, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  parseGnuTime,
  spawnAndCollect,
  supportsGnuTime,
} from '../../performance/PerformanceProcess.ts';
import {
  type MigratedReadRuntime,
  type MigratedReadSample,
  MigratedReadSampleSchema,
  type MigratedReadScenario,
} from './MigratedReadPerformanceModel.ts';
import {
  MIGRATED_READ_RESULT_PREFIX,
  MigratedReadWorkerResultSchema,
} from './MigratedReadWorkerCommon.ts';

const WORKER_TIMEOUT_MS = 2 * 60 * 1000;

export async function runMigratedReadProcess(options: Readonly<{
  fixturePackage: string;
  repositoryPath: string;
  runtime: MigratedReadRuntime;
  scenario: MigratedReadScenario;
}>): Promise<MigratedReadSample> {
  const instrumentation = await createInstrumentation();
  try {
    const workerPath = workerPathFor(options.runtime);
    const workerArgs = [
      workerPath,
      '--repo',
      options.repositoryPath,
      ...(options.runtime === 'v18'
        ? ['--fixture-package', options.fixturePackage]
        : []),
    ];
    const timingPath = join(instrumentation.root, 'gnu-time.tsv');
    const useGnuTime = supportsGnuTime();
    const command = useGnuTime ? '/usr/bin/time' : process.execPath;
    const args = useGnuTime
      ? ['-f', '%U\t%S\t%e\t%M', '-o', timingPath, process.execPath, ...workerArgs]
      : workerArgs;
    const started = performance.now();
    const completed = await spawnAndCollect(
      command,
      args,
      instrumentation.environment,
      WORKER_TIMEOUT_MS,
    );
    const lifecycleWallMs = performance.now() - started;
    const worker = parseWorkerResult(completed.stdout);
    const timing = useGnuTime
      ? parseGnuTime(await readFile(timingPath, 'utf8'))
      : null;
    const commands = await readCommandEvidence(instrumentation.commandLog);
    return MigratedReadSampleSchema.parse({
      ...worker,
      gitCommandCount: commands.count,
      gitCommandHistogram: commands.histogram,
      processCpuSystemMs: timing === null ? null : timing.systemSeconds * 1000,
      processCpuTotalMs: timing === null
        ? null
        : (timing.userSeconds + timing.systemSeconds) * 1000,
      processCpuUserMs: timing === null ? null : timing.userSeconds * 1000,
      processMaxRssBytes: timing === null ? null : timing.maxRssKib * 1024,
      runtime: options.runtime,
      scenario: options.scenario,
      workerLifecycleWallMs: timing?.wallSeconds === undefined
        ? lifecycleWallMs
        : timing.wallSeconds * 1000,
    });
  } finally {
    await rm(instrumentation.root, { force: true, recursive: true });
  }
}

type Instrumentation = Readonly<{
  commandLog: string;
  environment: NodeJS.ProcessEnv;
  root: string;
}>;

async function createInstrumentation(): Promise<Instrumentation> {
  const root = await mkdtemp(join(tmpdir(), 'git-warp-migrated-read-'));
  try {
    const wrapperDirectory = join(root, 'bin');
    const commandLog = join(root, 'git-commands.log');
    await mkdir(wrapperDirectory, { recursive: true });
    const realGit = execFileSync('/bin/sh', ['-c', 'command -v git'], {
      encoding: 'utf8',
    }).trim();
    if (realGit.length === 0) {
      throw new Error('git executable is unavailable');
    }
    await writeFile(
      join(wrapperDirectory, 'git'),
      '#!/bin/sh\n'
        + `printf '%s\\n' "$1" >> ${shellQuote(commandLog)}\n`
        + `exec ${shellQuote(realGit)} "$@"\n`,
      { mode: 0o755 },
    );
    return Object.freeze({
      commandLog,
      environment: {
        ...process.env,
        PATH: `${wrapperDirectory}${delimiter}${process.env['PATH'] ?? ''}`,
      },
      root,
    });
  } catch (error) {
    await rm(root, { force: true, recursive: true });
    throw error;
  }
}

function workerPathFor(runtime: MigratedReadRuntime): string {
  const filename = runtime === 'v18'
    ? './V18RetainedReadWorker.js'
    : './V19RetainedReadWorker.js';
  return fileURLToPath(new URL(filename, import.meta.url));
}

function parseWorkerResult(stdout: string) {
  const line = stdout.split('\n').find((entry) =>
    entry.startsWith(MIGRATED_READ_RESULT_PREFIX)
  );
  if (line === undefined) {
    throw new Error(`migrated-read worker emitted no sample: ${stdout}`);
  }
  return MigratedReadWorkerResultSchema.parse(
    JSON.parse(line.slice(MIGRATED_READ_RESULT_PREFIX.length)) as unknown,
  );
}

export async function readCommandEvidence(path: string): Promise<Readonly<{
  count: number;
  histogram: Readonly<Record<string, number>>;
}>> {
  const contents = await readFile(path, 'utf8').catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return '';
      }
      throw error;
    },
  );
  const commands = contents
    .split('\n')
    .filter((command) => command.length > 0);
  const histogram: Record<string, number> = {};
  for (const command of commands) {
    histogram[command] = (histogram[command] ?? 0) + 1;
  }
  return Object.freeze({ count: commands.length, histogram });
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
