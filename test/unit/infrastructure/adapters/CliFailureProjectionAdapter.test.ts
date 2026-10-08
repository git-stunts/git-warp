import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CasError } from '@git-stunts/git-cas';
import { CliError } from '../../../../bin/cli/infrastructure.ts';
import CliFailureProjectionAdapter from '../../../../src/infrastructure/adapters/CliFailureProjectionAdapter.ts';
import CliFailureRedactorAdapter from '../../../../src/infrastructure/adapters/CliFailureRedactorAdapter.ts';
import CliFailureCodecAdapter from '../../../../src/infrastructure/adapters/CliFailureCodecAdapter.ts';
import CliFailureNode from '../../../../src/infrastructure/adapters/CliFailureNode.ts';
import CliFailureReport from '../../../../src/infrastructure/adapters/CliFailureReport.ts';
import { failureTextPrefix } from '../../../../src/infrastructure/adapters/CliFailureLimits.ts';

const fixtureHome = join(tmpdir(), 'cli-failure-home');
const fixtureDirectory = join(tmpdir(), 'cli-failure-project');
const redactor = new CliFailureRedactorAdapter({ home: fixtureHome, directory: fixtureDirectory });
const projector = new CliFailureProjectionAdapter({
  classifier: { isCliError: (error) => error instanceof CliError }, redactor,
});
const codec = new CliFailureCodecAdapter();

function countNodes(node: CliFailureNode): number {
  return 1 + node.causes.reduce((total, child) => total + countNodes(child), 0);
}

