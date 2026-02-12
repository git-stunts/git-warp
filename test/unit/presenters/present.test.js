import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { present, shouldStripColor } from '../../../bin/presenters/index.js';

describe('present', () => {
  let stdoutChunks;
  let stderrChunks;
  let originalWrite;
  let originalErrWrite;

  beforeEach(() => {
    stdoutChunks = [];
    stderrChunks = [];
    originalWrite = process.stdout.write;
    originalErrWrite = process.stderr.write;
    process.stdout.write = (chunk) => { stdoutChunks.push(chunk); return true; };
    process.stderr.write = (chunk) => { stderrChunks.push(chunk); return true; };
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

  it('falls back to JSON for unknown text commands', () => {
    present({ custom: 'data' }, { format: 'text', command: 'unknown-cmd', view: null });
    const output = stdoutChunks.join('');
    expect(JSON.parse(output)).toEqual({ custom: 'data' });
  });
});

describe('shouldStripColor', () => {
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

  it('strips when NO_COLOR is set', () => {
    process.env.NO_COLOR = '';
    expect(shouldStripColor()).toBe(true);
  });

  it('strips when CI is set', () => {
    process.env.CI = 'true';
    expect(shouldStripColor()).toBe(true);
  });
});
