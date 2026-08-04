import { describe, expect, it } from 'vitest';

import { freezeEvidence } from '../../../src/domain/api/EvidenceRuntime.ts';
import RetentionEvidence from '../../../src/domain/api/RetentionEvidence.ts';
import Tick from '../../../src/domain/api/Tick.ts';

describe('freezeEvidence', () => {
  it('canonicalizes raw evidence once and reuses the canonical identity', () => {
    const raw = {
      basis: { id: 'evidence:basis' },
      support: [{ id: 'evidence:support' }],
    };

    const canonical = freezeEvidence(raw, 'test.evidence');

    expect(canonical).not.toBe(raw);
    expect(canonical).toEqual(raw);
    expect(Object.isFrozen(canonical)).toBe(true);
    expect(Object.isFrozen(canonical.basis)).toBe(true);
    expect(Object.isFrozen(canonical.support)).toBe(true);
    expect(Object.isFrozen(canonical.support[0])).toBe(true);
    expect(freezeEvidence(canonical, 'test.evidence')).toBe(canonical);
  });

  it('recognizes canonical evidence without process-local membership', () => {
    const canonical = Object.freeze({
      basis: Object.freeze({ id: 'evidence:basis' }),
      support: Object.freeze([Object.freeze({ id: 'evidence:support' })]),
    });

    expect(freezeEvidence(canonical, 'test.evidence')).toBe(canonical);
  });

  it('retains a validated Tick while canonicalizing retention evidence', () => {
    const tick = new Tick({ id: 'tick:1', timeline: 'events' });
    const retention = new RetentionEvidence({
      witness: { id: 'evidence:retention' },
      policy: 'pinned',
      reachability: 'anchored',
      rootKind: 'publication',
    });

    const canonical = freezeEvidence(
      {
        basis: { id: 'evidence:basis' },
        support: [],
        retention: [retention],
        tick,
      },
      'test.evidence'
    );

    expect(canonical.tick).toBe(tick);
    expect(canonical.retention).toHaveLength(1);
    expect(canonical.retention?.[0]).not.toBe(retention);
    expect(canonical.retention?.[0]).toEqual(retention);
    expect(Object.isFrozen(canonical.retention)).toBe(true);
  });

  it('rejects malformed retention evidence before canonicalization', () => {
    expect(() =>
      freezeEvidence(
        {
          basis: { id: 'evidence:basis' },
          support: [],
          // @ts-expect-error Exercise the JavaScript boundary with a scalar.
          retention: 'persistent',
        },
        'test.evidence'
      )
    ).toThrowError(expect.objectContaining({ code: 'E_RECEIPT_EVIDENCE' }));
    expect(() =>
      freezeEvidence(
        {
          basis: { id: 'evidence:basis' },
          support: [],
          // @ts-expect-error Exercise the JavaScript boundary with null.
          retention: [null],
        },
        'test.evidence'
      )
    ).toThrowError(expect.objectContaining({ code: 'E_RECEIPT_EVIDENCE' }));
  });
});
