import { afterEach, describe, expect, it } from 'vitest';
import { Runtime, type StagedContent, type WriteIntentInput } from '../../../index.ts';
import { createNodeContentObserver, intent } from '../../../advanced.ts';
import { admittedSubject, writeStagedThroughWarp, writeThroughWarp } from '../../helpers/WarpSeed.ts';
import { disposeWarpFixtures, repository } from '../../helpers/WarpWriteFixture.ts';

afterEach(disposeWarpFixtures);

function attachDocument(staged: readonly StagedContent[]): WriteIntentInput {
  return [
    intent.entity.add({ subject: 'document', properties: { title: 'Seeded document' } }),
    ...staged.map((content) => intent.node.attachContent({ subject: 'document', content })),
  ];
}

describe('Warp seed fixture with real storage', () => {
  it('retains staged content and identifies its entity admission', async () => {
    const at = await repository();
    const receipt = await writeStagedThroughWarp(at, 'documents', 'alice',
      [{ content: 'sample', metadata: { mime: 'text/plain' } }], attachDocument);

    expect(admittedSubject(receipt)).toBe('document');
    expect(() => admittedSubject(receipt, 99)).toThrow('seed write admitted no entity at intent 99');
    const runtime = await Runtime.open({ at, writer: 'reader' });
    try {
      const lane = await runtime.lane('documents');
      const reading = await lane.observe(createNodeContentObserver({ subject: 'document' })).one();
      expect(reading.value).toMatchObject({ size: 6, mime: 'text/plain' });
      const chunks = await Array.fromAsync(reading.value?.open() ?? [],
        (chunk) => new TextDecoder().decode(chunk));
      expect(chunks.join('')).toBe('sample');
    } finally {
      await runtime.close();
    }
  });

  it('fails the fixture explicitly when staging exceeds its access budget', async () => {
    const at = await repository();
    const overBudgetBytes = 16 * 1024 * 1024 + 1;

    await expect(writeStagedThroughWarp(at, 'documents', 'alice',
      [{ content: 'x'.repeat(overBudgetBytes) }], attachDocument))
      .rejects.toThrow('seed staging was denied: budget-exhausted');
  });

  it('fails the fixture explicitly when a write exceeds its cone record budget', async () => {
    const at = await repository();
    const overBudgetRecords = 4097;
    const input = Array.from({ length: overBudgetRecords }, (_, index) =>
      intent.property.set({ subject: `over-budget:${String(index)}`, key: 'title', value: 'blocked' }));

    await expect(writeThroughWarp(at, 'documents', 'alice', input))
      .rejects.toThrow('seed write was not retained: UnpublishedWriteReceipt');
  });
});
