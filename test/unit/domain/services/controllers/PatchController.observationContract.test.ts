import { expect, it } from 'vitest';
import { openRuntimeHost } from '../../../../../src/domain/RuntimeHost.ts';
import PatchController from '../../../../../src/domain/services/controllers/PatchController.ts';
import WarpState from '../../../../../src/domain/services/state/WarpState.ts';
import { readPatchBuilderCausalBasis } from '../../../../../src/domain/services/admission/PatchBuilderCausalBasis.ts';
import { EventId } from '../../../../../src/domain/utils/EventId.ts';
import { encodeEdgePropKey, encodePropKey } from '../../../../../src/domain/services/KeyCodec.ts';
import nullLogger from '../../../../../src/domain/utils/nullLogger.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import { CborCodec } from '../../../../../src/infrastructure/codecs/CborCodec.ts';
import InMemoryGraphAdapter from '../../../../helpers/InMemoryGraphAdapter.ts';
import MemoryRuntimeStorageAdapter from '../../../../helpers/MemoryRuntimeStorageAdapter.ts';
import HistoryOnlyKernel from '../../../../helpers/HistoryOnlyKernel.ts';
import ReadOnlyConfigurationKernel from '../../../../helpers/ReadOnlyConfigurationKernel.ts';

async function fixture() {
  const history = new InMemoryGraphAdapter();
  const host = await openRuntimeHost({
    persistence: history, runtimeStorage: new MemoryRuntimeStorageAdapter({ history }),
    graphName: 'events', writerId: 'alice', checkpointPolicy: null,
    codec: new CborCodec(), commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC, logger: nullLogger,
  });
  return { history, host, controller: new PatchController(host) };
}

it('pairs materialized membership with its retained frontier when creating a builder', async () => {
  const { host, controller } = await fixture();
  try {
    const sha = await controller.patch(patch => { patch.addNode('n'); });
    await host.materialize();
    const builder = await controller.createPatch();
    expect(readPatchBuilderCausalBasis(builder).evaluationCoordinateRef).toContain(sha);
    await builder.prepareWriteBasis(['n']);
    builder.removeNode('n');
    expect(builder.build().observedFrontier?.frontier()).toEqual(new Map([['alice', sha]]));
    expect(await controller._loadPatchChainFromSha(sha)).toHaveLength(1);
  } finally { await host.close(); }
});

it('persists and reuses a resolved writer through the actual configuration capability', async () => {
  const { history, host, controller } = await fixture();
  try {
    const first = await controller.writer();
    const second = await controller.writer();
    expect(first.writerId).toBe(second.writerId);
    expect(await history.configGet('warp.writerId.events')).toBe(first.writerId);
  } finally { await host.close(); }
});

it('requires journal capability for writer creation and retained patch reads', async () => {
  const { history, host, controller } = await fixture();
  const journal = host._patchJournal;
  try {
    const sha = await controller.patch(patch => { patch.addNode('n'); });
    const message = DEFAULT_COMMIT_MESSAGE_CODEC.decodePatch(await history.showNode(sha));
    // @ts-expect-error Deliberate JavaScript capability loss; restore before closing.
    host._patchJournal = null;
    await expect(controller.writer('explicit')).rejects.toMatchObject({ code: 'E_MISSING_JOURNAL' });
    await expect(controller._readPatch(message)).rejects.toMatchObject({ code: 'E_MISSING_JOURNAL' });
  } finally { host._patchJournal = journal; await host.close(); }
});

it('counts changed edge properties while an unchanged join remains silent', async () => {
  const { host, controller } = await fixture();
  try {
    host._cachedState = WarpState.empty();
    const other = WarpState.empty();
    other.mutatePropLWW(encodeEdgePropKey('a', 'b', 'link', 'k'), new EventId(1, 'remote', 'a'.repeat(40), 0), 'value');
    other.mutatePropLWW(encodePropKey('a', 'k'), new EventId(1, 'remote', 'a'.repeat(40), 1), 'node-value');
    expect(controller.join(other).receipt.propsChanged).toBe(2);
    expect(controller.join(other).receipt.propsChanged).toBe(0);
  } finally { await host.close(); }
});

it('refuses absent membership from a fresh uncached frontier without materializing', async () => {
  const { host, controller } = await fixture();
  try {
    const builder = await controller.createPatch();
    await builder.prepareWriteBasis(['missing']);
    expect(() => builder.removeNode('missing')).toThrow(expect.objectContaining({ code: 'E_PATCH_ENTITY_NOT_FOUND' }));
    expect(host._cachedState).toBeNull();
  } finally { await host.close(); }
});

it('allows explicit writers without configuration but validates config before fallback use', async () => {
  const { history, host, controller } = await fixture();
  try {
    host._persistence = new HistoryOnlyKernel(history);
    expect((await controller.writer('explicit')).writerId).toBe('explicit');
    await expect(controller.writer()).rejects.toMatchObject({
      code: 'CONFIG_READ_FAILED', cause: { code: 'E_MISSING_CONFIG' },
    });
  } finally { await host.close(); }
});

it('reads an existing configured identity without requiring an unused setter', async () => {
  const { history, host, controller } = await fixture();
  try {
    await history.configSet('warp.writerId.events', 'persisted');
    host._persistence = new ReadOnlyConfigurationKernel(history);
    expect((await controller.writer()).writerId).toBe('persisted');
  } finally { await host.close(); }
});

it('refuses identity persistence when the configuration extension is read-only', async () => {
  const { history, host, controller } = await fixture();
  try {
    host._persistence = new ReadOnlyConfigurationKernel(history);
    await expect(controller.writer()).rejects.toMatchObject({
      code: 'CONFIG_WRITE_FAILED', cause: { code: 'E_MISSING_CONFIG' },
    });
    expect(await history.configGet('warp.writerId.events')).toBeNull();
  } finally { await host.close(); }
});

it.each(['configGet', 'configSet'])('validates a present but non-callable %s capability', async method => {
  const { history, host, controller } = await fixture();
  const original = Object.getOwnPropertyDescriptor(history, method);
  try {
    Object.defineProperty(history, method, { value: null, configurable: true });
    await expect(controller.writer()).rejects.toMatchObject({
      code: method === 'configGet' ? 'CONFIG_READ_FAILED' : 'CONFIG_WRITE_FAILED',
      cause: { code: 'E_MISSING_CONFIG' },
    });
  } finally {
    if (original === undefined) { Reflect.deleteProperty(history, method); }
    else { Object.defineProperty(history, method, original); }
    await host.close();
  }
});
