import { describe, expect, it } from 'vitest';
import EncryptionError from '../../../src/domain/errors/EncryptionError.ts';
import { openMemoryRuntimeHostProduct } from '../../helpers/MemoryRuntimeHost.ts';
import MemoryRuntimeStorageAdapter from '../../helpers/MemoryRuntimeStorageAdapter.ts';
import { createInMemoryRepo } from '../../helpers/warpGraphTestUtils.ts';

describe('git-cas patch encryption composition', () => {
  it('records encrypted git-cas storage metadata and round-trips the patch', async () => {
    const repo = createInMemoryRepo();
    const runtimeStorage = new MemoryRuntimeStorageAdapter({
      history: repo.persistence,
      encrypted: true,
    });
    const runtime = await openMemoryRuntimeHostProduct({
      persistence: repo.persistence,
      runtimeStorage,
      graphName: 'encrypted-events',
      writerId: 'writer-1',
    });

    const sha = await runtime.patch((patch) => {
      patch.addNode('user:alice');
      patch.setProperty('user:alice', 'role', 'admin');
    });
    const message = runtime._commitMessageCodec.decodePatch(
      await repo.persistence.showNode(sha),
    );

    expect(message.storage).toMatchObject({
      strategy: 'git-cas-asset',
      encrypted: true,
    });
    const plaintextPatch = runtime._codec.encode(await runtime.loadPatchBySha(sha));
    const storedPatch = await runtimeStorage.backing.retrieve(message.patchHandle.toString());
    expect(storedPatch).not.toEqual(plaintextPatch);
    await runtime.materialize();
    await expect(runtime.hasNode('user:alice')).resolves.toBe(true);
    await expect(runtime.getNodeProps('user:alice')).resolves.toMatchObject({ role: 'admin' });
  });

  it('rejects encrypted patch history opened with a different key', async () => {
    const repo = createInMemoryRepo();
    const writerStorage = new MemoryRuntimeStorageAdapter({
      history: repo.persistence,
      encryptionKey: new Uint8Array(32).fill(0x11),
    });
    const writer = await openMemoryRuntimeHostProduct({
      persistence: repo.persistence,
      runtimeStorage: writerStorage,
      graphName: 'encrypted-wrong-key',
      writerId: 'writer-1',
    });
    await writer.patch((patch) => {
      patch.addNode('private:node');
    });
    const readerStorage = new MemoryRuntimeStorageAdapter({
      history: repo.persistence,
      encryptionKey: new Uint8Array(32).fill(0x22),
      backing: writerStorage.backing,
    });
    const reader = await openMemoryRuntimeHostProduct({
      persistence: repo.persistence,
      runtimeStorage: readerStorage,
      graphName: 'encrypted-wrong-key',
      writerId: 'reader',
    });

    await expect(reader.materialize()).rejects.toMatchObject({
      name: 'EncryptionError',
      code: 'E_CAS_CONTENT_DECRYPTION_FAILED',
    });
  });

  it('rejects corrupted encrypted patch bytes', async () => {
    const repo = createInMemoryRepo();
    const writerStorage = new MemoryRuntimeStorageAdapter({
      history: repo.persistence,
      encrypted: true,
    });
    const writer = await openMemoryRuntimeHostProduct({
      persistence: repo.persistence,
      runtimeStorage: writerStorage,
      graphName: 'encrypted-corrupt',
      writerId: 'writer-1',
    });
    const sha = await writer.patch((patch) => {
      patch.addNode('private:node');
    });
    const message = writer._commitMessageCodec.decodePatch(
      await repo.persistence.showNode(sha),
    );
    const stored = await writerStorage.backing.retrieve(message.patchHandle.toString());
    const corrupted = stored.slice();
    const lastIndex = corrupted.length - 1;
    corrupted[lastIndex] = (corrupted[lastIndex] ?? 0) ^ 0xff;
    writerStorage.backing.replace(message.patchHandle, corrupted);
    const readerStorage = new MemoryRuntimeStorageAdapter({
      history: repo.persistence,
      encrypted: true,
      backing: writerStorage.backing,
    });
    const reader = await openMemoryRuntimeHostProduct({
      persistence: repo.persistence,
      runtimeStorage: readerStorage,
      graphName: 'encrypted-corrupt',
      writerId: 'reader',
    });

    await expect(reader.materialize()).rejects.toMatchObject({
      name: 'EncryptionError',
      code: 'E_CAS_CONTENT_DECRYPTION_FAILED',
    });
  });

  it('reopens encrypted patch history through the same repository storage provider', async () => {
    const repo = createInMemoryRepo();
    const runtimeStorage = new MemoryRuntimeStorageAdapter({
      history: repo.persistence,
      encrypted: true,
    });
    const writer = await openMemoryRuntimeHostProduct({
      persistence: repo.persistence,
      runtimeStorage,
      graphName: 'encrypted-reopen',
      writerId: 'writer-1',
    });
    await writer.patch((patch) => {
      patch.addNode('user:bob');
      patch.setProperty('user:bob', 'status', 'active');
    });

    const reader = await openMemoryRuntimeHostProduct({
      persistence: repo.persistence,
      runtimeStorage,
      graphName: 'encrypted-reopen',
      writerId: 'reader',
    });
    await reader.materialize();

    await expect(reader.hasNode('user:bob')).resolves.toBe(true);
    await expect(reader.getNodeProps('user:bob')).resolves.toMatchObject({ status: 'active' });
  });

  it('keeps provenance reads on the semantic patch journal', async () => {
    const repo = createInMemoryRepo();
    const runtimeStorage = new MemoryRuntimeStorageAdapter({
      history: repo.persistence,
      encrypted: true,
    });
    const runtime = await openMemoryRuntimeHostProduct({
      persistence: repo.persistence,
      runtimeStorage,
      graphName: 'encrypted-provenance',
      writerId: 'writer-1',
    });
    await runtime.patch((patch) => {
      patch.addNode('doc:1');
    });
    await runtime.patch((patch) => {
      patch.setProperty('doc:1', 'version', 2);
    });
    await runtime.materialize();

    const shas = await runtime.patchesFor('doc:1');
    expect(shas).toHaveLength(2);
    await expect(runtime.loadPatchBySha(shas[0] ?? '')).resolves.toMatchObject({
      writer: 'writer-1',
    });
  });

  it('retains the public encryption error contract', () => {
    const error = new EncryptionError('asset decryption failed');
    expect(error).toMatchObject({
      name: 'EncryptionError',
      code: 'E_ENCRYPTED_PATCH',
    });
  });
});
