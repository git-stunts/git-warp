import { describe, expect, it } from 'vitest';
import IndeterminateWriteReceipt from '../../../src/domain/api/IndeterminateWriteReceipt.ts';
import UnpublishedWriteReceipt from '../../../src/domain/api/UnpublishedWriteReceipt.ts';
import ObservationCustodyService from '../../../src/domain/services/custody/ObservationCustodyService.ts';
import ObservationPreparation from '../../../src/domain/services/custody/ObservationPreparation.ts';
import { UNARMED_ATTEMPT_GRACE_MS } from '../../../src/domain/services/write/ConeWriteRecovery.ts';
import WriteAttemptRecord from '../../../src/domain/services/write/WriteAttemptRecord.ts';
import { buildWriterRef } from '../../../src/domain/utils/RefLayout.ts';
import NodeCryptoAdapter from '../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import ObservationCustodyCborCodec from '../../../src/infrastructure/adapters/ObservationCustodyCborCodec.ts';
import codec from '../../../src/infrastructure/codecs/CborCodec.ts';
import { FIXTURE_ATTEMPT, writeBindings } from '../../helpers/ObservationCustodyFixture.ts';
import { ScriptedCustody, ScriptedSupport } from '../../helpers/ScriptedObservationPorts.ts';
import WriteRecoveryFixture from '../../helpers/WriteRecoveryFixture.ts';

describe('WriteRecoveryFixture fixed clocks', () => {
  it.each([
    { age: 0, type: IndeterminateWriteReceipt, outcome: { requirement: 'attempt-in-progress' }, remaining: 1 },
    { age: UNARMED_ATTEMPT_GRACE_MS, type: UnpublishedWriteReceipt, outcome: { cause: 'attempt-cancelled' }, remaining: 0 },
  ])('keeps an unarmed attempt until its grace expires (age $age)', async ({ age, type, outcome, remaining }) => {
    const custody = new ObservationCustodyService({
      custody: new ScriptedCustody(), support: new ScriptedSupport(), codec: new ObservationCustodyCborCodec(codec),
      crypto: new NodeCryptoAdapter(), attempts: { next: () => FIXTURE_ATTEMPT },
    });
    const fixture = new WriteRecoveryFixture(custody);
    const predecessor = await fixture.history.commitNode({ message: 'prior publication' });
    await fixture.history.updateRef(buildWriterRef('g', 'writer-1'), predecessor);
    const record = new WriteAttemptRecord({
      preparation: new ObservationPreparation(FIXTURE_ATTEMPT, writeBindings(fixture.history.emptyTree, predecessor)),
      admission: 'derived', races: [], occurrences: [], savedAt: 1 - age,
    });
    await fixture.journal.save(record);

    const receipt = await fixture.recovery.reconcile('writer-1', FIXTURE_ATTEMPT.value);

    expect(receipt).toBeInstanceOf(type);
    expect(receipt).toMatchObject(outcome);
    expect((await fixture.journal.list(4)).records).toHaveLength(remaining);
    expect(await fixture.history.readRef(buildWriterRef('g', 'writer-1'))).toBe(predecessor);
    expect((await fixture.history.getNodeInfo(predecessor)).date).toBe('1970-01-01T00:00:00.001Z');
  });
});
