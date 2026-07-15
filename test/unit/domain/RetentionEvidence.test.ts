import { describe, expect, it } from 'vitest';

import RetentionEvidence from '../../../src/domain/api/RetentionEvidence.ts';

describe('RetentionEvidence', () => {
  it('establishes and freezes the public retention projection', () => {
    const evidence = new RetentionEvidence({
      witness: { id: 'evidence:retention:1' },
      policy: 'pinned',
      reachability: 'anchored',
      rootKind: 'publication',
    });

    expect(evidence).toBeInstanceOf(RetentionEvidence);
    expect(evidence).toEqual({
      witness: { id: 'evidence:retention:1' },
      policy: 'pinned',
      reachability: 'anchored',
      rootKind: 'publication',
    });
    expect(Object.isFrozen(evidence)).toBe(true);
    expect(Object.isFrozen(evidence.witness)).toBe(true);
  });

  it.each([
    ['evictable', 'orphaned', 'root-set'],
    ['evictable', 'volatile', 'cache-set'],
    ['pinned', 'anchored', 'expiring-set'],
  ])('accepts canonical policy %s, reachability %s, and root %s', (policy, reachability, rootKind) => {
    expect(Reflect.construct(RetentionEvidence, [{
      witness: { id: 'evidence:retention:variant' },
      policy,
      reachability,
      rootKind,
    }])).toBeInstanceOf(RetentionEvidence);
  });

  it.each([
    [null, 'options'],
    [[], 'options'],
    [1, 'options'],
    [{ witness: null, policy: 'pinned', reachability: 'anchored', rootKind: 'publication' }, 'witness'],
    [{ witness: 1, policy: 'pinned', reachability: 'anchored', rootKind: 'publication' }, 'witness'],
    [{ witness: { id: '' }, policy: 'pinned', reachability: 'anchored', rootKind: 'publication' }, 'witness.id'],
    [{ witness: { id: 'w' }, policy: 'forever', reachability: 'anchored', rootKind: 'publication' }, 'policy'],
    [{ witness: { id: 'w' }, policy: 'pinned', reachability: 'reachable', rootKind: 'publication' }, 'reachability'],
    [{ witness: { id: 'w' }, policy: 'pinned', reachability: 'anchored', rootKind: 'branch' }, 'rootKind'],
  ])('rejects invalid runtime input for %s', (options, field) => {
    expect(() => Reflect.construct(RetentionEvidence, [options])).toThrow(
      expect.objectContaining({ code: 'E_RECEIPT_EVIDENCE', message: expect.stringContaining(field) }),
    );
  });
});
