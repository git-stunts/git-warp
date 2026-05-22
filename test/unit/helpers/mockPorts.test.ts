import { describe, expect, it } from 'vitest';

import { createMockPersistence } from '../../helpers/mockPorts.ts';

describe('mockPorts createMockPersistence', () => {
  it('rejects compareAndSwapRef when expected oid does not match current ref', async () => {
    const persistence = createMockPersistence();
    const ref = 'refs/warp/test/writers/alice';
    const currentOid = 'a'.repeat(40);
    const nextOid = 'b'.repeat(40);

    await persistence.updateRef(ref, currentOid);

    await expect(persistence.compareAndSwapRef(ref, nextOid, null)).rejects.toThrow('CAS mismatch');
    await expect(persistence.readRef(ref)).resolves.toBe(currentOid);
  });
});
