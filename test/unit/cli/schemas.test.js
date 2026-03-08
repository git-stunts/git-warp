import { describe, it, expect } from 'vitest';
import {
  bisectSchema,
  doctorSchema,
  historySchema,
  installHooksSchema,
  verifyAuditSchema,
  pathSchema,
  querySchema,
  viewSchema,
  seekSchema,
  serveSchema,
} from '../../../bin/cli/schemas.js';

describe('bisectSchema', () => {
  const VALID_SHA = 'a'.repeat(40);
  const VALID_SHA_2 = 'b'.repeat(40);

  it('accepts valid 40-char hex SHAs', () => {
    const result = bisectSchema.parse({ good: VALID_SHA, bad: VALID_SHA_2, test: 'exit 0' });
    expect(result.good).toBe(VALID_SHA);
    expect(result.bad).toBe(VALID_SHA_2);
    expect(result.test).toBe('exit 0');
  });

  it('rejects short SHA for --good', () => {
    expect(() => bisectSchema.parse({ good: 'abc123', bad: VALID_SHA_2, test: 'exit 0' })).toThrow(/40-character hex SHA/);
  });

  it('rejects short SHA for --bad', () => {
    expect(() => bisectSchema.parse({ good: VALID_SHA, bad: 'abc123', test: 'exit 0' })).toThrow(/40-character hex SHA/);
  });

  it('rejects uppercase hex', () => {
    expect(() => bisectSchema.parse({ good: 'A'.repeat(40), bad: VALID_SHA_2, test: 'exit 0' })).toThrow(/40-character hex SHA/);
  });

  it('rejects empty --good', () => {
    expect(() => bisectSchema.parse({ good: '', bad: VALID_SHA_2, test: 'exit 0' })).toThrow();
  });

  it('rejects empty --test', () => {
    expect(() => bisectSchema.parse({ good: VALID_SHA, bad: VALID_SHA_2, test: '' })).toThrow();
  });

  it('rejects unknown keys', () => {
    expect(() => bisectSchema.parse({ good: VALID_SHA, bad: VALID_SHA_2, test: 'exit 0', unknown: true })).toThrow();
  });
});

describe('doctorSchema', () => {
  it('defaults strict to false', () => {
    const result = doctorSchema.parse({});
    expect(result.strict).toBe(false);
  });

  it('accepts --strict', () => {
    const result = doctorSchema.parse({ strict: true });
    expect(result.strict).toBe(true);
  });

  it('rejects unknown keys', () => {
    expect(() => doctorSchema.parse({ unknown: true })).toThrow();
  });
});

describe('historySchema', () => {
  it('accepts empty input', () => {
    const result = historySchema.parse({});
    expect(result.node).toBeUndefined();
  });

  it('accepts --node', () => {
    const result = historySchema.parse({ node: 'user:alice' });
    expect(result.node).toBe('user:alice');
  });

  it('rejects unknown keys', () => {
    expect(() => historySchema.parse({ unknown: true })).toThrow();
  });
});

describe('installHooksSchema', () => {
  it('defaults force to false', () => {
    const result = installHooksSchema.parse({});
    expect(result.force).toBe(false);
  });

  it('accepts --force', () => {
    const result = installHooksSchema.parse({ force: true });
    expect(result.force).toBe(true);
  });
});

describe('verifyAuditSchema', () => {
  it('accepts empty input', () => {
    const result = verifyAuditSchema.parse({});
    expect(result.since).toBeUndefined();
    expect(result.writer).toBeUndefined();
  });

  it('accepts --since and --writer', () => {
    const result = verifyAuditSchema.parse({ since: 'abc', writer: 'alice' });
    expect(result.since).toBe('abc');
    expect(result.writer).toBe('alice');
  });

  it('rejects empty-string --since', () => {
    expect(() => verifyAuditSchema.parse({ since: '' })).toThrow();
  });

  it('rejects empty-string --writer', () => {
    expect(() => verifyAuditSchema.parse({ writer: '' })).toThrow();
  });
});

