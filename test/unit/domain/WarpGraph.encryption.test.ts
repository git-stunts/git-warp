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
    await runtime.materialize();
    await expect(runtime.hasNode('user:alice')).resolves.toBe(true);
    await expect(runtime.getNodeProps('user:alice')).resolves.toMatchObject({ role: 'admin' });
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
