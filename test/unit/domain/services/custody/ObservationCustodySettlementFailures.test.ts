import { beforeEach, describe, expect, it } from 'vitest';
import CustodyEvidence from '../../../../../src/domain/services/custody/CustodyEvidence.ts';
import CustodyIndeterminate from '../../../../../src/domain/services/custody/CustodyIndeterminate.ts';
import CustodyRefused from '../../../../../src/domain/services/custody/CustodyRefused.ts';
import ObservationAdmitted from '../../../../../src/domain/services/custody/ObservationAdmitted.ts';
import type ObservationAttempt from '../../../../../src/domain/services/custody/ObservationAttempt.ts';
import ObservationAttemptId from '../../../../../src/domain/services/custody/ObservationAttemptId.ts';
import ObservationCustodyPage from '../../../../../src/domain/services/custody/ObservationCustodyPage.ts';
import ObservationCustodyRoots from '../../../../../src/domain/services/custody/ObservationCustodyRoots.ts';
import ObservationCustodyService from '../../../../../src/domain/services/custody/ObservationCustodyService.ts';
import ObservationDecodeFailure from '../../../../../src/domain/services/custody/ObservationDecodeFailure.ts';
import ObservationPreparedPage from '../../../../../src/domain/services/custody/ObservationPreparedPage.ts';
import ObservationPublicationEvidence from '../../../../../src/domain/services/custody/ObservationPublicationEvidence.ts';
import ObservationReceiptCore from '../../../../../src/domain/services/custody/ObservationReceiptCore.ts';
import ObservationRefused from '../../../../../src/domain/services/custody/ObservationRefused.ts';
import ObservationUnretained from '../../../../../src/domain/services/custody/ObservationUnretained.ts';
import NodeCryptoAdapter from '../../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import ObservationCustodyCborCodec from '../../../../../src/infrastructure/adapters/ObservationCustodyCborCodec.ts';
import codec from '../../../../../src/infrastructure/codecs/CborCodec.ts';
import ObservationAttemptSourcePort from '../../../../../src/ports/ObservationAttemptSourcePort.ts';
import { narrowed, readBindings, writeBindings, writeCore } from '../../../../helpers/ObservationCustodyFixture.ts';
import { ScriptedCustody, ScriptedSupport, emptySummary, inspectionAt } from '../../../../helpers/ScriptedObservationPorts.ts';

const BASIS = '12'.repeat(20);
const COMMIT = '34'.repeat(20);
const custodyCodec = new ObservationCustodyCborCodec(codec);
const failure = new Error('store unavailable');

class FixedAttempts extends ObservationAttemptSourcePort {
  override next(): ObservationAttemptId {
    return new ObservationAttemptId('a'.repeat(32));
  }
}

describe('ObservationCustodyService settling what it cannot retain', () => {
  let custody: ScriptedCustody;
  let service: ObservationCustodyService;

  beforeEach(() => {
    custody = new ScriptedCustody();
    service = new ObservationCustodyService({
      custody, support: new ScriptedSupport(), codec: custodyCodec, crypto: new NodeCryptoAdapter(), attempts: new FixedAttempts(),
    });
  });

  async function readAttempt(): Promise<ObservationAttempt> {
    return narrowed(await service.begin(readBindings(BASIS)), ObservationAdmitted).attempt;
  }

  async function writeAttempt(): Promise<ObservationAttempt> {
    return narrowed(await service.begin(writeBindings(BASIS)), ObservationAdmitted).attempt;
  }

  function storePreparation(attempt: ObservationAttempt): void {
    const bytes = custodyCodec.encodePreparedPage(new ObservationPreparedPage(attempt.bytes(), emptySummary()));
    custody.evidence.preparation = new CustodyEvidence('prepared', new ObservationCustodyPage(bytes, new ObservationCustodyRoots([], [])));
  }

  describe('retention after a publication', () => {
    const publication = new ObservationPublicationEvidence('writer-1', COMMIT);

    it.each([
      [new CustodyRefused('contention'), 'settlement-refused'],
      [new CustodyIndeterminate(failure), 'settlement-unacknowledged'],
    ] as const)('stays unretained, never refused or uncertain: %#', async (settled, reason) => {
      const attempt = await writeAttempt();
      storePreparation(attempt);
      custody.inspected = inspectionAt('armed');
      custody.settled = settled;
      expect(await service.settle(attempt, { core: writeCore('w'), publication })).toEqual(new ObservationUnretained(attempt, reason));
    });

    it('reports a failed inspection and unreadable preparation as unretained', async () => {
      const attempt = await writeAttempt();
      custody.inspected = new CustodyIndeterminate(failure);
      expect(await service.settle(attempt, { core: writeCore('w'), publication }))
        .toEqual(new ObservationUnretained(attempt, 'settlement-unacknowledged'));
    });

    it('reports settlement that does not resolve as unretained', async () => {
      const attempt = await writeAttempt();
      storePreparation(attempt);
      custody.inspected = inspectionAt('armed');
      custody.evidence.settlement = new CustodyRefused('not-settled');
      expect(await service.settle(attempt, { core: writeCore('w'), publication }))
        .toEqual(new ObservationUnretained(attempt, 'settlement-unverified'));
    });
  });

  describe('bytes the codec cannot read back', () => {
    it('refuses or reports a core before settling it', async () => {
      class UnreadableCores extends ObservationCustodyCborCodec {
        override decodeCore(): ObservationDecodeFailure {
          return new ObservationDecodeFailure('unreadable');
        }
      }
      service = new ObservationCustodyService({
        custody, support: new ScriptedSupport(), codec: new UnreadableCores(codec), crypto: new NodeCryptoAdapter(), attempts: new FixedAttempts(),
      });
      const read = await readAttempt();
      storePreparation(read);
      const core = new ObservationReceiptCore({ family: 'observation', variant: 'v', outcome: Uint8Array.of(1) });
      expect(await service.settle(read, { core, publication: null })).toEqual(new ObservationRefused('evidence-undecodable'));
      const write = await writeAttempt();
      storePreparation(write);
      custody.inspected = inspectionAt('armed');
      const writeOutcome = new ObservationReceiptCore({ family: 'write', variant: 'v', outcome: Uint8Array.of(1) });
      expect(await service.settle(write, { core: writeOutcome, publication: new ObservationPublicationEvidence('writer-1', COMMIT) }))
        .toEqual(new ObservationUnretained(write, 'evidence-undecodable'));
    });
  });
});