describe('pathSchema', () => {
  it('transforms to expected shape', () => {
    const result = pathSchema.parse({ from: 'a', to: 'b' });
    expect(result.from).toBe('a');
    expect(result.to).toBe('b');
    expect(result.labels).toEqual([]);
    expect(result.maxDepth).toBeUndefined();
  });

  it('transforms --dir enum', () => {
    const result = pathSchema.parse({ from: 'a', to: 'b', dir: 'in' });
    expect(result.dir).toBe('in');
  });

  it('rejects invalid --dir', () => {
    expect(() => pathSchema.parse({ from: 'a', to: 'b', dir: 'up' })).toThrow();
  });

  it('coerces --max-depth to number', () => {
    const result = pathSchema.parse({ from: 'a', to: 'b', 'max-depth': '5' });
    expect(result.maxDepth).toBe(5);
  });

  it('transforms single label to array', () => {
    const result = pathSchema.parse({ from: 'a', to: 'b', label: 'manages' });
    expect(result.labels).toEqual(['manages']);
  });

  it('transforms multiple labels to array', () => {
    const result = pathSchema.parse({ from: 'a', to: 'b', label: ['manages', 'owns'] });
    expect(result.labels).toEqual(['manages', 'owns']);
  });

  it('rejects negative --max-depth', () => {
    expect(() => pathSchema.parse({ from: 'a', to: 'b', 'max-depth': '-1' })).toThrow();
  });
});

describe('querySchema', () => {
  it('transforms to expected shape', () => {
    const result = querySchema.parse({});
    expect(result.match).toBeNull();
    expect(result.whereProp).toEqual([]);
    expect(result.select).toBeUndefined();
  });

  it('passes through --match', () => {
    const result = querySchema.parse({ match: 'user:*' });
    expect(result.match).toBe('user:*');
  });

  it('transforms --where-prop string to array', () => {
    const result = querySchema.parse({ 'where-prop': 'role=admin' });
    expect(result.whereProp).toEqual(['role=admin']);
  });

  it('transforms --where-prop array', () => {
    const result = querySchema.parse({ 'where-prop': ['role=admin', 'active=true'] });
    expect(result.whereProp).toEqual(['role=admin', 'active=true']);
  });
});

describe('viewSchema', () => {
  it('defaults both to false', () => {
    const result = viewSchema.parse({});
    expect(result.list).toBe(false);
    expect(result.log).toBe(false);
  });

  it('accepts --log', () => {
    const result = viewSchema.parse({ log: true });
    expect(result.log).toBe(true);
  });
});

describe('serveSchema', () => {
  it('defaults port to 3000, host to 127.0.0.1, expose to false', () => {
    const result = serveSchema.parse({});
    expect(result.port).toBe(3000);
    expect(result.host).toBe('127.0.0.1');
    expect(result.expose).toBe(false);
    expect(result.writerId).toBeUndefined();
  });

  it('accepts --writer-id with valid characters', () => {
    const result = serveSchema.parse({ 'writer-id': 'my-serve-instance' });
    expect(result.writerId).toBe('my-serve-instance');
  });

  it('accepts --writer-id with dots and underscores', () => {
    const result = serveSchema.parse({ 'writer-id': 'serve.test_01' });
    expect(result.writerId).toBe('serve.test_01');
  });

  it('rejects --writer-id with invalid characters', () => {
    expect(() => serveSchema.parse({ 'writer-id': 'has spaces' })).toThrow(/writer-id/);
  });

  it('rejects --writer-id with slashes', () => {
    expect(() => serveSchema.parse({ 'writer-id': 'a/b' })).toThrow(/writer-id/);
  });

  it('rejects --writer-id with colons', () => {
    expect(() => serveSchema.parse({ 'writer-id': 'serve:3000' })).toThrow(/writer-id/);
  });

  it('rejects empty --writer-id', () => {
    expect(() => serveSchema.parse({ 'writer-id': '' })).toThrow();
  });

  it('accepts --port and --host overrides', () => {
    const result = serveSchema.parse({ port: '8080', host: '0.0.0.0' });
    expect(result.port).toBe(8080);
    expect(result.host).toBe('0.0.0.0');
  });

  it('rejects unknown keys', () => {
    expect(() => serveSchema.parse({ unknown: true })).toThrow(/unknown/i);
  });
});

