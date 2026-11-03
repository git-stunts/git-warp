import { beforeEach, describe, expect, it } from 'vitest';
import ObservationCustodyError from '../../../../../src/domain/errors/ObservationCustodyError.ts';
import CustodyAcknowledged from '../../../../../src/domain/services/custody/CustodyAcknowledged.ts';
import CustodyEvidence from '../../../../../src/domain/services/custody/CustodyEvidence.ts';
import CustodyIndeterminate from '../../../../../src/domain/services/custody/CustodyIndeterminate.ts';
import CustodyRefused from '../../../../../src/domain/services/custody/CustodyRefused.ts';
import type { CustodyRefusalReason } from '../../../../../src/domain/services/custody/CustodyVocabulary.ts';
import ObservationAdmitted from '../../../../../src/domain/services/custody/ObservationAdmitted.ts';
import type ObservationAttempt from '../../../../../src/domain/services/custody/ObservationAttempt.ts';
import ObservationAttemptId from '../../../../../src/domain/services/custody/ObservationAttemptId.ts';
import ObservationCoordinate from '../../../../../src/domain/services/custody/ObservationCoordinate.ts';
import ObservationCustodyPage from '../../../../../src/domain/services/custody/ObservationCustodyPage.ts';
import ObservationCustodyRoots from '../../../../../src/domain/services/custody/ObservationCustodyRoots.ts';
import ObservationCustodyService from '../../../../../src/domain/services/custody/ObservationCustodyService.ts';
import ObservationDigest from '../../../../../src/domain/services/custody/ObservationDigest.ts';
import ObservationIndeterminate from '../../../../../src/domain/services/custody/ObservationIndeterminate.ts';
import ObservationKnownUnpublished from '../../../../../src/domain/services/custody/ObservationKnownUnpublished.ts';
import ObservationPreparation from '../../../../../src/domain/services/custody/ObservationPreparation.ts';
import ObservationPrepared from '../../../../../src/domain/services/custody/ObservationPrepared.ts';
import ObservationPreparedPage from '../../../../../src/domain/services/custody/ObservationPreparedPage.ts';
import ObservationPublicationEvidence from '../../../../../src/domain/services/custody/ObservationPublicationEvidence.ts';
import ObservationPublicationPermission from '../../../../../src/domain/services/custody/ObservationPublicationPermission.ts';
import ObservationReconcileOnly from '../../../../../src/domain/services/custody/ObservationReconcileOnly.ts';
import ObservationReconciled from '../../../../../src/domain/services/custody/ObservationReconciled.ts';
import ObservationRecord from '../../../../../src/domain/services/custody/ObservationRecord.ts';
import ObservationRefused from '../../../../../src/domain/services/custody/ObservationRefused.ts';
import ObservationSettlementPage from '../../../../../src/domain/services/custody/ObservationSettlementPage.ts';
import ObservationSupportCancelled from '../../../../../src/domain/services/custody/ObservationSupportCancelled.ts';
import ObservationSupportFault from '../../../../../src/domain/services/custody/ObservationSupportFault.ts';
import ObservationSupportLimits from '../../../../../src/domain/services/custody/ObservationSupportLimits.ts';
import ObservationSupportRefused from '../../../../../src/domain/services/custody/ObservationSupportRefused.ts';
import ObservationUnavailable from '../../../../../src/domain/services/custody/ObservationUnavailable.ts';
import ResolvedObservation from '../../../../../src/domain/services/custody/ResolvedObservation.ts';
import RetainedObservation from '../../../../../src/domain/services/custody/RetainedObservation.ts';
import NodeCryptoAdapter from '../../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import ObservationCustodyCborCodec from '../../../../../src/infrastructure/adapters/ObservationCustodyCborCodec.ts';
import codec from '../../../../../src/infrastructure/codecs/CborCodec.ts';
import ObservationAttemptSourcePort from '../../../../../src/ports/ObservationAttemptSourcePort.ts';
import { narrowed, readBindings, readCore, sources, writeBindings, writeCore } from '../../../../helpers/ObservationCustodyFixture.ts';
import { ScriptedCustody, ScriptedSupport, emptySummary, inspectionAt } from '../../../../helpers/ScriptedObservationPorts.ts';

const BASIS = '12'.repeat(20);
const COMMIT = '34'.repeat(20);
const custodyCodec = new ObservationCustodyCborCodec(codec);
const crypto = new NodeCryptoAdapter();
const failure = new Error('store unavailable');

