import { describe, expect, it } from 'vitest';
import { intent } from '../../../../../advanced.ts';
import IntentSequence from '../../../../../src/domain/api/IntentSequence.ts';
import UnpublishedWriteReceipt from '../../../../../src/domain/api/UnpublishedWriteReceipt.ts';
import WarpWriteGrant from '../../../../../src/domain/api/WarpWriteGrant.ts';
import { operationalWriteFailure } from '../../../../../src/domain/api/WriteRuntime.ts';
import WarpError from '../../../../../src/domain/errors/WarpError.ts';
import ConeBasis from '../../../../../src/domain/services/cone/ConeBasis.ts';
import { EventId } from '../../../../../src/domain/utils/EventId.ts';
import ConeRecoveryObstruction from '../../../../../src/domain/services/cone/ConeRecoveryObstruction.ts';
import ConeContendedObstruction from '../../../../../src/domain/services/cone/ConeContendedObstruction.ts';
import type ConeLaneBasis from '../../../../../src/domain/services/cone/ConeLaneBasis.ts';
import ContentStagingAuthority from '../../../../../src/domain/services/ContentStagingAuthority.ts';
import type { PatchBuilder } from '../../../../../src/domain/services/PatchBuilder.ts';
import ConeWriteLowering from '../../../../../src/domain/services/write/ConeWriteLowering.ts';
import type CryptoPort from '../../../../../src/ports/CryptoPort.ts';

const GRANT = new WarpWriteGrant({ authority: 'a', budget: { records: 9, bytes: 9999, work: 9 } });

function lowering(fields: {
  readonly premise: () => Promise<object>;
  readonly prepare?: () => Promise<void>;
  readonly addNode?: () => void;
}): ConeWriteLowering {
  return new ConeWriteLowering({
    graph: 'g',
    cone: { writePremise: fields.premise } as unknown as ConeLaneBasis,
    content: new ContentStagingAuthority(),
    crypto: {} as CryptoPort,
    openPatch: () => Promise.resolve({
      prepareConeWriteBasis: fields.prepare ?? (() => Promise.resolve()), addNode: fields.addNode,
    } as unknown as PatchBuilder),
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

  it('names a failed value recovery with its own repair', async () => {
    const event = new EventId(1, 'bob', 'a'.repeat(40), 0);
    const lowered = await lowering({ premise: () => Promise.resolve(new ConeRecoveryObstruction(event, 'unavailable')) }).lower(request);

    expect(lowered instanceof UnpublishedWriteReceipt ? lowered.cause : '').toBe('cone_recovery');
  });

  it('reports a store that fails before anything was reserved as unpublished', async () => {
    const lowered = await lowering({ premise: () => Promise.reject(new Error('store went away')) }).lower(request);

    expect(lowered instanceof UnpublishedWriteReceipt ? lowered.cause : '').toBe('write-basis-unavailable');
  });

  it('reports a store that fails reading the premise records as unpublished, whatever it throws', async () => {
    const failures = [new Error('store went away'), new WarpError('object missing', 'E_MISSING_OBJECT')];
    for (const failure of failures) {
      const lowered = await lowering({ premise, prepare: () => Promise.reject(failure) }).lower(request);

      expect(lowered).toBeInstanceOf(UnpublishedWriteReceipt);
      expect(lowered instanceof UnpublishedWriteReceipt ? lowered.cause : '').toBe('write-premise-unavailable');
    }
  });

  it('keeps the cause and repair of an expected refusal met while reading the premise records', async () => {
    const refusal = new WarpError('attached data', 'E_PATCH_DELETE_WITH_DATA');
    const lowered = await lowering({ premise, prepare: () => Promise.reject(refusal) }).lower(request);

    expect(lowered instanceof UnpublishedWriteReceipt ? lowered.cause : '').toBe(operationalWriteFailure(refusal)?.reason.code);
  });

  it('does not hide a lowering failure that is not an expected write refusal', async () => {
    const thrower = (failure: Error) => (): void => { throw failure; };
    await expect(lowering({ premise, addNode: thrower(new Error('boom')) }).lower(request)).rejects.toThrow('boom');
    await expect(lowering({ premise, addNode: thrower(new WarpError('odd', 'E_ODD')) }).lower(request)).rejects.toThrow('odd');
  });
});
