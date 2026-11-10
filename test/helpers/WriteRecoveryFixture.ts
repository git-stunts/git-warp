import type ObservationCustodyService from '../../src/domain/services/custody/ObservationCustodyService.ts';
import ConeWriteRecovery from '../../src/domain/services/write/ConeWriteRecovery.ts';
import ConeWriteSettlement from '../../src/domain/services/write/ConeWriteSettlement.ts';
import WritePublicationProbe from '../../src/domain/services/write/WritePublicationProbe.ts';
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
  readonly probe = new WritePublicationProbe({ graph: 'g', history: this.history, messages: DEFAULT_COMMIT_MESSAGE_CODEC });
  readonly settlement: ConeWriteSettlement;
  readonly recovery: ConeWriteRecovery;

  constructor(custody: ObservationCustodyService) {
    this.settlement = new ConeWriteSettlement({ graph: 'g', custody, journal: this.journal });
    this.recovery = new ConeWriteRecovery({
      graph: 'g', custody, journal: this.journal, probe: this.probe, settlement: this.settlement, clock: () => 1,
    });
  }
}