describe('bounded CLI error projection', () => {
  it('retains nested CAS codes without disclosing metadata', () => {
    const batch = new CasError('Page batch limit reached', 'PAGE_BATCH_LIMIT');
    const retention = new CasError('Retention failed', 'WORKSPACE_RETENTION_FAILED', {
      originalError: batch, credential: 'PRIVATE_SENTINEL',
    });
    const report = projector.project(retention);
    expect(report.exitCode).toBe(3);
    expect(report.code).toBe('E_INTERNAL');
    expect(report.primary.code).toBe('WORKSPACE_RETENTION_FAILED');
    expect(report.primary.causes[0]?.code).toBe('PAGE_BATCH_LIMIT');
    expect(report.primary.causes[0]?.relation).toBe('originalError');
    expect(codec.encode(report, 'json')).not.toContain('PRIVATE_SENTINEL');
    expect(codec.encode(report, 'human')).toContain('PAGE_BATCH_LIMIT');
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.primary.causes)).toBe(true);
  });

  it('preserves primary CLI identity when operation and cleanup both fail', () => {
    const primary = new CliError('Command failed', { code: 'E_USAGE', exitCode: 1 });
    const cleanup = new Error('Command cleanup failed');
    const report = projector.project(new AggregateError([primary, cleanup], 'Combined failure'));
    expect(report.code).toBe('E_USAGE');
    expect(report.exitCode).toBe(1);
    expect(report.primary.message).toBe('Command failed');
    expect(report.cleanup[0]?.message).toBe('Command cleanup failed');
    const text = codec.encode(report, 'jsonl');
    expect(text).toContain('Command cleanup failed');
    expect(text.endsWith('\n')).toBe(true);
    expect(text.trim().includes('\n')).toBe(false);
  });

  it('preserves cleanup errors across nested aggregate layers', () => {
    const command = new CliError('Primary', { code: 'E_USAGE', exitCode: 1 });
    const inside = new AggregateError([command, new Error('Command cleanup')], 'Inner');
    const outside = new AggregateError([inside, new Error('Storage cleanup')], 'Outer');
    const report = projector.project(outside);
    expect(report.code).toBe('E_USAGE');
    expect(report.exitCode).toBe(1);
    const encoded = codec.encode(report, 'json');
    expect(encoded).toContain('Command cleanup');
    expect(encoded).toContain('Storage cleanup');
  });

  it('keeps immediate safe Error cause and separate storage cleanup', () => {
    const cause = new Error('Original object error');
    const report = projector.project(new CliError('Command failed', { cause }), new Error('Storage cleanup'));
    expect(report.cause).toBe('Original object error');
    expect(report.cleanup[0]?.relation).toBe('cleanup');
    expect(codec.encode(report, 'json')).toContain('"cause": "Original object error"');
    expect(codec.encode(report, 'human')).toContain('Storage cleanup');
  });

  it('never calls cause accessors or object serialization methods', () => {
    let accesses = 0;
    const raw = new Error('Safe message');
    Object.defineProperty(raw, 'cause', { get() { accesses++; throw new Error('Private getter'); } });
    const report = projector.project(raw);
    expect(accesses).toBe(0);
    expect(report.exitCode).toBe(3);
    expect(report.primary.message).toBe('Safe message');
    const unsupported = { secret: 'PRIVATE_SENTINEL', toJSON() { accesses++; return 'PRIVATE_SENTINEL'; } };
    const other = projector.project(new Error('Safe', { cause: unsupported }));
    expect(codec.encode(other, 'json')).not.toContain('PRIVATE_SENTINEL');
    expect(accesses).toBe(0);
  });

  it('contains reflective and prototype trap failures', () => {
    const slots = new Proxy(new Error('Hidden'), {
      getOwnPropertyDescriptor() { throw new Error('Private descriptor'); },
    });
    expect(projector.project(slots).primary.message).toBe('Unknown error');
    const prototype = new Proxy({}, { getPrototypeOf() { throw new Error('Private prototype'); } });
    expect(projector.project(prototype).exitCode).toBe(3);
    const failing = new CliFailureProjectionAdapter({
      classifier: { isCliError() { throw new Error('Classifier failed'); } }, redactor,
    });
    expect(failing.project(new Error('Operation')).exitCode).toBe(3);
  });

  it('formats nested human causes and inaccessible immediate cause messages', () => {
    const batch = new CasError('Batch limit', 'PAGE_BATCH_LIMIT');
    const retention = new CasError('Retention', 'WORKSPACE_RETENTION_FAILED', { originalError: batch });
    const report = projector.project(new CliError('Primary', { cause: retention }));
    expect(codec.encode(report, 'human')).toContain('    originalError [PAGE_BATCH_LIMIT]');
    const inaccessible = new Proxy(new Error('Private'), {
      getOwnPropertyDescriptor() { throw new Error('Inspection denied'); },
    });
    expect(projector.project(new CliError('Primary', { cause: inaccessible })).cause).toBe('Unknown error');
  });

  it('handles arbitrary non-Error values safely', () => {
    for (const value of [null, undefined, 17, 'PRIVATE_SENTINEL', { secret: 'PRIVATE_SENTINEL' }]) {
      const report = projector.project(value);
      expect(report.primary.message).toBe('Unknown error');
      expect(codec.encode(report, 'json')).not.toContain('PRIVATE_SENTINEL');
    }
  });

  it('bounds cycles, depth and shared-node traversal', () => {
    const cycle = new Error('Cycle');
    Object.defineProperty(cycle, 'cause', { value: cycle });
    const report = projector.project(cycle);
    expect(report.truncated).toBe(true);
    expect(countNodes(report.primary)).toBeLessThanOrEqual(8);
    let deep = new Error('Leaf');
    for (let index = 0; index < 12; index++) { deep = new Error('Ancestor', { cause: deep }); }
    expect(projector.project(deep).truncated).toBe(true);
    const wide = new AggregateError(Array.from({ length: 20 }, () => new Error('Member')), 'Wide');
    const projected = projector.project(wide);
    expect(countNodes(projected.primary) + projected.cleanup.reduce((n, child) => n + countNodes(child), 0))
      .toBeLessThanOrEqual(8);
    expect(projected.truncated).toBe(true);
  });

  it('redacts supported private patterns while retaining refs, hashes and relative paths', () => {
    const text = redactor.message(`at ${join(fixtureHome, 'key')} and ${join(fixtureDirectory, 'src/a.ts')} https://user:pass@host Bearer SECRET ghp_PRIVATE refs/warp/lane abcdef0123`);
    expect(text).toContain('<HOME>/key');
    expect(text).toContain('./src/a.ts');
    expect(text).toContain('refs/warp/lane abcdef0123');
    for (const value of ['user:pass', 'SECRET', 'ghp_PRIVATE']) { expect(text).not.toContain(value); }
    expect(redactor.message('\u001b[31mvisible\u0001\u001b[0m')).toBe('visible');
    expect(new CliFailureRedactorAdapter({ home: '', directory: '' }).message(posix.join(posix.sep, 'home', 'other', 'file'))).toBe('<HOME>/file');
  });

  it('redacts URL credentials across the raw scan boundary and supported authority spellings', () => {
    for (const message of [
      'https://u:PRIVATE_PASSWORD' + 'p'.repeat(2048) + '@host/path',
      'https://PRIVATE_USER@host/path',
      'HTTPS://u:PRIVATE_PASSWORD@host/path',
    ]) {
      const report = projector.project(new Error(message));
      for (const format of ['human', 'json', 'jsonl']) {
        if (format === 'human' || format === 'json' || format === 'jsonl') {
          const emitted = codec.encode(report, format);
          expect(emitted).not.toContain('PRIVATE_PASSWORD');
          expect(emitted).not.toContain('PRIVATE_USER');
          expect(emitted).toContain('[REDACTED]');
          expect(new TextEncoder().encode(emitted).length).toBeLessThanOrEqual(8192);
        }
      }
    }
  });

  it('clips valid Unicode and checks escaped serialized output including newline', () => {
    expect(failureTextPrefix('😀x', 4)).toBe('😀');
    const report = projector.project(new CliError('😀'.repeat(3000), { code: 'E_USAGE', exitCode: 1 }));
    expect(report.truncated).toBe(true);
    for (const format of ['human', 'json', 'jsonl']) {
      if (format === 'human' || format === 'json' || format === 'jsonl') {
        expect(new TextEncoder().encode(codec.encode(report, format)).length).toBeLessThanOrEqual(8192);
      }
    }
    const children = Array.from({ length: 7 }, () => new CliFailureNode({
      code: 'E_INTERNAL', message: '"'.repeat(1024), relation: 'aggregate',
    }));
    const maximum = new CliFailureReport({
      primary: new CliFailureNode({ code: 'E_USAGE', message: '"'.repeat(1024), relation: 'cause', causes: children }),
      code: 'E_USAGE', exitCode: 1,
    });
    for (const format of ['human', 'jsonl']) {
      if (format === 'human' || format === 'jsonl') {
        expect(new TextEncoder().encode(codec.encode(maximum, format)).length).toBeLessThanOrEqual(8192);
      }
    }
    const encoded = codec.encode(maximum, 'json');
    expect(new TextEncoder().encode(encoded).length).toBeLessThanOrEqual(8192);
    expect(encoded).toContain('"code": "E_USAGE"');
    expect(encoded).toContain('"truncated": true');
  });
});
