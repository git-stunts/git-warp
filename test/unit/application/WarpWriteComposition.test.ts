import { afterEach, describe, expect, it, vi } from 'vitest';
import { intent } from '../../../advanced.ts';
import { WARP_SUPPORT_LIMITS } from '../../../src/application/WarpWriteComposition.ts';
import WriterFrontierLimit from '../../../src/domain/services/write/WriterFrontierLimit.ts';
import GitWritePublicationHistoryAdapter from '../../../src/infrastructure/adapters/GitWritePublicationHistoryAdapter.ts';
import * as fixture from '../../helpers/WarpWriteFixture.ts';

/** A fixed composition clock: no write here may depend on host time. */
const CLOCK = (): number => 1_000;

afterEach(async () => {
  vi.restoreAllMocks();
  await fixture.disposeWarpFixtures();
});

describe('Warp write composition (#1075)', () => {
  it('checks every write against the 4,096-writer frontier limit', async () => {
    const refusal = vi.spyOn(WriterFrontierLimit.prototype, 'refusal');
    const warp = await fixture.open(await fixture.repository(), { clock: CLOCK });

    fixture.retained(await warp.as('alice').execute(intent.node.add({ subject: 'n' })));

    expect(refusal).toHaveBeenCalledWith('alice', expect.anything());
    expect(refusal.mock.contexts.map((limit) => limit instanceof WriterFrontierLimit && limit.writers))
      .toEqual([WARP_SUPPORT_LIMITS.writers]);
  });

  it('proves a publication through the Git publication history adapter', async () => {
    const getNodeInfo = vi.spyOn(GitWritePublicationHistoryAdapter.prototype, 'getNodeInfo');
    const path = await fixture.repository();
    const warp = await fixture.open(path, { clock: CLOCK });

    fixture.retained(await warp.as('alice').execute(intent.node.add({ subject: 'n' })));

    expect(getNodeInfo).toHaveBeenCalledWith(fixture.tip(path, 'alice'));
  });
});
