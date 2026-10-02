import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Runtime } from '../../../index.ts';
import { intent } from '../../../advanced.ts';
import { createTestRepo } from '../api/helpers/setup.ts';

const CASES = [
  { name: 'unrelated keys', id: 'asset:metadata', size: -1, mime: 'hello', sizeKey: 'count', mimeKey: 'note', metadataOwner: 'n' },
  { name: 'negative size', id: 'asset:metadata', size: -1, mime: 'text/plain', sizeKey: '_content.size', mimeKey: '_content.mime', metadataOwner: 'n' },
  { name: 'unsafe size', id: 'asset:metadata', size: Number.MAX_SAFE_INTEGER + 1, mime: 'text/plain', sizeKey: '_content.size', mimeKey: '_content.mime', metadataOwner: 'n' },
  { name: 'empty MIME', id: 'asset:metadata', size: 1, mime: '', sizeKey: '_content.size', mimeKey: '_content.mime', metadataOwner: 'n' },
  { name: 'NUL MIME', id: 'asset:metadata', size: 1, mime: 'text/\0plain', sizeKey: '_content.size', mimeKey: '_content.mime', metadataOwner: 'n' },
  { name: 'empty identity', id: '', size: 1, mime: 'text/plain', sizeKey: '_content.size', mimeKey: '_content.mime', metadataOwner: 'n' },
  { name: 'NUL identity', id: 'asset:\0metadata', size: 1, mime: 'text/plain', sizeKey: '_content.size', mimeKey: '_content.mime', metadataOwner: 'n' },
  { name: 'mixed owners', id: 'asset:metadata', size: -1, mime: 'text/plain', sizeKey: '_content.size', mimeKey: '_content.mime', metadataOwner: 'm' },
];

describe('scalar strand writes resembling attachment metadata', () => {
  let repository: Awaited<ReturnType<typeof createTestRepo>>;
  beforeEach(async () => { repository = await createTestRepo('content-recovery'); });
  afterEach(async () => { await repository.cleanup(); });

  it.each(CASES)('publishes and reopens $name as ordinary scalar intents', async (fields) => {
    let runtime = await Runtime.open({ at: repository.tempDir, writer: 'alice' });
    try {
      const parent = await runtime.lane('documents');
      await parent.write([intent.node.add({ subject: 'n' }), intent.node.add({ subject: 'm' })]);
      const strand = await runtime.fork(parent, { name: 'draft' });
      const receipt = await strand.write([
        intent.property.set({ subject: 'n', key: '_content', value: fields.id }),
        intent.property.set({ subject: fields.metadataOwner, key: fields.sizeKey, value: fields.size }),
        intent.property.set({ subject: 'n', key: fields.mimeKey, value: fields.mime }),
      ]);
      expect(receipt.outcome.kind).toBe('derived');
      await runtime.close();
      runtime = await Runtime.open({ at: repository.tempDir, writer: 'alice' });
      const reopened = await runtime.strand(await runtime.lane('documents'), { name: 'draft' });
      expect((await reopened.write(intent.property.set({ subject: 'n', key: 'verified', value: true }))).outcome.kind)
        .toBe('derived');
    } finally { await runtime.close(); }
  });
});
