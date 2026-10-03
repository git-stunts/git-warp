import { afterEach, describe, expect, it, vi } from 'vitest';

const FIRST_OID = '1'.repeat(40);
const SECOND_OID = '2'.repeat(40);

function provideHash(oid: string): void {
  vi.doMock('node:crypto', () => ({
    createHash: () => ({ update: () => ({ digest: () => oid }) }),
  }));
}

function denyCrypto(): void {
  vi.doMock('node:crypto', () => { throw new Error('controlled missing crypto'); });
}

async function adapterConstructor() {
  return (await import('../../../helpers/InMemoryGraphAdapter.ts')).default;
}

afterEach(() => {
  vi.doUnmock('node:crypto');
  vi.resetModules();
});

describe('InMemoryGraphAdapter instance-owned hashing', () => {
  it('captures each successful capability without replacing an existing instance capability', async () => {
    const Adapter = await adapterConstructor();
    provideHash(FIRST_OID);
    const first = new Adapter();
    expect(await first.writeBlob('first')).toBe(FIRST_OID);
    provideHash(SECOND_OID);
    const second = new Adapter();
    expect(await second.writeBlob('second')).toBe(SECOND_OID);
    expect(await first.writeBlob('first again')).toBe(FIRST_OID);
  });

  it('does not inherit an earlier instance capability when its own probe fails', async () => {
    const Adapter = await adapterConstructor();
    provideHash(FIRST_OID);
    const first = new Adapter();
    expect(await first.writeBlob('first')).toBe(FIRST_OID);
    denyCrypto();
    const unavailable = new Adapter();
    await expect(unavailable.writeBlob('unavailable')).rejects.toMatchObject({ code: 'E_NO_HASH' });
    expect(await first.writeBlob('still available')).toBe(FIRST_OID);
  });

  it('does not revive a failed instance when a later instance obtains hashing', async () => {
    const Adapter = await adapterConstructor();
    denyCrypto();
    const unavailable = new Adapter();
    await expect(unavailable.writeBlob('unavailable')).rejects.toMatchObject({ code: 'E_NO_HASH' });
    provideHash(SECOND_OID);
    const available = new Adapter();
    expect(await available.writeBlob('available')).toBe(SECOND_OID);
    await expect(unavailable.writeBlob('still unavailable')).rejects.toMatchObject({ code: 'E_NO_HASH' });
  });

  it('keeps explicitly injected hash functions independent of ambient crypto', async () => {
    const Adapter = await adapterConstructor();
    denyCrypto();
    const first = new Adapter({ hash: () => FIRST_OID });
    const second = new Adapter({ hash: () => SECOND_OID });
    expect(await first.writeBlob('first')).toBe(FIRST_OID);
    expect(await second.writeBlob('second')).toBe(SECOND_OID);
  });

  it('refuses an explicitly invalid hash capability without probing ambient crypto', async () => {
    const Adapter = await adapterConstructor();
    // @ts-expect-error Exercise the JavaScript options boundary.
    const adapter = new Adapter({ hash: 42 });
    await expect(adapter.writeBlob('invalid')).rejects.toMatchObject({ code: 'E_NO_HASH' });
  });

  it('refuses an ambient module without a callable hash capability', async () => {
    const Adapter = await adapterConstructor();
    vi.doMock('node:crypto', () => ({ createHash: 42 }));
    await expect(new Adapter().writeBlob('invalid')).rejects.toMatchObject({ code: 'E_NO_HASH' });
  });

  it('retains Git blob identity while keeping object stores independent', async () => {
    const Adapter = await adapterConstructor();
    const first = new Adapter();
    const second = new Adapter();
    const oid = await first.writeBlob('hello\n');
    expect(oid).toBe('ce013625030ba8dba906f756967f9e9ca394464a');
    await expect(second.readBlob(oid)).rejects.toMatchObject({ code: 'E_MISSING_OBJECT' });
    expect(await second.writeBlob('hello\n')).toBe(oid);
    expect(await first.readBlob(oid)).toEqual(new TextEncoder().encode('hello\n'));
  });
});
