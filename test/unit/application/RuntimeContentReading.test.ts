import { expect, it, vi } from 'vitest';
import RuntimeActivity from '../../../src/application/RuntimeActivity.ts';
import { createContentReadingValue } from '../../../src/application/RuntimeContentReading.ts';
import ContentAttachmentPayload from '../../../src/domain/graph/ContentAttachmentPayload.ts';
import ContentAttachmentHandle from '../../../src/domain/graph/ContentAttachmentHandle.ts';
import ContentAttachmentMime from '../../../src/domain/graph/ContentAttachmentMime.ts';
import ContentAttachmentSize from '../../../src/domain/graph/ContentAttachmentSize.ts';
import ContentOwner from '../../../src/domain/api/ContentOwner.ts';
import type AssetStoragePort from '../../../src/ports/AssetStoragePort.ts';

function fixture(open: AssetStoragePort['open']) {
  const activity = new RuntimeActivity();
  const storage: AssetStoragePort = { open, stage: vi.fn() };
  const content = createContentReadingValue({
    activity, storage, owner: new ContentOwner({ kind: 'node', subject: 'n' }),
    payload: new ContentAttachmentPayload({ handle: new ContentAttachmentHandle('content:one'),
      mime: new ContentAttachmentMime('text/plain'), size: new ContentAttachmentSize(2) }),
  });
  return { activity, content };
}

it('waits for active consumption, forwards return to the producer, and releases the Runtime lease', async () => {
  const finalized = vi.fn();
  const release = vi.fn(async () => undefined);
  const { content, activity } = fixture(async function* () {
    try { yield new Uint8Array([1]); yield new Uint8Array([2]); }
    finally { finalized(); }
  });
  const iterator = content.open()[Symbol.asyncIterator]();
  expect((await iterator.next()).done).toBe(false);
  const closing = activity.close(release);
  await Promise.resolve();
  expect(release).not.toHaveBeenCalled();
  await iterator.return?.();
  await closing;
  expect(finalized).toHaveBeenCalledOnce();
  expect(release).toHaveBeenCalledOnce();
});

it('releases the lease after a storage error without replacing that error', async () => {
  const failure = new Error('storage interrupted');
  const { content, activity } = fixture(async function* () { yield new Uint8Array([1]); throw failure; });
  const iterator = content.open()[Symbol.asyncIterator]();
  await iterator.next();
  await expect(iterator.next()).rejects.toBe(failure);
  const release = vi.fn(async () => undefined);
  await activity.close(release);
  expect(release).toHaveBeenCalledOnce();
});
