import { Buffer } from 'node:buffer';
import { mkdir, writeFile } from 'node:fs/promises';
import { cpus } from 'node:os';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { BACKEND_NAMES, createBackend } from './backends.mjs';
import { createFixture, fixturePayload } from './fixture.mjs';
import { executeGit, parseRawTree, PersistentCatFile } from './git-process.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const quick = process.argv.includes('--quick');
const settings = Object.freeze({
  fixtureObjects: integerOption('--objects', quick ? 32 : 256),
  operationCount: integerOption('--operations', quick ? 16 : 128),
  payloadBytes: integerOption('--payload-bytes', quick ? 1024 : 4096),
  payloadProfile: stringOption('--payload-profile') ?? 'repetitive',
  samples: integerOption('--samples', quick ? 3 : 7),
  warmups: integerOption('--warmups', quick ? 1 : 2),
});

const SCENARIOS = Object.freeze([
  Object.freeze({
    capability: 'objectInfo',
    name: 'object-info',
    run: runObjectInfo,
    stable: true,
  }),
  Object.freeze({ capability: 'readBlob', name: 'blob-read', run: runBlobRead, stable: true }),
  Object.freeze({
    capability: 'readTreeEntry',
    name: 'tree-entry',
    run: runTreeEntry,
    stable: true,
  }),
  Object.freeze({ capability: 'resolveRef', name: 'ref-read', run: runRefRead, stable: true }),
  Object.freeze({ capability: 'writeBlob', name: 'blob-write', run: runBlobWrite, stable: false }),
  Object.freeze({ capability: 'writeTree', name: 'tree-write', run: runTreeWrite, stable: false }),
]);

const SESSION_BACKENDS = Object.freeze([
  'git-one-shot',
  'git-persistent',
  'nodegit',
  'napi-libgit2',
  'isomorphic-git',
]);
const requestedBackend = stringOption('--backend');
const requestedFixture = stringOption('--fixture') ?? (quick ? 'loose' : 'both');
const requestedScenario = stringOption('--scenario');
const selectedBackends =
  requestedBackend === null
    ? BACKEND_NAMES
    : Object.freeze(
        requestedBackend
          .split(',')
          .map((backend) => requireChoice('--backend', backend, BACKEND_NAMES))
      );
const scenarioNames = Object.freeze([
  'session-first-tree',
  ...SCENARIOS.map((scenario) => scenario.name),
]);
if (requestedScenario !== null) {
  requireChoice('--scenario', requestedScenario, scenarioNames);
}
requireChoice('--fixture', requestedFixture, ['loose', 'packed', 'both']);
requireChoice('--payload-profile', settings.payloadProfile, ['repetitive', 'random']);

await main();

