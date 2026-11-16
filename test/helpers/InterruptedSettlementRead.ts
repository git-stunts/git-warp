import CustodyIndeterminate from '../../src/domain/services/custody/CustodyIndeterminate.ts';
import type { CustodyEvidenceOutcome } from '../../src/domain/services/custody/CustodyOutcome.ts';
import type { CustodyStage } from '../../src/domain/services/custody/CustodyVocabulary.ts';
import type ObservationCustodyIdentity from '../../src/domain/services/custody/ObservationCustodyIdentity.ts';
import FaultingObservationCustody from './FaultingObservationCustody.ts';

/** A real custody port whose settlement evidence becomes unavailable at a chosen read boundary. */
export default class InterruptedSettlementRead extends FaultingObservationCustody {
  settlementReads = 0;
  availableThrough = Number.POSITIVE_INFINITY;

  override async readEvidence(identity: ObservationCustodyIdentity, stage: CustodyStage): Promise<CustodyEvidenceOutcome> {
    if (stage === 'settlement') {
      this.settlementReads += 1;
      if (this.settlementReads > this.availableThrough) {
        return new CustodyIndeterminate(new Error('Settlement evidence became unavailable'));
      }
    }
    return await super.readEvidence(identity, stage);
  }
}
