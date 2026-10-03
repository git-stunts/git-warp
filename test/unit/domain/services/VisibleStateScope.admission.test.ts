import { expect, it } from 'vitest';
import { normalizeVisibleStateScope, nodeIdInVisibleStateScope, scopePatchEntries } from '../../../../src/domain/services/VisibleStateScope.ts';

it('treats omitted and null prefix rules as unrestricted', () => {
  expect(normalizeVisibleStateScope({})).toBeNull();
  expect(normalizeVisibleStateScope({ nodeIdPrefixes: null })).toBeNull();
  expect(Reflect.apply(nodeIdInVisibleStateScope, undefined, ['n', { nodeIdPrefixes: { exclude: [] } }])).toBe(true);
});

it('keeps unscopable operations conservatively and excludes malformed patch containers', () => {
  const scope = { nodeIdPrefixes: { include: ['n'], exclude: [] } };
  for (const op of [null, undefined, 7]) {
    const entry = { patch: { ops: [op] }, sha: 'aaaa' };
    expect(Reflect.apply(scopePatchEntries, undefined, [[entry], scope])).toEqual([entry]);
  }
  const edge = { patch: { ops: [{ type: 'EdgeRemove', from: 'n', to: 'n' }] }, sha: 'aaaa' };
  expect(Reflect.apply(scopePatchEntries, undefined, [[edge], scope])).toEqual([edge]);
  expect(Reflect.apply(scopePatchEntries, undefined, [[{ patch: { ops: null }, sha: 'aaaa' }], scope])).toEqual([]);
});
