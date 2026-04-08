import { describe, it, expect } from 'vitest';
import RefPort from '../../../src/ports/RefPort.ts';

describe('RefPort', () => {
  it('abstract methods are not callable on base prototype', () => {
    expect(RefPort.prototype.updateRef).toBeUndefined();
    expect(RefPort.prototype.readRef).toBeUndefined();
    expect(RefPort.prototype.deleteRef).toBeUndefined();
    expect(RefPort.prototype.listRefs).toBeUndefined();
    expect(RefPort.prototype.compareAndSwapRef).toBeUndefined();
  });

  it('concrete subclass satisfies the contract', async () => {
    class TestRef extends RefPort {
      async updateRef() { /* no-op */ }
      async readRef() { return 'abc123'; }
      async deleteRef() { /* no-op */ }
      async listRefs() { return ['refs/heads/main']; }
      async compareAndSwapRef() { /* no-op */ }
    }
    const ref = new TestRef();
    expect(ref).toBeInstanceOf(RefPort);
    expect(await ref.readRef('refs/heads/main')).toBe('abc123');
  });
});
