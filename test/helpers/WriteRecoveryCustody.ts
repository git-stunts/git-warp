import type CustodyIndeterminate from '../../src/domain/services/custody/CustodyIndeterminate.ts';
import type CustodyRefused from '../../src/domain/services/custody/CustodyRefused.ts';
import type { CustodyEvidenceOutcome, CustodyTransition } from '../../src/domain/services/custody/CustodyOutcome.ts';
import type { CustodyStage } from '../../src/domain/services/custody/CustodyVocabulary.ts';
import type ObservationCustodyIdentity from '../../src/domain/services/custody/ObservationCustodyIdentity.ts';
import type ObservationCustodyPage from '../../src/domain/services/custody/ObservationCustodyPage.ts';
import type ObservationCustodyPort from '../../src/ports/ObservationCustodyPort.ts';
import FaultingObservationCustody from './FaultingObservationCustody.ts';

type RecoveryAnswers = {
  readonly settlement?: () => CustodyIndeterminate | CustodyRefused;
  readonly settle?: () => CustodyIndeterminate | CustodyRefused;
};

/** Real custody, with explicit port failures at the settlement boundaries under investigation. */
export default class WriteRecoveryCustody extends FaultingObservationCustody {
  readonly #answers: RecoveryAnswers;

  constructor(custody: ObservationCustodyPort, answers: RecoveryAnswers) {
    super(custody);
    this.#answers = answers;
  }

  override async readEvidence(identity: ObservationCustodyIdentity, stage: CustodyStage): Promise<CustodyEvidenceOutcome> {
    return stage === 'settlement' && this.#answers.settlement !== undefined
      ? this.#answers.settlement()
      : await super.readEvidence(identity, stage);
  }

  override async settle(identity: ObservationCustodyIdentity, page: ObservationCustodyPage): Promise<CustodyTransition> {
    return this.#answers.settle === undefined ? await super.settle(identity, page) : this.#answers.settle();
  }
}
