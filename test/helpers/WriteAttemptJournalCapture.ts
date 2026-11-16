import type { CustodyTransition } from '../../src/domain/services/custody/CustodyOutcome.ts';
import type ObservationCustodyIdentity from '../../src/domain/services/custody/ObservationCustodyIdentity.ts';
import type ObservationCustodyPage from '../../src/domain/services/custody/ObservationCustodyPage.ts';
import { buildWriteAttemptRef } from '../../src/domain/utils/WriteAttemptRefLayout.ts';
import type ObservationCustodyPort from '../../src/ports/ObservationCustodyPort.ts';
import FaultingObservationCustody from './FaultingObservationCustody.ts';
import { git } from './WarpWriteFixture.ts';

/** Captures exact pre-settlement journal refs so a test can restore the state left by interrupted cleanup. */
export default class WriteAttemptJournalCapture extends FaultingObservationCustody {
  readonly records = new Map<string, string>();
  readonly #path: string;
  readonly #graph: string;

  constructor(custody: ObservationCustodyPort, path: string, graph: string) {
    super(custody);
    this.#path = path;
    this.#graph = graph;
  }

  override async settle(identity: ObservationCustodyIdentity, page: ObservationCustodyPage): Promise<CustodyTransition> {
    const ref = buildWriteAttemptRef(this.#graph, identity.attemptId.value);
    this.records.set(ref, git(this.#path, ['rev-parse', ref]));
    return await super.settle(identity, page);
  }
}