async function main() {
  const startedAt = new Date();
  const fixtures = requestedFixture === 'both' ? [false, true] : [requestedFixture === 'packed'];
  const results = [];
  for (const packed of fixtures) {
    process.stdout.write(`Preparing ${packed ? 'packed' : 'loose'} fixture...\n`);
    const fixture = await createFixture({
      fanout: 32,
      objectCount: settings.fixtureObjects,
      packed,
      payloadBytes: settings.payloadBytes,
      payloadProfile: settings.payloadProfile,
    });
    try {
      if (requestedScenario === null || requestedScenario === 'session-first-tree') {
        await profileSessionStartup(fixture, packed, results);
      }
      for (const scenario of SCENARIOS.filter(
        (candidate) => requestedScenario === null || candidate.name === requestedScenario
      )) {
        process.stdout.write(`\n${scenario.name} (${packed ? 'packed' : 'loose'})\n`);
        for (const backendName of selectedBackends) {
          const skipReason = redundantScenario(backendName, scenario.name);
          if (skipReason !== null) {
            process.stdout.write(`  ${backendName.padEnd(31)} equivalent to ${skipReason}\n`);
            results.push(
              Object.freeze({
                backend: backendName,
                equivalentTo: skipReason,
                fixture: packed ? 'packed' : 'loose',
                scenario: scenario.name,
                status: 'equivalent',
              })
            );
            continue;
          }
          const backend = await createBackend(backendName, fixture);
          try {
            if (!backend.capabilities[scenario.capability]) {
              process.stdout.write(`  ${backendName.padEnd(31)} unsupported\n`);
              results.push(
                Object.freeze({
                  backend: backendName,
                  fixture: packed ? 'packed' : 'loose',
                  scenario: scenario.name,
                  status: 'unsupported',
                })
              );
              continue;
            }
            const measurement = await measure(
              (invocation) => scenario.run(backend, fixture, settings.operationCount, invocation),
              settings,
              scenario.stable
            );
            const result = Object.freeze({
              backend: backendName,
              fixture: packed ? 'packed' : 'loose',
              operationCount: settings.operationCount,
              scenario: scenario.name,
              status: 'measured',
              ...measurement,
            });
            results.push(result);
            process.stdout.write(
              `  ${backendName.padEnd(31)} first ${formatMs(result.firstMs).padStart(10)}` +
                `  median ${formatMs(result.medianMs).padStart(10)}` +
                `  ${Math.round(result.operationsPerSecond).toLocaleString()} ops/s\n`
            );
          } finally {
            await backend.close();
          }
        }
      }
    } finally {
      await fixture.cleanup();
    }
  }

  const report = Object.freeze({
    environment: Object.freeze({
      architecture: process.arch,
      cpu: cpus()[0]?.model ?? 'unknown',
      git: (await executeGit(null, ['--version'])).trim(),
      node: process.version,
      platform: process.platform,
    }),
    generatedAt: new Date().toISOString(),
    results: Object.freeze(results),
    settings,
  });
  const stamp = timestamp(startedAt);
  const resultsDirectory = join(ROOT, 'results');
  await mkdir(resultsDirectory, { recursive: true });
  await writeFile(
    join(resultsDirectory, `${stamp}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8'
  );
  await writeFile(join(resultsDirectory, `${stamp}.md`), renderMarkdown(report), 'utf8');
  process.stdout.write(`\nWrote results/${stamp}.json and results/${stamp}.md\n`);
}

async function profileSessionStartup(fixture, packed, results) {
  process.stdout.write(`\nsession-first-tree (${packed ? 'packed' : 'loose'})\n`);
  const expected = fixture.blobs[0];
  for (const backendName of SESSION_BACKENDS.filter((backend) =>
    selectedBackends.includes(backend)
  )) {
    const operation = async () => {
      const backend = await createBackend(backendName, fixture);
      try {
        if (!backend.capabilities.readTreeEntry) {
          throw new Error(`${backendName} cannot perform the session startup workload`);
        }
        const entry = await backend.readTreeEntry(expected.leafOid, expected.name);
        if (entry === null || entry.oid !== expected.oid) {
          throw new Error(`${backendName} returned an incorrect startup tree entry`);
        }
        return addOid(0, entry.oid);
      } finally {
        await backend.close();
      }
    };
    const measurement = await measure(
      operation,
      {
        ...settings,
        operationCount: 1,
        warmups: 0,
      },
      true
    );
    const result = Object.freeze({
      backend: backendName,
      fixture: packed ? 'packed' : 'loose',
      operationCount: 1,
      scenario: 'session-first-tree',
      status: 'measured',
      ...measurement,
    });
    results.push(result);
    process.stdout.write(
      `  ${backendName.padEnd(31)} first ${formatMs(result.firstMs).padStart(10)}` +
        `  median ${formatMs(result.medianMs).padStart(10)}\n`
    );
  }
}

async function measure(operation, options, stable) {
  globalThis.gc?.();
  const first = await measuredInvocation(operation, 0);
  const expected = first.value;
  for (let index = 0; index < options.warmups; index += 1) {
    const actual = await measuredInvocation(operation, index + 1);
    if (stable) {
      assertSameResult(actual.value, expected);
    }
  }
  const samples = [];
  for (let index = 0; index < options.samples; index += 1) {
    globalThis.gc?.();
    const actual = await measuredInvocation(operation, index + options.warmups + 1);
    if (stable) {
      assertSameResult(actual.value, expected);
    }
    samples.push(actual.wallMs);
  }
  const medianMs = median(samples);
  return Object.freeze({
    firstMs: first.wallMs,
    medianMs,
    operationsPerSecond: options.operationCount / (medianMs / 1000),
    p95Ms: percentile(samples, 0.95),
    samplesMs: Object.freeze(samples),
  });
}

async function measuredInvocation(operation, invocation) {
  const start = performance.now();
  const raw = await operation(invocation);
  const wallMs = performance.now() - start;
  if (typeof raw === 'object' && raw !== null && 'value' in raw) {
    await raw.validate?.();
    return Object.freeze({ value: raw.value, wallMs });
  }
  return Object.freeze({ value: raw, wallMs });
}

async function runObjectInfo(backend, fixture, count) {
  let checksum = 0;
  for (let index = 0; index < count; index += 1) {
    const expected = fixture.blobs[index % fixture.blobs.length];
    const info = await backend.objectInfo(expected.oid);
    if (info.oid !== expected.oid || info.type !== 'blob' || info.size !== expected.size) {
      throw new Error(`${backend.name} returned incorrect object metadata`);
    }
    checksum = addOid(checksum + info.size, info.oid);
  }
  return checksum >>> 0;
}

async function runBlobRead(backend, fixture, count) {
  let checksum = 0;
  for (let index = 0; index < count; index += 1) {
    const expected = fixture.blobs[index % fixture.blobs.length];
    const content = Buffer.from(await backend.readBlob(expected.oid));
    if (!content.equals(expected.content)) {
      throw new Error(`${backend.name} returned incorrect blob content`);
    }
    checksum = (checksum + content.length + content[content.length - 1]) >>> 0;
  }
  return checksum;
}

async function runTreeEntry(backend, fixture, count) {
  let checksum = 0;
  for (let index = 0; index < count; index += 1) {
    const expected = fixture.blobs[index % fixture.blobs.length];
    const entry = await backend.readTreeEntry(expected.leafOid, expected.name);
    if (
      entry === null ||
      entry.oid !== expected.oid ||
      entry.name !== expected.name ||
      entry.type !== 'blob'
    ) {
      throw new Error(`${backend.name} returned an incorrect tree entry`);
    }
    checksum = addOid(checksum, entry.oid);
  }
  return checksum >>> 0;
}

async function runRefRead(backend, fixture, count) {
  let checksum = 0;
  for (let index = 0; index < count; index += 1) {
    const oid = await backend.resolveRef(fixture.refName);
    if (oid !== fixture.commitOid) {
      throw new Error(`${backend.name} returned an incorrect ref target`);
    }
    checksum = addOid(checksum, oid);
  }
  return checksum >>> 0;
}

async function runBlobWrite(backend, fixture, count, invocation) {
  const contents = [];
  for (let index = 0; index < count; index += 1) {
    contents.push(
      writePayload(backend.name, invocation, index, fixture.payloadBytes, fixture.payloadProfile)
    );
  }
  const oids =
    typeof backend.writeBlobs === 'function'
      ? await backend.writeBlobs(contents)
      : await writeBlobsSequentially(backend, contents);
  const written = [];
  let checksum = 0;
  for (let index = 0; index < count; index += 1) {
    const content = contents[index];
    const oid = oids[index];
    if (content === undefined || oid === undefined) {
      throw new Error(`${backend.name} returned an incomplete blob write result`);
    }
    written.push(Object.freeze({ content, oid }));
    checksum = addOid(checksum + content.length, oid);
  }
  return Object.freeze({
    value: checksum >>> 0,
    async validate() {
      const catFile = new PersistentCatFile(fixture.gitDir);
      try {
        for (const expected of written) {
          const actual = await catFile.contents(expected.oid);
          if (actual.type !== 'blob' || !actual.content.equals(expected.content)) {
            throw new Error(`${backend.name} wrote an invalid blob object`);
          }
        }
      } finally {
        await catFile.close();
      }
    },
  });
}

async function writeBlobsSequentially(backend, contents) {
  const oids = [];
  for (const content of contents) {
    oids.push(await backend.writeBlob(content));
  }
  return oids;
}

async function runTreeWrite(backend, fixture, count, invocation) {
  const written = [];
  let checksum = 0;
  for (let index = 0; index < count; index += 1) {
    const entries = [];
    for (let member = 0; member < Math.min(8, fixture.blobs.length); member += 1) {
      const blob = fixture.blobs[(index + member) % fixture.blobs.length];
      entries.push(
        Object.freeze({
          mode: '100644',
          name: `written-${backend.name}-${invocation}-${index}-${member}.bin`,
          oid: blob.oid,
          type: 'blob',
        })
      );
    }
    const oid = await backend.writeTree(entries);
    written.push(Object.freeze({ entries: Object.freeze(entries), oid }));
    checksum = addOid(checksum + entries.length, oid);
  }
  return Object.freeze({
    value: checksum >>> 0,
    async validate() {
      const catFile = new PersistentCatFile(fixture.gitDir);
      try {
        for (const expected of written) {
          const actual = await catFile.contents(expected.oid);
          if (actual.type !== 'tree') {
            throw new Error(`${backend.name} wrote a non-tree object`);
          }
          const entries = parseRawTree(actual.content, fixture.oidBytes);
          if (!sameTreeEntries(entries, expected.entries)) {
            throw new Error(`${backend.name} wrote an invalid tree object`);
          }
        }
      } finally {
        await catFile.close();
      }
    },
  });
}

function writePayload(backendName, invocation, index, byteLength, payloadProfile) {
  const seed = invocation * 1_000_003 + index;
  const content = fixturePayload(seed, byteLength, payloadProfile);
  const prefix = Buffer.from(`${backendName}:${invocation}:${index}:`, 'utf8');
  prefix.copy(content, 0, 0, Math.min(prefix.length, content.length));
  return content;
}

function sameTreeEntries(actual, expected) {
  if (actual.length !== expected.length) {
    return false;
  }
  return actual.every((entry, index) => {
    const wanted = expected[index];
    return (
      wanted !== undefined &&
      entry.mode === wanted.mode &&
      entry.name === wanted.name &&
      entry.oid === wanted.oid &&
      entry.type === wanted.type
    );
  });
}

function redundantScenario(backend, scenario) {
  if (backend === 'git-persistent-tree-cache') {
    return scenario === 'tree-entry' ? null : 'git-persistent';
  }
  if (backend === 'git-persistent-session-cache') {
    return scenario === 'ref-read' ? null : 'git-persistent-tree-cache';
  }
  if (backend === 'git-persistent-mktree') {
    return scenario === 'tree-write' ? null : 'git-persistent-tree-cache';
  }
  if (backend === 'git-fast-import-batch' || backend === 'git-fast-import-pack') {
    return scenario === 'blob-write' ? null : 'not applicable';
  }
  if (
    backend === 'git-persistent' &&
    (scenario === 'ref-read' || scenario === 'blob-write' || scenario === 'tree-write')
  ) {
    return 'git-one-shot';
  }
  return null;
}

function addOid(checksum, oid) {
  return (checksum + Number.parseInt(oid.slice(0, 8), 16)) >>> 0;
}

function assertSameResult(actual, expected) {
  if (actual !== expected) {
    throw new Error(`Benchmark result changed between samples: ${actual} !== ${expected}`);
  }
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function percentile(values, percentileValue) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * percentileValue) - 1)];
}

function formatMs(value) {
  if (value < 1) {
    return `${(value * 1000).toFixed(1)} us`;
  }
  return `${value.toFixed(1)} ms`;
}

function timestamp(date) {
  return date.toISOString().replace(/[:.]/gu, '-');
}

function renderMarkdown(report) {
  const lines = [
    '# Git Access Backend Profile',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `- Node: ${report.environment.node}`,
    `- Git: ${report.environment.git}`,
    `- Platform: ${report.environment.platform} ${report.environment.architecture}`,
    `- CPU: ${report.environment.cpu}`,
    `- Operations per sample: ${report.settings.operationCount}`,
    '',
    '| Fixture | Scenario | Backend | First | Median | p95 | Ops/s |',
    '|---|---|---|---:|---:|---:|---:|',
  ];
  for (const result of report.results) {
    if (result.status === 'unsupported') {
      lines.push(
        `| ${result.fixture} | ${result.scenario} | ${result.backend} | unsupported | unsupported | unsupported | unsupported |`
      );
      continue;
    }
    if (result.status === 'equivalent') {
      lines.push(
        `| ${result.fixture} | ${result.scenario} | ${result.backend} | equivalent to ${result.equivalentTo} | equivalent | equivalent | equivalent |`
      );
      continue;
    }
    lines.push(
      `| ${result.fixture} | ${result.scenario} | ${result.backend}` +
        ` | ${formatMs(result.firstMs)} | ${formatMs(result.medianMs)}` +
        ` | ${formatMs(result.p95Ms)} | ${Math.round(result.operationsPerSecond).toLocaleString('en-US')} |`
    );
  }
  return `${lines.join('\n')}\n`;
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
  return value;
}
