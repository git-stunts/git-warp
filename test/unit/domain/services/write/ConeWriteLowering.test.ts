import { describe, expect, it } from 'vitest';
import { intent } from '../../../../../advanced.ts';
import IntentSequence from '../../../../../src/domain/api/IntentSequence.ts';
import UnpublishedWriteReceipt from '../../../../../src/domain/api/UnpublishedWriteReceipt.ts';
import WarpWriteGrant from '../../../../../src/domain/api/WarpWriteGrant.ts';
import WarpError from '../../../../../src/domain/errors/WarpError.ts';
import ConeBasis from '../../../../../src/domain/services/cone/ConeBasis.ts';
import ConeFrontier from '../../../../../src/domain/services/cone/ConeFrontier.ts';
import ConeRoot from '../../../../../src/domain/services/cone/ConeRoot.ts';
import ConeWriterPosition from '../../../../../src/domain/services/cone/ConeWriterPosition.ts';
import WriterFrontierLimit from '../../../../../src/domain/services/write/WriterFrontierLimit.ts';
import { WARP_SUPPORT_LIMITS } from '../../../../../src/application/WarpWriteComposition.ts';
import { EventId } from '../../../../../src/domain/utils/EventId.ts';
import ConeRecoveryObstruction from '../../../../../src/domain/services/cone/ConeRecoveryObstruction.ts';
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
    writers: new WriterFrontierLimit(WARP_SUPPORT_LIMITS.writers),
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

  it('names a failed value recovery with its own repair', async () => {
    const event = new EventId(1, 'bob', 'a'.repeat(40), 0);
    const lowered = await lowering({ premise: () => Promise.resolve(new ConeRecoveryObstruction(event, 'unavailable')) }).lower(request);

    expect(lowered instanceof UnpublishedWriteReceipt ? lowered.cause : '').toBe('cone_recovery');
  });

  it('reports a store that fails before anything was reserved as unpublished', async () => {
    const lowered = await lowering({ premise: () => Promise.reject(new Error('store went away')) }).lower(request);

    expect(lowered instanceof UnpublishedWriteReceipt ? lowered.cause : '').toBe('write-basis-unavailable');
  });

  it('does not hide a failure that is not an expected write refusal', async () => {
    await expect(lowering({ premise, prepare: () => Promise.reject(new Error('boom')) }).lower(request)).rejects.toThrow('boom');
    await expect(lowering({ premise, prepare: () => Promise.reject(new WarpError('odd', 'E_ODD')) }).lower(request)).rejects.toThrow('odd');
  });
});

/** A basis whose frontier holds `count` writer chains, `w0` to `w<count - 1>`. */
function basisOf(count: number): ConeBasis {
  const position = new ConeWriterPosition('e'.repeat(40), 1);
  return new ConeBasis(ConeRoot.empty(), new ConeFrontier(new Map(Array.from({ length: count }, (_, index) => [`w${index}`, position]))));
}

describe('ConeWriteLowering at the writer limit (#1075)', () => {
  const reachedPrepare = (): Promise<void> => Promise.reject(new Error('reached prepare'));
  const onto = (basis: ConeBasis) => (): Promise<object> => Promise.resolve({ basis, from: basis });

  it('holds 4,096 writers, so one write retains every head', () => {
    expect(WARP_SUPPORT_LIMITS.writers).toBe(4096);
  });

  it('admits the 4,096th writer and keeps every writer already in a full frontier writing', async () => {
    await expect(lowering({ premise: onto(basisOf(4095)), prepare: reachedPrepare }).lower({ ...request, writer: 'newcomer' })).rejects.toThrow('reached prepare');
    await expect(lowering({ premise: onto(basisOf(4096)), prepare: reachedPrepare }).lower({ ...request, writer: 'w4095' })).rejects.toThrow('reached prepare');
  });

  it('refuses the 4,097th writer before anything is reserved, with the repair', async () => {
    const lowered = await lowering({ premise: onto(basisOf(4096)), prepare: reachedPrepare }).lower({ ...request, writer: 'newcomer' });

    expect(lowered).toBeInstanceOf(UnpublishedWriteReceipt);
    expect(lowered instanceof UnpublishedWriteReceipt ? lowered.cause : '').toBe('writer-limit-reached');
    expect(lowered instanceof UnpublishedWriteReceipt ? lowered.repairHints.map((hint) => hint.code) : []).toEqual(['reuse_writer_id']);
  });

  it('refuses a limit that is not a count', () => {
    expect(() => new WriterFrontierLimit(-1)).toThrow('count');
    expect(() => new WriterFrontierLimit(0.5)).toThrow('count');
  });
});
