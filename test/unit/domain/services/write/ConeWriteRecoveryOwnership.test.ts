import { describe, expect, it } from 'vitest';
import UnsupportedWriteAttemptLayoutError from '../../../../../src/domain/errors/UnsupportedWriteAttemptLayoutError.ts';
import PersistenceError from '../../../../../src/domain/errors/PersistenceError.ts';
import ObservationAttemptId from '../../../../../src/domain/services/custody/ObservationAttemptId.ts';
import ObservationCustodyService from '../../../../../src/domain/services/custody/ObservationCustodyService.ts';
import ObservationPreparation from '../../../../../src/domain/services/custody/ObservationPreparation.ts';
import NodeCryptoAdapter from '../../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import ObservationCustodyCborCodec from '../../../../../src/infrastructure/adapters/ObservationCustodyCborCodec.ts';
import codec from '../../../../../src/infrastructure/codecs/CborCodec.ts';
import MeteredObservationCustody from '../../../../helpers/MeteredObservationCustody.ts';
import { writeBindings } from '../../../../helpers/ObservationCustodyFixture.ts';
import { ScriptedCustody, ScriptedSupport } from '../../../../helpers/ScriptedObservationPorts.ts';
import WriteRecoveryFixture from '../../../../helpers/WriteRecoveryFixture.ts';

const ATTEMPT = 'a'.repeat(32);
const REF = `refs/warp-local/g/write-attempts/${ATTEMPT}`;

function recovery(): { readonly fixture: WriteRecoveryFixture; readonly transitions: string[] } {
  const transitions: string[] = [];
  const custody = new ObservationCustodyService({
    custody: new MeteredObservationCustody(new ScriptedCustody(), (operation, side) => transitions.push(`${operation}:${side}`)),
    support: new ScriptedSupport(), codec: new ObservationCustodyCborCodec(codec), crypto: new NodeCryptoAdapter(),
    attempts: { next: () => new ObservationAttemptId(ATTEMPT) },
  });
  return { fixture: new WriteRecoveryFixture(custody), transitions };
}

describe('reconciling an attempt saved in a layout this build cannot read', () => {
  async function unsupported(version: number): Promise<ReturnType<typeof recovery>> {
    const built = recovery();
    const bytes = codec.encode({
      version,
      preparation: new ObservationCustodyCborCodec(codec).encodePreparation(new ObservationPreparation(
        new ObservationAttemptId(ATTEMPT), writeBindings('c'.repeat(40)),
      )),
    });
    await built.fixture.history.updateRef(REF, await built.fixture.history.writeBlob(bytes));
    return built;
  }

  it('answers null to any other writer, so the refusal reveals nothing of another writer\'s attempt', async () => {
    const { fixture, transitions } = await unsupported(1);

    await expect(fixture.recovery.reconcile('mallory', ATTEMPT)).resolves.toBeNull();
    expect(transitions).toEqual([]);
    expect(await fixture.history.readRef(REF)).not.toBeNull();
  });

  it('refuses its own writer with the error that names the ref', async () => {
    const { fixture, transitions } = await unsupported(1);

    await expect(fixture.recovery.reconcile('writer-1', ATTEMPT)).rejects.toThrow(UnsupportedWriteAttemptLayoutError);
    expect(transitions).toEqual([]);
  });

  it('refuses every writer when the record names no writer it can read, since none can be proved foreign', async () => {
    const { fixture, transitions } = recovery();
    await fixture.history.updateRef(REF, await fixture.history.writeBlob(codec.encode({ version: 3 })));

    await expect(fixture.recovery.reconcile('mallory', ATTEMPT)).rejects.toThrow(UnsupportedWriteAttemptLayoutError);
    await expect(fixture.recovery.reconcile('alice', ATTEMPT)).rejects.toThrow(UnsupportedWriteAttemptLayoutError);
    expect(transitions).toEqual([]);
  });

  it('lets any other read failure through, whoever asks', async () => {
    const { fixture, transitions } = recovery();
    await fixture.history.updateRef(REF, 'f'.repeat(40));

    await expect(fixture.recovery.reconcile('mallory', ATTEMPT)).rejects.toThrow(PersistenceError);
    expect(transitions).toEqual([]);
    expect(await fixture.history.readRef(REF)).toBe('f'.repeat(40));
  });
});
