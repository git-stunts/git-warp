import { describe, expect, it } from 'vitest';
import InMemoryGraphAdapter from '../../../../src/infrastructure/adapters/InMemoryGraphAdapter.ts';

const PROTOTYPE_PATHS = ['__proto__', 'constructor'] as const;

describe('InMemoryGraphAdapter path-keyed tree reads', () => {
  it('returns prototype-like Git paths as data without mutating object prototypes', async () => {
    const adapter = new InMemoryGraphAdapter();
    const payload = new Uint8Array([1, 2, 3]);
    const oid = await adapter.writeBlob(payload);
    const treeOid = await adapter.writeTree(
      PROTOTYPE_PATHS.map((path) => `100644 blob ${oid}\t${path}`),
    );

    const oids = await adapter.readTreeOids(treeOid);
    const files = await adapter.readTree(treeOid);

    for (const path of PROTOTYPE_PATHS) {
      expect(Object.hasOwn(oids, path)).toBe(true);
      expect(Object.hasOwn(files, path)).toBe(true);
      expect(oids[path]).toBe(oid);
      expect(files[path]).toEqual(payload);
    }
    expect(Object.prototype).not.toHaveProperty('polluted');
  });
});
