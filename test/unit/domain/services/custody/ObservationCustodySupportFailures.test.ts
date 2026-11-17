import { setImmediate } from 'node:timers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GitRepositoryLockedError } from '@git-stunts/plumbing/errors';
import ObservationSupportUnavailableError from '../../../../../src/domain/errors/ObservationSupportUnavailableError.ts';
import PersistenceError from '../../../../../src/domain/errors/PersistenceError.ts';
import CustodyEvidence from '../../../../../src/domain/services/custody/CustodyEvidence.ts';
import ObservationAdmitted from '../../../../../src/domain/services/custody/ObservationAdmitted.ts';
import type ObservationAttempt from '../../../../../src/domain/services/custody/ObservationAttempt.ts';
import ObservationAttemptId from '../../../../../src/domain/services/custody/ObservationAttemptId.ts';
import ObservationCustodyPage from '../../../../../src/domain/services/custody/ObservationCustodyPage.ts';
import ObservationCustodyRoots from '../../../../../src/domain/services/custody/ObservationCustodyRoots.ts';
import ObservationCustodyService from '../../../../../src/domain/services/custody/ObservationCustodyService.ts';
import ObservationIndeterminate from '../../../../../src/domain/services/custody/ObservationIndeterminate.ts';
import ObservationKnownUnpublished from '../../../../../src/domain/services/custody/ObservationKnownUnpublished.ts';
import ObservationPrepared from '../../../../../src/domain/services/custody/ObservationPrepared.ts';
import ObservationPreparedPage from '../../../../../src/domain/services/custody/ObservationPreparedPage.ts';
import NodeCryptoAdapter from '../../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import ObservationCustodyCborCodec from '../../../../../src/infrastructure/adapters/ObservationCustodyCborCodec.ts';
import codec from '../../../../../src/infrastructure/codecs/CborCodec.ts';
import ObservationAttemptSourcePort from '../../../../../src/ports/ObservationAttemptSourcePort.ts';
import { narrowed, readBindings, sources } from '../../../../helpers/ObservationCustodyFixture.ts';
import { ScriptedCustody, ScriptedSupport, emptySummary, inspectionAt } from '../../../../helpers/ScriptedObservationPorts.ts';

const BASIS = '12'.repeat(20);
const custodyCodec = new ObservationCustodyCborCodec(codec);

/** A held lock, as plumbing throws it, typed by the support adapter as unavailable (#1109). */
const UNAVAILABLE = new ObservationSupportUnavailableError('read a ref', new GitRepositoryLockedError(
  'Git command failed: repository is locked', 'ExecutionOrchestrator.orchestrate', { code: 128, stderr: 'fatal: Unable to create index.lock' },
));

/** Failures that the support adapter did not type as unavailable: defects, a thrown non-error and corruption. Each must reject. */
const UNTYPED: ReadonlyArray<readonly [string, Error | string]> = [
  ['a TypeError', new TypeError("Cannot read properties of undefined (reading 'oid')")],
  ['a RangeError', new RangeError('Invalid array length')],
  ['a thrown non-error', 'not an error'],
  ['corruption', new PersistenceError('Missing Git object', PersistenceError.E_MISSING_OBJECT)],
];

class FixedAttempts extends ObservationAttemptSourcePort {
  override next(): ObservationAttemptId {
    return new ObservationAttemptId('a'.repeat(32));
  }
}

describe('ObservationCustodyService classifies support failures by type (#1109)', () => {
  let custody: ScriptedCustody;
  let support: ScriptedSupport;
  let service: ObservationCustodyService;

  beforeEach(() => {
    custody = new ScriptedCustody();
    support = new ScriptedSupport();
    service = new ObservationCustodyService({ custody, support, codec: custodyCodec, crypto: new NodeCryptoAdapter(), attempts: new FixedAttempts() });
  });

  async function attempt(): Promise<ObservationAttempt> {
    return narrowed(await service.begin(readBindings(BASIS)), ObservationAdmitted).attempt;
  }

  /** Stores this attempt's prepared page, as custody returns it for a preparation that was acknowledged before. */
  function storePreparation(prepared: ObservationAttempt): void {
    const bytes = custodyCodec.encodePreparedPage(new ObservationPreparedPage(prepared.bytes(), emptySummary()));
    custody.evidence.preparation = new CustodyEvidence('prepared', new ObservationCustodyPage(bytes, new ObservationCustodyRoots([], [])));
    custody.inspected = inspectionAt('prepared');
  }

  it('reports unavailable support while building as an indeterminate preparation, keeping its cause', async () => {
    const admitted = await attempt();
    support.retention = async () => await Promise.reject(UNAVAILABLE);

    expect(await service.prepare(admitted, sources())).toEqual(new ObservationIndeterminate('preparation', UNAVAILABLE));
  });

  it('reports unavailable support while checking a build as an indeterminate preparation, keeping its cause', async () => {
    const admitted = await attempt();
    vi.spyOn(support, 'verify').mockRejectedValueOnce(UNAVAILABLE);

    expect(await service.prepare(admitted, sources())).toEqual(new ObservationIndeterminate('preparation', UNAVAILABLE));
    expect(custody.pages).toHaveLength(0);
  });

  it('reports unavailable support while checking a recovered preparation as an indeterminate preparation', async () => {
    const admitted = await attempt();
    storePreparation(admitted);
    vi.spyOn(support, 'verify').mockRejectedValueOnce(UNAVAILABLE);

    expect(await service.prepare(admitted, sources())).toEqual(new ObservationIndeterminate('preparation', UNAVAILABLE));
  });

  it.each(UNTYPED)('rejects a support build that fails with %s', async (_name, failure) => {
    const admitted = await attempt();
    support.retention = async () => await Promise.reject(failure);

    await expect(service.prepare(admitted, sources())).rejects.toBe(failure);
    expect(custody.pages).toHaveLength(0);
  });

  it.each(UNTYPED)('rejects a support check that fails with %s, before custody sees the preparation', async (_name, failure) => {
    const admitted = await attempt();
    vi.spyOn(support, 'verify').mockRejectedValueOnce(failure);

    await expect(service.prepare(admitted, sources())).rejects.toBe(failure);
    expect(custody.pages).toHaveLength(0);
  });

  it.each(UNTYPED)('rejects a recovered preparation whose support check fails with %s', async (_name, failure) => {
    const admitted = await attempt();
    storePreparation(admitted);
    vi.spyOn(support, 'verify').mockRejectedValueOnce(failure);

    await expect(service.prepare(admitted, sources())).rejects.toBe(failure);
  });

  it('ends a rejected build as owned work, so the attempt can build again', async () => {
    const admitted = await attempt();
    const fallback = support.retention;
    support.retention = async () => await Promise.reject(new RangeError('Invalid array length'));
    await expect(service.prepare(admitted, sources())).rejects.toThrow(RangeError);
    support.retention = fallback;

    expect(await service.prepare(admitted, sources())).toBeInstanceOf(ObservationPrepared);
  });

  it('awaits a build that a defect rejects before it cancels, and still ends the attempt', async () => {
    const admitted = await attempt();
    const defect = new RangeError('Invalid array length');
    let fail: (cause: Error) => void = () => undefined;
    support.retention = async () => await new Promise((_, rejecting) => {
      fail = rejecting;
    });
    const rejected = expect(service.prepare(admitted, sources())).rejects.toBe(defect);
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
    const cancelling = service.cancel(admitted);
    fail(defect);

    expect(await cancelling).toBeInstanceOf(ObservationKnownUnpublished);
    await rejected;
  });
});
