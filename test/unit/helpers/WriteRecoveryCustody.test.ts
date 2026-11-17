import { describe, expect, it } from 'vitest';
import CustodyIndeterminate from '../../../src/domain/services/custody/CustodyIndeterminate.ts';
import CustodyRefused from '../../../src/domain/services/custody/CustodyRefused.ts';
import ObservationCustodyIdentity from '../../../src/domain/services/custody/ObservationCustodyIdentity.ts';
import ObservationCustodyPage from '../../../src/domain/services/custody/ObservationCustodyPage.ts';
import ObservationCustodyRoots from '../../../src/domain/services/custody/ObservationCustodyRoots.ts';
import { FIXTURE_ATTEMPT, FIXTURE_DIGEST } from '../../helpers/ObservationCustodyFixture.ts';
import { ScriptedCustody } from '../../helpers/ScriptedObservationPorts.ts';
import WriteRecoveryCustody from '../../helpers/WriteRecoveryCustody.ts';

describe('WriteRecoveryCustody', () => {
  it.each([new CustodyRefused('settlement-mismatch'), new CustodyIndeterminate(new Error('lost'))])(
    'injects %o before storage changes, leaving the original port usable', async (answer) => {
      const inner = new ScriptedCustody();
      const faulted = new WriteRecoveryCustody(inner, { settle: () => answer });
      const identity = new ObservationCustodyIdentity(FIXTURE_ATTEMPT, FIXTURE_DIGEST);
      const page = new ObservationCustodyPage(Uint8Array.of(1), new ObservationCustodyRoots([], []));

      expect(await faulted.settle(identity, page)).toBe(answer);
      expect(inner.pages).toEqual([]);
      expect(await new WriteRecoveryCustody(inner, {}).settle(identity, page)).toEqual(inner.settled);
      expect(inner.pages).toEqual([page]);
    },
  );
});