describe('seekSchema', () => {
  it('defaults to status action', () => {
    const result = seekSchema.parse({});
    expect(result.action).toBe('status');
    expect(result.tickValue).toBeNull();
    expect(result.name).toBeNull();
    expect(result.diff).toBe(false);
    expect(result.diffLimit).toBe(2000);
  });

  it('parses --tick', () => {
    const result = seekSchema.parse({ tick: '5' });
    expect(result.action).toBe('tick');
    expect(result.tickValue).toBe('5');
  });

  it('parses --latest', () => {
    const result = seekSchema.parse({ latest: true });
    expect(result.action).toBe('latest');
  });

  it('parses --save', () => {
    const result = seekSchema.parse({ save: 'checkpoint1' });
    expect(result.action).toBe('save');
    expect(result.name).toBe('checkpoint1');
  });

  it('parses --load', () => {
    const result = seekSchema.parse({ load: 'checkpoint1' });
    expect(result.action).toBe('load');
    expect(result.name).toBe('checkpoint1');
  });

  it('parses --list', () => {
    const result = seekSchema.parse({ list: true });
    expect(result.action).toBe('list');
  });

  it('parses --drop', () => {
    const result = seekSchema.parse({ drop: 'old' });
    expect(result.action).toBe('drop');
    expect(result.name).toBe('old');
  });

  it('parses --clear-cache', () => {
    const result = seekSchema.parse({ 'clear-cache': true });
    expect(result.action).toBe('clear-cache');
  });

  it('parses --diff with --tick', () => {
    const result = seekSchema.parse({ tick: '3', diff: true });
    expect(result.action).toBe('tick');
    expect(result.diff).toBe(true);
  });

  it('parses --diff-limit', () => {
    const result = seekSchema.parse({ tick: '3', diff: true, 'diff-limit': '100' });
    expect(result.diffLimit).toBe(100);
  });

  it('parses --no-persistent-cache', () => {
    const result = seekSchema.parse({ 'no-persistent-cache': true });
    expect(result.noPersistentCache).toBe(true);
  });

  it('rejects multiple action flags', () => {
    expect(() => seekSchema.parse({ tick: '5', latest: true })).toThrow(/one seek action/i);
  });

  it('rejects --diff with incompatible action', () => {
    expect(() => seekSchema.parse({ list: true, diff: true })).toThrow(/--diff/);
  });

  it('rejects --diff alone (bare status)', () => {
    expect(() => seekSchema.parse({ diff: true })).toThrow(/--diff/);
  });

  it('rejects empty-string --save', () => {
    expect(() => seekSchema.parse({ save: '' })).toThrow(/missing value/i);
  });

  it('rejects empty-string --load', () => {
    expect(() => seekSchema.parse({ load: '' })).toThrow(/missing value/i);
  });

  it('rejects empty-string --drop', () => {
    expect(() => seekSchema.parse({ drop: '' })).toThrow(/missing value/i);
  });

  it('rejects --diff-limit=0', () => {
    expect(() => seekSchema.parse({ tick: '1', diff: true, 'diff-limit': '0' })).toThrow(/positive integer/i);
  });

  it('rejects --diff-limit=-1', () => {
    expect(() => seekSchema.parse({ tick: '1', diff: true, 'diff-limit': '-1' })).toThrow(/positive integer/i);
  });

  it('rejects --diff-limit=1.5', () => {
    expect(() => seekSchema.parse({ tick: '1', diff: true, 'diff-limit': '1.5' })).toThrow(/positive integer/i);
  });

  it('rejects --diff with --save (cannot be used)', () => {
    expect(() => seekSchema.parse({ save: 'snap1', diff: true })).toThrow(/cannot be used/i);
  });

  it('rejects --diff bare status (cannot be used)', () => {
    expect(() => seekSchema.parse({ diff: true })).toThrow(/cannot be used/i);
  });

  it('rejects --diff-limit without --diff', () => {
    expect(() => seekSchema.parse({ tick: '1', 'diff-limit': '10' })).toThrow(/requires --diff/i);
  });
});
