import { expect, it } from 'vitest';
import GitCasGraphReaderAdapter from '../../../../src/infrastructure/adapters/GitCasGraphReaderAdapter.ts';

function reader(source, assertEmptyBlobExists = async () => {}) {
  return new GitCasGraphReaderAdapter({
    persistence: { readBlobStream: async () => source },
    assertEmptyBlobExists,
    treeOidReader: { readTreeOids: async () => ({}) },
  });
}

it('refuses an oversized graph blob and closes its producer', async () => {
  let closed = false;
  async function* source() {
    try { yield new Uint8Array(64 * 1024 * 1024 + 1); }
    finally { closed = true; }
  }
  let refusal;
  try { await reader(source()).readBlob('blob'); } catch (error) { refusal = error; }
  expect(refusal).toMatchObject({ code: 'E_BYTE_COLLECTION_LIMIT' });
  expect(closed).toBe(true);
});

it('snapshots graph blob chunks before a producer reuses the buffer', async () => {
  async function* source() {
    const bytes = new Uint8Array([1, 2]);
    yield bytes;
    bytes.set([3, 4]);
    yield bytes;
  }
  expect(await reader(source()).readBlob('blob')).toEqual(new Uint8Array([1, 2, 3, 4]));
});

it('preserves the existence check for an empty blob', async () => {
  const failure = new Error('missing blob');
  async function* source() { yield new Uint8Array(); }
  await expect(reader(source(), async () => { throw failure; }).readBlob('missing')).rejects.toBe(failure);
});
