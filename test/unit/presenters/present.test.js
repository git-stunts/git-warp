import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { present, shouldStripColor } from '../../../bin/presenters/index.js';

describe('present', () => {
  /** @type {string[]} */
  let stdoutChunks;
  /** @type {string[]} */
  let stderrChunks;
  /** @type {typeof process.stdout.write} */
  let originalWrite;
  /** @type {typeof process.stderr.write} */
  let originalErrWrite;

  beforeEach(() => {
    stdoutChunks = [];
    stderrChunks = [];
    originalWrite = process.stdout.write;
    originalErrWrite = process.stderr.write;
    process.stdout.write = /** @type {*} */ ((/** @type {string} */ chunk) => { stdoutChunks.push(chunk); return true; });
    process.stderr.write = /** @type {*} */ ((/** @type {string} */ chunk) => { stderrChunks.push(chunk); return true; });
  });

  afterEach(() => {
    process.stdout.write = originalWrite;
    process.stderr.write = originalErrWrite;
  });

  it('outputs JSON with sorted keys and 2-space indent', () => {
    present({ z: 1, a: 2 }, { format: 'json', command: 'info', view: null });
    const output = stdoutChunks.join('');
    expect(output).toContain('"a": 2');
    expect(output).toContain('"z": 1');
    expect(output.endsWith('\n')).toBe(true);
  });

  it('outputs NDJSON as single compact line', () => {
    present({ z: 1, a: 2 }, { format: 'ndjson', command: 'info', view: null });
    const output = stdoutChunks.join('');
    expect(output).toBe('{"a":2,"z":1}\n');
  });

  it('strips _-prefixed keys from JSON output', () => {
    present({ graph: 'g', _renderedSvg: '<svg/>' }, { format: 'json', command: 'query', view: null });
    const parsed = JSON.parse(stdoutChunks.join(''));
    expect(parsed).not.toHaveProperty('_renderedSvg');
    expect(parsed).toHaveProperty('graph', 'g');
  });

  it('strips _-prefixed keys from NDJSON output', () => {
    present({ graph: 'g', _renderedAscii: 'art' }, { format: 'ndjson', command: 'query', view: null });
    const parsed = JSON.parse(stdoutChunks.join(''));
    expect(parsed).not.toHaveProperty('_renderedAscii');
  });

  it('renders plain text for info command', () => {
    const payload = { repo: '/repo', graphs: [{ name: 'g' }] };
    present(payload, { format: 'text', command: 'info', view: null });
    const output = stdoutChunks.join('');
    expect(output).toContain('Repo: /repo');
  });

  it('renders plain text for debug conflicts', () => {
    present({
      graph: 'g',
      debugTopic: 'conflicts',
      analysisVersion: 'conflict-analyzer.v1',
      resolvedCoordinate: {
        analysisVersion: 'conflict-analyzer.v1',
        frontier: { alice: 'a'.repeat(40) },
        frontierDigest: 'f'.repeat(40),
        lamportCeiling: 3,
        scanBudgetApplied: { maxPatches: null },
        truncationPolicy: 'reverse-causal',
      },
      analysisSnapshotHash: 's'.repeat(40),
      diagnostics: [],
      conflicts: [],
    }, { format: 'text', command: 'debug', view: null });
    const output = stdoutChunks.join('');
    expect(output).toContain('Topic: conflicts');
    expect(output).toContain('Conflicts: 0');
  });

  it('renders plain text for debug provenance', () => {
    present({
      graph: 'g',
      debugTopic: 'provenance',
      entityId: 'user:alice',
      lamportCeiling: 7,
      totalPatches: 2,
      returnedPatches: 1,
      truncated: true,
      entries: [
        {
          sha: 'a'.repeat(40),
          writer: 'alice',
          lamport: 1,
          opCount: 2,
          opSummary: { NodeAdd: 1, PropSet: 1 },
          reads: [],
          writes: ['user:alice'],
        },
      ],
    }, { format: 'text', command: 'debug', view: null });
    const output = stdoutChunks.join('');
    expect(output).toContain('Topic: provenance');
    expect(output).toContain('Entity: user:alice');
    expect(output).toContain('Truncated: yes');
  });

  it('renders plain text for debug coordinate', () => {
    present({
      graph: 'g',
      debugTopic: 'coordinate',
      coordinateSource: 'cursor',
      requestedLamportCeiling: null,
      activeCursor: { tick: 4, mode: 'lamport' },
      resolvedCoordinate: {
        tick: 4,
        lamportCeiling: 4,
        maxTick: 4,
        tickCount: 3,
        frontierDigest: 'f'.repeat(40),
        patchCount: 3,
        nodes: 2,
        edges: 1,
        properties: 3,
        perWriter: {
          alice: { tipSha: 'a'.repeat(40), totalPatchCount: 2, visiblePatchCount: 2 },
          bob: { tipSha: 'b'.repeat(40), totalPatchCount: 1, visiblePatchCount: 1 },
        },
      },
      tickReceipt: {
        alice: { sha: 'a'.repeat(40), opSummary: { PropSet: 1 } },
      },
    }, { format: 'text', command: 'debug', view: null });
    const output = stdoutChunks.join('');
    expect(output).toContain('Topic: coordinate');
    expect(output).toContain('Source: cursor');
    expect(output).toContain('Active Cursor: tick 4 (lamport)');
    expect(output).toContain('Tick Receipt:');
  });

  it('renders plain text for debug receipts', () => {
    present({
      graph: 'g',
      debugTopic: 'receipts',
      lamportCeiling: null,
      filters: {
        writerId: 'alice',
        patch: null,
        target: null,
        results: ['superseded'],
        opTypes: ['PropSet'],
      },
      totalReceipts: 2,
      matchedReceipts: 1,
      returnedReceipts: 1,
      truncated: false,
      summary: {
        results: { applied: 0, superseded: 1, redundant: 0 },
        opTypes: { PropSet: 1 },
      },
      receipts: [
        {
          patchSha: 'a'.repeat(40),
          writer: 'alice',
          lamport: 2,
          totalOps: 2,
          matchedOps: 1,
          ops: [
            { op: 'PropSet', target: 'user:alice\0role', result: 'superseded', reason: 'lost LWW' },
          ],
        },
      ],
    }, { format: 'text', command: 'debug', view: null });
    const output = stdoutChunks.join('');
    expect(output).toContain('Topic: receipts');
    expect(output).toContain('Results: applied=0 superseded=1 redundant=0');
    expect(output).toContain('lost LWW');
  });

  it('renders plain text for debug timeline', () => {
    present({
      graph: 'g',
      debugTopic: 'timeline',
      coordinateSource: 'frontier',
      filters: {
        entityId: null,
        writerId: 'alice',
        lamportFloor: 1,
        lamportCeiling: null,
      },
      totalEntries: 3,
      returnedEntries: 2,
      truncated: true,
      entries: [
        {
          sha: 'a'.repeat(40),
          writer: 'alice',
          lamport: 2,
          opCount: 1,
          opSummary: { PropSet: 1 },
          reads: ['user:alice'],
          writes: ['user:alice'],
          targets: ['user:alice'],
        },
        {
          sha: 'b'.repeat(40),
          writer: 'alice',
          lamport: 4,
          opCount: 2,
          opSummary: { PropSet: 1, EdgeAdd: 1 },
          reads: [],
          writes: ['project:api'],
          targets: ['project:api', 'user:alice'],
        },
      ],
    }, { format: 'text', command: 'debug', view: null });
    const output = stdoutChunks.join('');
    expect(output).toContain('Topic: timeline');
    expect(output).toContain('Filters: writer=alice');
    expect(output).toContain('Truncated: yes (newest window)');
    expect(output).toContain('Targets: project:api, user:alice');
  });

  it('renders error payloads to stderr', () => {
    present({ error: { message: 'boom' } }, { format: 'text', command: 'info', view: null });
    expect(stdoutChunks).toHaveLength(0);
    expect(stderrChunks.join('')).toContain('Error: boom');
  });

  it('renders error payloads to stderr even in json mode', () => {
    present({ error: { message: 'fail' } }, { format: 'json', command: 'info', view: null });
    expect(stdoutChunks).toHaveLength(0);
    expect(stderrChunks.join('')).toContain('Error: fail');
  });

  it('view query with missing _renderedAscii does not crash', () => {
    present({ graph: 'g', nodes: [] }, { format: 'text', command: 'query', view: 'ascii' });
    const output = stdoutChunks.join('');
    expect(output).not.toContain('undefined');
  });

  it('falls back to JSON for unknown text commands', () => {
    present({ custom: 'data' }, { format: 'text', command: 'unknown-cmd', view: null });
    const output = stdoutChunks.join('');
    expect(JSON.parse(output)).toEqual({ custom: 'data' });
  });
});

