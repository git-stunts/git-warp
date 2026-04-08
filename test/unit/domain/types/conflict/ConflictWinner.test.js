import { describe, it, expect } from 'vitest';
import ConflictAnchor from '../../../../../src/domain/types/conflict/ConflictAnchor.js';
import ConflictWinner from '../../../../../src/domain/types/conflict/ConflictWinner.js';

describe('ConflictWinner', () => {
  const anchor = new ConflictAnchor({ patchSha: 'abcd', writerId: 'w1', lamport: 1, opIndex: 0 });

  it('creates a frozen winner', () => {
    const w = new ConflictWinner({ anchor, effectDigest: 'digest123' });
    expect(w.anchor).toBe(anchor);
    expect(w.effectDigest).toBe('digest123');
    expect(Object.isFrozen(w)).toBe(true);
  });

  it('rejects non-ConflictAnchor anchor', () => {
    expect(() => new ConflictWinner({ anchor: { patchSha: 'x', writerId: 'y', lamport: 1, opIndex: 0 }, effectDigest: 'd' }))
      .toThrow('anchor must be a ConflictAnchor instance');
  });

  it('rejects empty effectDigest', () => {
    expect(() => new ConflictWinner({ anchor, effectDigest: '' })).toThrow('effectDigest');
  });

  it('round-trips through JSON', () => {
    const w = new ConflictWinner({ anchor, effectDigest: 'abc' });
    const json = JSON.parse(JSON.stringify(w));
    expect(json.anchor.patchSha).toBe('abcd');
    expect(json.effectDigest).toBe('abc');
  });
});