class FixedAttempts extends ObservationAttemptSourcePort {
  override next(): ObservationAttemptId {
    return new ObservationAttemptId('a'.repeat(32));
  }
}

async function digest(bytes: Uint8Array): Promise<ObservationDigest> {
  return new ObservationDigest(await crypto.hash('sha256', bytes));
}

function page(bytes: Uint8Array, parents: readonly string[] = []): ObservationCustodyPage {
  return new ObservationCustodyPage(bytes, new ObservationCustodyRoots([], parents));
}

describe('ObservationCustodyService', () => {
  let custody: ScriptedCustody;
  let support: ScriptedSupport;
  let service: ObservationCustodyService;

  beforeEach(() => {
    custody = new ScriptedCustody();
    support = new ScriptedSupport();
    service = new ObservationCustodyService({
      custody, support, codec: custodyCodec, crypto, attempts: new FixedAttempts(),
      limits: new ObservationSupportLimits({ writers: 8, dependencies: 8 }),
    });
  });

  async function readAttempt(): Promise<ObservationAttempt> {
    return narrowed(await service.begin(readBindings(BASIS)), ObservationAdmitted).attempt;
  }

  async function writeAttempt(): Promise<ObservationAttempt> {
    return narrowed(await service.begin(writeBindings(BASIS)), ObservationAdmitted).attempt;
  }

  /** Publishes real prepared evidence for `attempt`, as custody would return it. */
  function storePreparation(attempt: ObservationAttempt): void {
    const bytes = custodyCodec.encodePreparedPage(new ObservationPreparedPage(attempt.bytes(), emptySummary()));
    custody.evidence.preparation = new CustodyEvidence('prepared', page(bytes));
  }

  /** Stores settlement evidence and returns the Coordinate addressing it. */
  async function storeSettlement(
    attempt: ObservationAttempt,
    forged: { readonly record?: ObservationRecord; readonly core?: Uint8Array; readonly parents?: readonly string[] } = {},
  ): Promise<ObservationCoordinate> {
    const core = forged.core ?? custodyCodec.encodeCore(readCore('stored'));
    const record = forged.record ?? new ObservationRecord({
      preparation: attempt.identity.binding, core: await digest(core), publication: null,
    });
    const recordBytes = custodyCodec.encodeRecord(record);
    const bytes = custodyCodec.encodeSettlementPage(new ObservationSettlementPage(recordBytes, core));
    custody.evidence.settlement = new CustodyEvidence('settled', page(bytes, forged.parents ?? []));
    return new ObservationCoordinate({
      attemptId: attempt.identity.attemptId, binding: attempt.identity.binding, record: await digest(recordBytes),
    });
  }

  describe('admission', () => {
    it('derives a stable binding, and a different binding for different bindings', async () => {
      const first = await readAttempt();
      const again = await readAttempt();
      const other = await writeAttempt();
      expect(first.identity.binding.hex).toBe(again.identity.binding.hex);
      expect(first.identity.binding.hex).not.toBe(other.identity.binding.hex);
      expect(first.identity.binding).toEqual(await digest(first.bytes()));
      expect(custodyCodec.decodePreparation(first.bytes())).toBeInstanceOf(ObservationPreparation);
    });

    it('maps refusal and uncertainty', async () => {
      custody.reserved = new CustodyRefused('capacity-full');
      expect(await service.begin(readBindings(BASIS))).toEqual(new ObservationRefused('capacity-full'));
      custody.reserved = new CustodyIndeterminate(failure);
      expect(await service.begin(readBindings(BASIS))).toEqual(new ObservationIndeterminate('reservation', failure));
    });
  });

  describe('prepare', () => {
    it('retains support, releases construction and hands custody its roots', async () => {
      const attempt = await readAttempt();
      expect(await service.prepare(attempt, sources())).toBeInstanceOf(ObservationPrepared);
      expect(support.releases).toBe(1);
      const stored = custodyCodec.decodePreparedPage(custody.pages[0]?.record() ?? new Uint8Array());
      expect(narrowed(stored, ObservationPreparedPage).preparation()).toEqual(attempt.bytes());
    });

    it('binds the support request to the original basis and a cancellation check', async () => {
      const attempt = await readAttempt();
      let seen: { basis: string; cancelled: boolean } | null = null;
      const fallback = support.retention;
      support.retention = async (request) => {
        seen = { basis: request.basis, cancelled: request.isCancelled() };
        return await fallback(request);
      };
      await service.prepare(attempt, sources());
      expect(seen).toEqual({ basis: BASIS, cancelled: false });
    });

    it('still reports success when disposable construction cannot be released', async () => {
      const attempt = await readAttempt();
      support.releaseFailure = failure;
      expect(await service.prepare(attempt, sources())).toBeInstanceOf(ObservationPrepared);
    });

    it('maps inspection, build and acknowledgement failures', async () => {
      const attempt = await readAttempt();
      custody.inspected = new CustodyRefused('not-reserved');
      expect(await service.prepare(attempt, sources())).toEqual(new ObservationRefused('not-reserved'));
      custody.inspected = new CustodyIndeterminate(failure);
      expect(await service.prepare(attempt, sources())).toEqual(new ObservationIndeterminate('preparation', failure));
      custody.inspected = inspectionAt('cancelled');
      expect(await service.prepare(attempt, sources())).toBeInstanceOf(ObservationKnownUnpublished);

      custody.inspected = inspectionAt('reserved');
      support.retention = async () => await Promise.resolve(new ObservationSupportRefused('writer-limit'));
      expect(await service.prepare(attempt, sources())).toEqual(new ObservationRefused('writer-limit'));
      support.retention = async () => await Promise.resolve(new ObservationSupportCancelled());
      expect(await service.prepare(attempt, sources())).toEqual(new ObservationRefused('cancelled'));
      support.retention = async () => await Promise.reject(failure);
      expect(await service.prepare(attempt, sources())).toEqual(new ObservationIndeterminate('preparation', failure));
      support.retention = async () => await Promise.reject(new Error('later'));
      expect(await service.prepare(attempt, sources())).toBeInstanceOf(ObservationIndeterminate);

      support = new ScriptedSupport();
      const fresh = new ObservationCustodyService({
        custody, support, codec: custodyCodec, crypto, attempts: new FixedAttempts(),
        limits: new ObservationSupportLimits({ writers: 8, dependencies: 8 }),
      });
      custody.prepared = new CustodyRefused('preparation-mismatch');
      expect(await fresh.prepare(attempt, sources())).toEqual(new ObservationRefused('preparation-mismatch'));
      expect(support.releases).toBe(0);
    });

    it('reports a non-Error builder rejection as indeterminate', async () => {
      const attempt = await readAttempt();
      support.retention = async () => await Promise.reject('text failure');
      const outcome = await service.prepare(attempt, sources());
      expect(outcome).toBeInstanceOf(ObservationIndeterminate);
      expect(outcome).toMatchObject({ step: 'preparation', cause: { code: 'E_OBSERVATION_CUSTODY_INVALID' } });
    });

    it('recovers a past preparation from evidence, never rebuilding', async () => {
      const attempt = await readAttempt();
      custody.inspected = inspectionAt('armed');
      storePreparation(attempt);
      support.retention = async () => await Promise.reject(new Error('must not rebuild'));
      expect(await service.prepare(attempt, sources())).toBeInstanceOf(ObservationPrepared);
    });

    it('refuses recovery from evidence of anything else', async () => {
      const attempt = await readAttempt();
      custody.inspected = inspectionAt('prepared');
      custody.evidence.preparation = new CustodyEvidence('prepared', page(Uint8Array.of(0xff)));
      expect(await service.prepare(attempt, sources())).toEqual(new ObservationRefused('preparation-mismatch'));
      const foreign = custodyCodec.encodePreparedPage(new ObservationPreparedPage(Uint8Array.of(1), emptySummary()));
      custody.evidence.preparation = new CustodyEvidence('prepared', page(foreign));
      expect(await service.prepare(attempt, sources())).toEqual(new ObservationRefused('preparation-mismatch'));
      const sameLength = Uint8Array.from(attempt.bytes());
      sameLength[0] = (sameLength[0] ?? 0) ^ 1;
      custody.evidence.preparation = new CustodyEvidence('prepared', page(custodyCodec.encodePreparedPage(new ObservationPreparedPage(sameLength, emptySummary()))));
      expect(await service.prepare(attempt, sources())).toEqual(new ObservationRefused('preparation-mismatch'));
      custody.evidence.preparation = new CustodyRefused('not-prepared');
      expect(await service.prepare(attempt, sources())).toEqual(new ObservationRefused('not-prepared'));
    });
  });

  describe('publication permission', () => {
    it('comes only from a fresh armed acknowledgement', async () => {
      const attempt = await writeAttempt();
      expect(await service.authorizePublication(attempt)).toBeInstanceOf(ObservationPublicationPermission);
      custody.armed = new CustodyAcknowledged('recovered', 'armed');
      expect(await service.authorizePublication(attempt)).toBeInstanceOf(ObservationReconcileOnly);
      custody.armed = new CustodyIndeterminate(failure);
      expect(await service.authorizePublication(attempt)).toEqual(new ObservationIndeterminate('arm', failure));
    });

    it.each<[CustodyRefusalReason, abstract new (...args: never[]) => object]>([
      ['cancelled', ObservationKnownUnpublished],
      ['already-armed', ObservationReconcileOnly],
      ['already-settled', ObservationReconcileOnly],
      ['not-prepared', ObservationRefused],
    ])('maps a refused arm for %s', async (reason, expected) => {
      const attempt = await writeAttempt();
      custody.armed = new CustodyRefused(reason);
      expect(await service.authorizePublication(attempt)).toBeInstanceOf(expected);
    });

    it('is misuse for a read', async () => {
      const attempt = await readAttempt();
      await expect(service.authorizePublication(attempt)).rejects.toMatchObject({ code: 'E_OBSERVATION_CUSTODY_MISUSE' });
    });
  });

  describe('settle', () => {
    const publication = new ObservationPublicationEvidence('writer-1', COMMIT);

    it('refuses misuse of publication evidence', async () => {
      const read = await readAttempt();
      const write = await writeAttempt();
      await expect(service.settle(read, { core: readCore('r'), publication })).rejects.toThrow(ObservationCustodyError);
      await expect(service.settle(write, { core: writeCore('w'), publication: null })).rejects.toThrow(ObservationCustodyError);
      await expect(service.settle(write, { core: writeCore('w'), publication: new ObservationPublicationEvidence('other', COMMIT) }))
        .rejects.toMatchObject({ code: 'E_OBSERVATION_CUSTODY_MISUSE' });
    });

    it('issues a Coordinate only after resolving what was settled', async () => {
      const attempt = await readAttempt();
      storePreparation(attempt);
      const core = readCore('issued');
      const settled = service.settle(attempt, { core, publication: null });
      const coordinate = await storeSettlement(attempt, { core: custodyCodec.encodeCore(core) });
      const retained = narrowed(await settled, RetainedObservation);
      expect(retained.coordinate.toString()).toBe(coordinate.toString());
      expect(retained.core()).toEqual(Uint8Array.from(custodyCodec.encodeCore(core)));
    });

    it('withholds a Coordinate when settled evidence does not resolve', async () => {
      const attempt = await readAttempt();
      const outcome = await service.settle(attempt, { core: readCore('x'), publication: null });
      expect(outcome).toBeInstanceOf(ObservationIndeterminate);
      expect(outcome).toMatchObject({ step: 'settlement', cause: { code: 'E_OBSERVATION_CUSTODY_UNVERIFIED' } });
    });

    it('maps state failures without issuing anything', async () => {
      const read = await readAttempt();
      custody.inspected = new CustodyIndeterminate(failure);
      expect(await service.settle(read, { core: readCore('x'), publication: null })).toEqual(new ObservationIndeterminate('settlement', failure));
      custody.inspected = inspectionAt('cancelled');
      expect(await service.settle(read, { core: readCore('x'), publication: null })).toBeInstanceOf(ObservationKnownUnpublished);

      custody.inspected = inspectionAt('prepared');
      custody.settled = new CustodyRefused('cancelled');
      expect(await service.settle(read, { core: readCore('x'), publication: null })).toBeInstanceOf(ObservationKnownUnpublished);
      custody.settled = new CustodyRefused('settlement-mismatch');
      expect(await service.settle(read, { core: readCore('x'), publication: null })).toEqual(new ObservationRefused('settlement-mismatch'));
      custody.settled = new CustodyIndeterminate(failure);
      expect(await service.settle(read, { core: readCore('x'), publication: null })).toEqual(new ObservationIndeterminate('settlement', failure));
    });

    it('requires a write to be armed, and retains its publication as a parent', async () => {
      const write = await writeAttempt();
      for (const phase of ['reserved', 'prepared'] as const) {
        custody.inspected = inspectionAt(phase);
        expect(await service.settle(write, { core: writeCore('w'), publication })).toEqual(new ObservationRefused('not-armed'));
      }
      custody.inspected = inspectionAt('armed');
      custody.settled = new CustodyIndeterminate(failure);
      await service.settle(write, { core: writeCore('w'), publication });
      expect(custody.pages.at(-1)?.roots.parents).toEqual([COMMIT]);
    });
  });

  describe('cancel and reconcile', () => {
    it.each<[CustodyRefusalReason, abstract new (...args: never[]) => object]>([
      ['cancelled', ObservationKnownUnpublished],
      ['irreversible', ObservationReconcileOnly],
      ['already-armed', ObservationReconcileOnly],
      ['already-settled', ObservationReconcileOnly],
      ['contention', ObservationRefused],
    ])('maps a refused cancel for %s', async (reason, expected) => {
      const attempt = await writeAttempt();
      custody.cancelled = new CustodyRefused(reason);
      expect(await service.cancel(attempt)).toBeInstanceOf(expected);
    });

    it('claims known-unpublished only on a durable cancel', async () => {
      const attempt = await writeAttempt();
      expect(await service.cancel(attempt)).toBeInstanceOf(ObservationKnownUnpublished);
      expect(support.releases).toBe(1);
      custody.cancelled = new CustodyIndeterminate(failure);
      expect(await service.cancel(attempt)).toEqual(new ObservationIndeterminate('cancellation', failure));
    });

    it('awaits a failing owned builder before cancelling', async () => {
      const attempt = await writeAttempt();
      let reject: (cause: Error) => void = () => undefined;
      support.retention = async () => await new Promise((_, rejecting) => {
        reject = rejecting;
      });
      const preparing = service.prepare(attempt, sources());
      await Promise.resolve();
      await Promise.resolve();
      const cancelling = service.cancel(attempt);
      reject(failure);
      expect(await cancelling).toBeInstanceOf(ObservationKnownUnpublished);
      expect(await preparing).toEqual(new ObservationIndeterminate('preparation', failure));
    });

    it('releases construction only past reservation', async () => {
      const attempt = await readAttempt();
      expect(await service.reconcile(attempt)).toEqual(new ObservationReconciled('prepared'));
      expect(support.releases).toBe(1);
      custody.reconciled = new CustodyAcknowledged('recovered', 'reserved');
      expect(await service.reconcile(attempt)).toEqual(new ObservationReconciled('reserved'));
      expect(support.releases).toBe(1);
      custody.reconciled = new CustodyRefused('not-reserved');
      expect(await service.reconcile(attempt)).toEqual(new ObservationRefused('not-reserved'));
      custody.reconciled = new CustodyIndeterminate(failure);
      expect(await service.reconcile(attempt)).toEqual(new ObservationIndeterminate('reconciliation', failure));
    });
  });

  describe('resolve', () => {
    let attempt: ObservationAttempt;

    beforeEach(async () => {
      attempt = await readAttempt();
      storePreparation(attempt);
    });

    it('returns the exact stored evidence', async () => {
      const core = custodyCodec.encodeCore(readCore('exact'));
      const resolved = narrowed(await service.resolve(await storeSettlement(attempt, { core })), ResolvedObservation);
      expect(resolved.core()).toEqual(Uint8Array.from(core));
      expect(resolved.preparation.attemptId.value).toBe(attempt.identity.attemptId.value);
    });

    it('distinguishes never-retained from unreadable', async () => {
      const coordinate = await storeSettlement(attempt);
      custody.evidence.settlement = new CustodyRefused('not-settled');
      expect(await service.resolve(coordinate)).toEqual(new ObservationUnavailable('not-retained'));
      custody.evidence.settlement = new CustodyIndeterminate(failure);
      expect(await service.resolve(coordinate)).toEqual(new ObservationUnavailable('evidence-unreadable'));
    });

    it('detects a corrupt settlement page, record or core', async () => {
      const coordinate = await storeSettlement(attempt);
      custody.evidence.settlement = new CustodyEvidence('settled', page(Uint8Array.of(0xff)));
      expect(await service.resolve(coordinate)).toEqual(new ObservationUnavailable('record-corrupt'));

      await storeSettlement(attempt, { core: custodyCodec.encodeCore(readCore('swapped')) });
      expect(await service.resolve(coordinate)).toEqual(new ObservationUnavailable('record-corrupt'));

      const garbage = custodyCodec.encodeSettlementPage(new ObservationSettlementPage(Uint8Array.of(0xff), Uint8Array.of(1)));
      custody.evidence.settlement = new CustodyEvidence('settled', page(garbage));
      const addressed = new ObservationCoordinate({
        attemptId: attempt.identity.attemptId, binding: attempt.identity.binding, record: await digest(Uint8Array.of(0xff)),
      });
      expect(await service.resolve(addressed)).toEqual(new ObservationUnavailable('record-corrupt'));

      const liar = new ObservationRecord({ preparation: attempt.identity.binding, core: attempt.identity.binding, publication: null });
      expect(await service.resolve(await storeSettlement(attempt, { record: liar }))).toEqual(new ObservationUnavailable('core-corrupt'));

      const undecodable = Uint8Array.of(0xff);
      const honest = new ObservationRecord({ preparation: attempt.identity.binding, core: await digest(undecodable), publication: null });
      expect(await service.resolve(await storeSettlement(attempt, { record: honest, core: undecodable })))
        .toEqual(new ObservationUnavailable('core-corrupt'));
    });

    it('detects a preparation that is unreadable, corrupt, foreign or unbound', async () => {
      const coordinate = await storeSettlement(attempt);
      custody.evidence.preparation = new CustodyRefused('not-prepared');
      expect(await service.resolve(coordinate)).toEqual(new ObservationUnavailable('not-retained'));
      custody.evidence.preparation = new CustodyEvidence('prepared', page(Uint8Array.of(0xff)));
      expect(await service.resolve(coordinate)).toEqual(new ObservationUnavailable('preparation-corrupt'));
      const foreign = custodyCodec.encodePreparedPage(new ObservationPreparedPage(Uint8Array.of(1), emptySummary()));
      custody.evidence.preparation = new CustodyEvidence('prepared', page(foreign));
      expect(await service.resolve(coordinate)).toEqual(new ObservationUnavailable('preparation-corrupt'));

      storePreparation(attempt);
      const unbound = new ObservationRecord({
        preparation: new ObservationDigest('00'.repeat(32)),
        core: await digest(custodyCodec.encodeCore(readCore('u'))),
        publication: null,
      });
      const forged = await storeSettlement(attempt, { record: unbound, core: custodyCodec.encodeCore(readCore('u')) });
      expect(await service.resolve(forged)).toEqual(new ObservationUnavailable('preparation-corrupt'));
    });

    it('refuses a preparation whose bytes are not a decodable preparation of this attempt', async () => {
      const notPreparation = Uint8Array.of(0xff);
      const identity = new ObservationCoordinate({
        attemptId: attempt.identity.attemptId, binding: await digest(notPreparation), record: attempt.identity.binding,
      });
      const core = custodyCodec.encodeCore(readCore('n'));
      const record = new ObservationRecord({ preparation: identity.binding, core: await digest(core), publication: null });
      const recordBytes = custodyCodec.encodeRecord(record);
      custody.evidence.settlement = new CustodyEvidence('settled', page(custodyCodec.encodeSettlementPage(new ObservationSettlementPage(recordBytes, core))));
      custody.evidence.preparation = new CustodyEvidence('prepared', page(custodyCodec.encodePreparedPage(new ObservationPreparedPage(notPreparation, emptySummary()))));
      const coordinate = new ObservationCoordinate({ attemptId: identity.attemptId, binding: identity.binding, record: await digest(recordBytes) });
      expect(await service.resolve(coordinate)).toEqual(new ObservationUnavailable('preparation-corrupt'));
    });

    it('reports support and publication faults, including a publication custody does not retain', async () => {
      const coordinate = await storeSettlement(attempt);
      support.fault = new ObservationSupportFault('history-missing');
      expect(await service.resolve(coordinate)).toEqual(new ObservationUnavailable('history-missing'));
      support.fault = null;

      const core = custodyCodec.encodeCore(writeCore('published'));
      const record = new ObservationRecord({
        preparation: attempt.identity.binding, core: await digest(core), publication: new ObservationPublicationEvidence('w', COMMIT),
      });
      const unretained = await storeSettlement(attempt, { record, core });
      expect(await service.resolve(unretained)).toEqual(new ObservationUnavailable('publication-missing'));

      const retained = await storeSettlement(attempt, { record, core, parents: [COMMIT] });
      expect(await service.resolve(retained)).toBeInstanceOf(ResolvedObservation);
      support.publicationFault = new ObservationSupportFault('publication-missing');
      expect(await service.resolve(retained)).toEqual(new ObservationUnavailable('publication-missing'));
    });
  });
});