describe('shouldStripColor', () => {
  /** @type {Record<string, string|undefined>} */
  const envBackup = {};

  beforeEach(() => {
    for (const key of ['FORCE_COLOR', 'NO_COLOR', 'CI']) {
      envBackup[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ['FORCE_COLOR', 'NO_COLOR', 'CI']) {
      if (envBackup[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = envBackup[key];
      }
    }
  });

  it('strips when FORCE_COLOR=0', () => {
    process.env.FORCE_COLOR = '0';
    expect(shouldStripColor()).toBe(true);
  });

  it('keeps color when FORCE_COLOR=1', () => {
    process.env.FORCE_COLOR = '1';
    expect(shouldStripColor()).toBe(false);
  });

  it('FORCE_COLOR overrides NO_COLOR', () => {
    process.env.FORCE_COLOR = '1';
    process.env.NO_COLOR = '';
    expect(shouldStripColor()).toBe(false);
  });

  it('strips when NO_COLOR is set', () => {
    process.env.NO_COLOR = '';
    expect(shouldStripColor()).toBe(true);
  });

  it('strips when CI is set (with TTY)', () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    process.env.CI = 'true';
    expect(shouldStripColor()).toBe(true);
    Object.defineProperty(process.stdout, 'isTTY', { value: undefined, configurable: true });
  });

  it('strips when stdout is not a TTY', () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: undefined, configurable: true });
    expect(shouldStripColor()).toBe(true);
  });
});

describe('package.json files array', () => {
  it('includes bin/presenters so npm publish works', () => {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../../package.json'), 'utf8'));
    expect(pkg.files).toContain('bin/presenters');
  });
});
