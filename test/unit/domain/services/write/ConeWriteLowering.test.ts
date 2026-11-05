import { describe, expect, it } from 'vitest';
import { intent } from '../../../../../advanced.ts';
import IntentSequence from '../../../../../src/domain/api/IntentSequence.ts';
import UnpublishedWriteReceipt from '../../../../../src/domain/api/UnpublishedWriteReceipt.ts';
import WarpWriteGrant from '../../../../../src/domain/api/WarpWriteGrant.ts';
import WarpError from '../../../../../src/domain/errors/WarpError.ts';
import ConeBasis from '../../../../../src/domain/services/cone/ConeBasis.ts';
import ConeContendedObstruction from '../../../../../src/domain/services/cone/ConeContendedObstruction.ts';
import type ConeLaneBasis from '../../../../../src/domain/services/cone/ConeLaneBasis.ts';
import ContentStagingAuthority from '../../../../../src/domain/services/ContentStagingAuthority.ts';
import type { PatchBuilder } from '../../../../../src/domain/services/PatchBuilder.ts';
import ConeWriteLowering from '../../../../../src/domain/services/write/ConeWriteLowering.ts';
import type CryptoPort from '../../../../../src/ports/CryptoPort.ts';

const GRANT = new WarpWriteGrant({ authority: 'a', budget: { records: 9, bytes: 9999, work: 9 } });

function lowering(fields: { readonly premise: () => Promise<object>; readonly prepare?: () => Promise<void> }): ConeWriteLowering {
  return new ConeWriteLowering({
    graph: 'g',
    cone: { writePremise: fields.premise } as unknown as ConeLaneBasis,
    content: new ContentStagingAuthority(),
    crypto: {} as CryptoPort,
    openPatch: () => Promise.resolve({ prepareConeWriteBasis: fields.prepare ?? (() => Promise.resolve()) } as unknown as PatchBuilder),
  });
}

const request = {
  writer: 'alice', grant: GRANT, sequence: IntentSequence.from(intent.node.add({ subject: 'x' })),
};
const premise = (): Promise<object> => Promise.resolve({ basis: ConeBasis.empty(), from: ConeBasis.empty() });

describe('ConeWriteLowering', () => {
  it('reports an obstructed basis with its repair, reserving nothing', async () => {
    const lowered = await lowering({ premise: () => Promise.resolve(new ConeContendedObstruction('g', 4)) }).lower(request);

    expect(lowered).toBeInstanceOf(UnpublishedWriteReceipt);
    expect(lowered instanceof UnpublishedWriteReceipt ? lowered.cause : '').toBe('cone_contended');
    expect(lowered instanceof UnpublishedWriteReceipt ? lowered.repairHints[0]?.code : '').toBe('retry_cone_advance');
  });

  it('does not hide a failure that is not an expected write refusal', async () => {
    await expect(lowering({ premise, prepare: () => Promise.reject(new Error('boom')) }).lower(request)).rejects.toThrow('boom');
    await expect(lowering({ premise, prepare: () => Promise.reject(new WarpError('odd', 'E_ODD')) }).lower(request)).rejects.toThrow('odd');
  });
});
