import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { randomFillSync } from 'node:crypto';
import { mkdir, mkdtemp, open, rm, writeFile } from 'node:fs/promises';
import { cpus, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { clearInterval, setInterval } from 'node:timers';
import { fileURLToPath } from 'node:url';
import { FastImportWriter, executeGit, PersistentCatFile } from './git-process.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const WORKER = join(HERE, 'resource-worker.mjs');
const quick = process.argv.includes('--quick');
const settings = Object.freeze({
  batchBytes: integerOption('--batch-bytes', 262_144),
  heapLimitMb: integerOption('--heap-mb', quick ? 64 : 64),
  operationCount: integerOption('--operations', quick ? 16 : 256),
  payloadBytes: integerOption('--payload-bytes', quick ? 262_144 : 1_048_576),
  payloadProfile: stringOption('--payload-profile') ?? 'random',
  samples: integerOption('--samples', quick ? 1 : 2),
});
const requestedScenario = stringOption('--scenario') ?? 'both';
requireChoice('--scenario', requestedScenario, ['blob-read', 'blob-write', 'both']);
requireChoice('--payload-profile', settings.payloadProfile, ['random', 'repetitive']);
if (settings.payloadBytes < 8) {
  throw new Error('--payload-bytes must be at least 8 to carry the validation index');
}
const defaultBackends = Object.freeze({
  'blob-read': Object.freeze(['git-one-shot', 'git-persistent', 'nodegit', 'isomorphic-git']),
  'blob-write': Object.freeze([
    'git-one-shot',
    'git-fast-import-pack',
    'nodegit',
    'napi-libgit2',
    'isomorphic-git',
  ]),
});
const requestedBackends = stringOption('--backend')?.split(',') ?? null;

await main();

async function main() {
  const startedAt = new Date();
  const temporaryPath = await mkdtemp(join(tmpdir(), 'git-warp-resource-profile-'));
  const inputPath = join(temporaryPath, 'random-corpus.bin');
  const corpusBytes = settings.operationCount * settings.payloadBytes;
  process.stdout.write(
    `Creating ${formatBytes(corpusBytes)} ${settings.payloadProfile} input corpus...\n`
  );
  await createInputFile(
    inputPath,
    settings.operationCount,
    settings.payloadBytes,
    settings.payloadProfile
  );

  const results = [];
  try {
    if (requestedScenario === 'both' || requestedScenario === 'blob-write') {
      await profileWrites(inputPath, temporaryPath, results);
    }
    if (requestedScenario === 'both' || requestedScenario === 'blob-read') {
      await profileReads(inputPath, temporaryPath, results);
    }
  } finally {
    await rm(temporaryPath, { recursive: true, force: true });
  }

  const report = Object.freeze({
    environment: Object.freeze({
      architecture: process.arch,
      cpu: cpus()[0]?.model ?? 'unknown',
      node: process.version,
      platform: process.platform,
    }),
    generatedAt: new Date().toISOString(),
    results: Object.freeze(results),
    settings: Object.freeze({ ...settings, corpusBytes }),
  });
  const stamp = timestamp(startedAt);
  const resultsDirectory = join(ROOT, 'results');
  await mkdir(resultsDirectory, { recursive: true });
  await writeFile(
    join(resultsDirectory, `${stamp}-resources.json`),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8'
  );
  await writeFile(join(resultsDirectory, `${stamp}-resources.md`), renderMarkdown(report), 'utf8');
  process.stdout.write(
    `\nWrote results/${stamp}-resources.json and results/${stamp}-resources.md\n`
  );
}

async function profileWrites(inputPath, temporaryPath, results) {
  const backends = selectedBackends('blob-write');
  process.stdout.write('\nstreamed blob-write\n');
  for (const backend of backends) {
    for (let sample = 0; sample < settings.samples; sample += 1) {
      const repository = await createBareRepository(
        join(temporaryPath, `write-${backend}-${sample}.git`)
      );
      const result = await runWorker({
        backend,
        gitDir: repository,
        input: inputPath,
        scenario: 'blob-write',
      });
      if (result.status === 'measured') {
        const { oids, ...workerSummary } = result.worker;
        await validateWrites(repository, inputPath, oids, settings.payloadBytes);
        result.oidCount = oids.length;
        result.repository = await repositoryStats(repository);
        result.worker = Object.freeze(workerSummary);
      }
      results.push(Object.freeze({ ...result, sample }));
      renderProgress(result, sample);
    }
  }
}

async function profileReads(inputPath, temporaryPath, results) {
  const repository = await createBareRepository(join(temporaryPath, 'read.git'));
  process.stdout.write('\nPreparing packed read corpus...\n');
  const writer = new FastImportWriter(repository, { unpackLimit: 1 });
  const oids = await writer.writeAll(
    readChunks(inputPath, settings.operationCount, settings.payloadBytes)
  );
  const manifestPath = join(temporaryPath, 'read-manifest.json');
  await writeFile(manifestPath, JSON.stringify({ oids }), 'utf8');

  process.stdout.write('\nstreamed blob-read\n');
  for (const backend of selectedBackends('blob-read')) {
    for (let sample = 0; sample < settings.samples; sample += 1) {
      const result = await runWorker({
        backend,
        gitDir: repository,
        manifest: manifestPath,
        scenario: 'blob-read',
      });
      results.push(Object.freeze({ ...result, sample }));
      renderProgress(result, sample);
    }
  }
}

async function runWorker({ backend, gitDir, input = null, manifest = null, scenario }) {
  const args = [
    '-lp',
    process.execPath,
    `--max-old-space-size=${settings.heapLimitMb}`,
    WORKER,
    `--backend=${backend}`,
    `--batch-bytes=${settings.batchBytes}`,
    `--git-dir=${gitDir}`,
    `--operations=${settings.operationCount}`,
    `--payload-bytes=${settings.payloadBytes}`,
    `--scenario=${scenario}`,
  ];
  if (input !== null) {
    args.push(`--input=${input}`);
  }
  if (manifest !== null) {
    args.push(`--manifest=${manifest}`);
  }
  const child = spawn('/usr/bin/time', args, {
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stdout = collect(child.stdout);
  const stderr = collect(child.stderr);
  const monitor = monitorProcessTree(child.pid);
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  const [stdoutBytes, stderrBytes, processTreePeak] = await Promise.all([
    stdout,
    stderr,
    monitor.stop(),
  ]);
  const diagnostics = stderrBytes.toString('utf8');
  if (code !== 0) {
    return Object.freeze({
      backend,
      diagnostics,
      processTreePeak,
      processTreePeakRssBytes: processTreePeak.totalBytes,
      scenario,
      status: 'failed',
    });
  }
  const worker = JSON.parse(stdoutBytes.toString('utf8'));
  const usage = parseTimeOutput(diagnostics);
  return {
    backend,
    cpuMs: (usage.userSeconds + usage.systemSeconds) * 1000,
    processRealMs: usage.realSeconds * 1000,
    processTreePeak,
    processTreePeakRssBytes: processTreePeak.totalBytes,
    scenario,
    status: 'measured',
    worker,
    workerMaxRssBytes: usage.maximumResidentSetSize,
  };
}

function monitorProcessTree(rootPid) {
  let active = true;
  let peakBytes = 0;
  let peakMembers = [];
  let pending = Promise.resolve();
  const sample = () => {
    pending = pending.then(async () => {
      const child = spawn('ps', ['-axo', 'pid=,ppid=,rss=,comm='], {
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const output = collect(child.stdout);
      const code = await new Promise((resolve) => child.once('close', resolve));
      if (code !== 0) {
        return;
      }
      const records = (await output)
        .toString('utf8')
        .trim()
        .split('\n')
        .map((line) => {
          const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/u);
          if (match === null) {
            throw new Error(`Unable to parse ps record: ${JSON.stringify(line)}`);
          }
          return {
            command: match[4],
            pid: Number(match[1]),
            ppid: Number(match[2]),
            rss: Number(match[3]),
          };
        });
      const descendants = new Set([rootPid]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const record of records) {
          if (!descendants.has(record.pid) && descendants.has(record.ppid)) {
            descendants.add(record.pid);
            changed = true;
          }
        }
      }
      const rssKilobytes = records.reduce(
        (total, record) => (descendants.has(record.pid) ? total + record.rss : total),
        0
      );
      const totalBytes = rssKilobytes * 1024;
      if (totalBytes > peakBytes) {
        peakBytes = totalBytes;
        peakMembers = records
          .filter((record) => descendants.has(record.pid))
          .map((record) =>
            Object.freeze({
              command: record.command,
              rssBytes: record.rss * 1024,
            })
          );
      }
    });
  };
  sample();
  const timer = setInterval(() => {
    if (active) {
      sample();
    }
  }, 20);
  return Object.freeze({
    async stop() {
      active = false;
      clearInterval(timer);
      sample();
      await pending;
      return Object.freeze({
        members: Object.freeze(peakMembers),
        totalBytes: peakBytes,
      });
    },
  });
}

async function createInputFile(path, count, byteLength, profile) {
  const handle = await open(path, 'w');
  try {
    for (let index = 0; index < count; index += 1) {
      const content =
        profile === 'random'
          ? randomFillSync(Buffer.allocUnsafe(byteLength))
          : Buffer.alloc(byteLength, 97 + (index % 26));
      content.writeBigUInt64BE(BigInt(index), 0);
      await handle.write(content);
    }
  } finally {
    await handle.close();
  }
}

async function createBareRepository(path) {
  await executeGit(null, ['init', '--bare', '--object-format=sha1', path]);
  return path;
}

async function* readChunks(path, count, byteLength) {
  const handle = await open(path, 'r');
  try {
    for (let index = 0; index < count; index += 1) {
      const content = Buffer.allocUnsafe(byteLength);
      let offset = 0;
      while (offset < byteLength) {
        const { bytesRead } = await handle.read(
          content,
          offset,
          byteLength - offset,
          index * byteLength + offset
        );
        if (bytesRead === 0) {
          throw new Error(`Input corpus ended during object ${index}`);
        }
        offset += bytesRead;
      }
      yield content;
    }
  } finally {
    await handle.close();
  }
}

async function validateWrites(gitDir, inputPath, oids, expectedSize) {
  if (!Array.isArray(oids) || oids.length !== settings.operationCount) {
    throw new Error('Worker did not return the expected object identifiers');
  }
  const catFile = new PersistentCatFile(gitDir);
  try {
    let index = 0;
    for await (const expected of readChunks(inputPath, settings.operationCount, expectedSize)) {
      const oid = oids[index];
      const actual = await catFile.contents(oid);
      if (actual.type !== 'blob' || !actual.content.equals(expected)) {
        throw new Error(`Worker wrote an invalid blob: ${oid}`);
      }
      index += 1;
    }
  } finally {
    await catFile.close();
  }
}

async function repositoryStats(gitDir) {
  const output = await executeGit(gitDir, ['count-objects', '-v']);
  return Object.freeze(
    Object.fromEntries(
      output
        .trim()
        .split('\n')
        .map((line) => {
          const separator = line.indexOf(': ');
          return [line.slice(0, separator), Number(line.slice(separator + 2))];
        })
    )
  );
}

function parseTimeOutput(output) {
  const realSeconds = numericLine(output, /^real\s+([0-9.]+)$/mu, 'real');
  const userSeconds = numericLine(output, /^user\s+([0-9.]+)$/mu, 'user');
  const systemSeconds = numericLine(output, /^sys\s+([0-9.]+)$/mu, 'sys');
  const maximumResidentSetSize = numericLine(
    output,
    /^\s*([0-9]+)\s+maximum resident set size$/mu,
    'maximum resident set size'
  );
  return Object.freeze({
    maximumResidentSetSize,
    realSeconds,
    systemSeconds,
    userSeconds,
  });
}

function numericLine(output, pattern, label) {
  const match = output.match(pattern);
  if (match === null) {
    throw new Error(`time output is missing ${label}: ${JSON.stringify(output)}`);
  }
  return Number(match[1]);
}

function selectedBackends(scenario) {
  return requestedBackends ?? defaultBackends[scenario];
}

function renderProgress(result, sample) {
  if (result.status === 'failed') {
    process.stdout.write(`  ${result.backend.padEnd(24)} sample ${sample + 1} FAILED\n`);
    return;
  }
  process.stdout.write(
    `  ${result.backend.padEnd(24)} sample ${sample + 1}` +
      `  ${formatMs(result.worker.operationWallMs).padStart(10)}` +
      `  CPU ${formatMs(result.cpuMs).padStart(10)}` +
      `  peak ${formatBytes(result.processTreePeakRssBytes).padStart(10)}\n`
  );
}

function renderMarkdown(report) {
  const lines = [
    '# Git Access Resource Profile',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `- Node: ${report.environment.node}`,
    `- Platform: ${report.environment.platform} ${report.environment.architecture}`,
    `- CPU: ${report.environment.cpu}`,
    `- Corpus: ${formatBytes(report.settings.corpusBytes)}`,
    `- V8 old-space limit: ${report.settings.heapLimitMb} MiB`,
    `- Objects: ${report.settings.operationCount}`,
    `- Bytes per object: ${formatBytes(report.settings.payloadBytes)}`,
    `- Payload profile: ${report.settings.payloadProfile}`,
    `- Maximum buffered read window: ${formatBytes(report.settings.batchBytes)}`,
    '',
    '| Scenario | Backend | Sample | Operation wall | Process CPU | Process-tree peak RSS | Objects/s | Status |',
    '|---|---|---:|---:|---:|---:|---:|---|',
  ];
  for (const result of report.results) {
    if (result.status === 'failed') {
      lines.push(
        `| ${result.scenario} | ${result.backend} | ${result.sample + 1}` +
          ' | failed | failed | failed | failed | failed |'
      );
      continue;
    }
    const operationsPerSecond =
      report.settings.operationCount / (result.worker.operationWallMs / 1000);
    lines.push(
      `| ${result.scenario} | ${result.backend} | ${result.sample + 1}` +
        ` | ${formatMs(result.worker.operationWallMs)} | ${formatMs(result.cpuMs)}` +
        ` | ${formatBytes(result.processTreePeakRssBytes)}` +
        ` | ${Math.round(operationsPerSecond).toLocaleString('en-US')} | measured |`
    );
  }
  return `${lines.join('\n')}\n`;
}

async function collect(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function formatMs(value) {
  return value < 1000 ? `${value.toFixed(1)} ms` : `${(value / 1000).toFixed(2)} s`;
}

function formatBytes(value) {
  const units = ['B', 'KiB', 'MiB', 'GiB'];
  let amount = value;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }
  return `${amount.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function timestamp(date) {
  return date.toISOString().replace(/[:.]/gu, '-');
}

function stringOption(name) {
  for (let index = 0; index < process.argv.length; index += 1) {
    const argument = process.argv[index];
    if (argument === name) {
      const value = process.argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`${name} requires a value`);
      }
      return value;
    }
    if (argument?.startsWith(`${name}=`)) {
      return argument.slice(name.length + 1);
    }
  }
  return null;
}

function integerOption(name, fallback) {
  const raw = stringOption(name);
  if (raw === null) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive safe integer`);
  }
  return value;
}

function requireChoice(name, value, choices) {
  if (!choices.includes(value)) {
    throw new Error(`${name} must be one of: ${choices.join(', ')}`);
  }
}
