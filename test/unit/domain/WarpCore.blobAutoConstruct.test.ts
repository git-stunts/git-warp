import { describe, expect, it } from 'vitest';
import { openRuntimeHostProduct } from '../../../src/domain/warp/RuntimeHostProduct.ts';
import defaultCodec from '../../../src/infrastructure/codecs/CborCodec.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import { openMemoryRuntimeHostProduct } from '../../helpers/MemoryRuntimeHost.ts';
import InMemoryGraphAdapter from '../../helpers/InMemoryGraphAdapter.ts';
import MemoryRuntimeStorageAdapter from '../../helpers/MemoryRuntimeStorageAdapter.ts';

describe('runtime storage composition', () => {
  it('obtains semantic content storage from the repository provider', async () => {
    const history = new InMemoryGraphAdapter();
    const runtimeStorage = new MemoryRuntimeStorageAdapter({ history });
    const services = await runtimeStorage.createRuntimeStorageServices({
      timelineName: 'events',
      codec: defaultCodec,
      commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
    });

    const runtime = await openMemoryRuntimeHostProduct({
      persistence: history,
      runtimeStorage,
      graphName: 'events',
      writerId: 'writer-1',
    });

    expect(runtime._assetStorage).toBe(services.content);
    expect(runtime._checkpointStore).toBeInstanceOf(services.checkpoints.constructor);
    expect(runtime._indexStore).toBeInstanceOf(services.indexes.constructor);
  });

  it('round-trips attached content through semantic asset storage', async () => {
    const history = new InMemoryGraphAdapter();
    const runtime = await openMemoryRuntimeHostProduct({
      persistence: history,
      graphName: 'attachments',
      writerId: 'writer-1',
    });

    await runtime.patch(async (patch) => {
      patch.addNode('doc:readme');
      await patch.attachContent('doc:readme', 'hello', { mime: 'text/plain' });
    });
    await runtime.materialize();

    const content = await runtime.getContent('doc:readme');
    expect(new TextDecoder().decode(content ?? new Uint8Array())).toBe('hello');
    expect(await runtime.getContentHandle('doc:readme')).toMatch(/^git-cas:/u);
  });

  it('rejects production runtime opens without an explicit storage provider', async () => {
    await expect(openRuntimeHostProduct({
      persistence: new InMemoryGraphAdapter(),
      graphName: 'missing-storage',
      writerId: 'writer-1',
    })).rejects.toMatchObject({ code: 'E_RUNTIME_STORAGE_REQUIRED' });
  });
});
