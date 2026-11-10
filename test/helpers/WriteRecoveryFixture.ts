import type ObservationCustodyService from '../../src/domain/services/custody/ObservationCustodyService.ts';
import ConeWriteRecovery from '../../src/domain/services/write/ConeWriteRecovery.ts';
import ConeWriteSettlement from '../../src/domain/services/write/ConeWriteSettlement.ts';
import WritePublicationProbe, { type WritePublicationHistory } from '../../src/domain/services/write/WritePublicationProbe.ts';
import GitWriteAttemptJournalAdapter from '../../src/infrastructure/adapters/GitWriteAttemptJournalAdapter.ts';
import ObservationCustodyCborCodec from '../../src/infrastructure/adapters/ObservationCustodyCborCodec.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import codec from '../../src/infrastructure/codecs/CborCodec.ts';
import InMemoryGraphAdapter from './InMemoryGraphAdapter.ts';

/** Real write recovery services over an owned in-memory journal and the supplied custody service. */
export default class WriteRecoveryFixture {
  readonly history = new InMemoryGraphAdapter({ clock: { now: () => 1 } });
  readonly journal = new GitWriteAttemptJournalAdapter({
    graph: 'g', history: this.history, codec, custodyCodec: new ObservationCustodyCborCodec(codec),
  });
  readonly probe = new WritePublicationProbe({ graph: 'g', history: writerChainOf(this.history), messages: DEFAULT_COMMIT_MESSAGE_CODEC });
  readonly settlement: ConeWriteSettlement;
  readonly recovery: ConeWriteRecovery;

  constructor(custody: ObservationCustodyService) {
    this.settlement = new ConeWriteSettlement({ graph: 'g', custody, journal: this.journal });
    this.recovery = new ConeWriteRecovery({
      graph: 'g', custody, journal: this.journal, probe: this.probe, settlement: this.settlement, clock: () => 1,
    });
  }
}

/**
 * The in-memory history as a probe reads it. Its `logNodes` ignores the requested format, so
 * the first-parent range is walked here one commit at a time: the reference a single
 * `git log --first-parent stopAt..tip` must agree with.
 */
function writerChainOf(history: InMemoryGraphAdapter): WritePublicationHistory {
  return {
    readRef: (ref) => history.readRef(ref),
    getNodeInfo: (sha) => history.getNodeInfo(sha),
    firstParentsSince: async ({ tip, stopAt, limit }) => {
      const listed: string[] = [];
      let next: string | null = tip;
      while (next !== null && next !== stopAt && listed.length < limit) {
        listed.push(next);
        next = (await history.getNodeInfo(next)).parents[0] ?? null;
      }
      return listed;
    },
  };
}
