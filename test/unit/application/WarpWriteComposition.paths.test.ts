import { afterEach, describe, expect, it, vi } from 'vitest';
import { intent } from '../../../advanced.ts';
import { GitStorage, LoggerPort, WarpAddress } from '../../../index.ts';
import {
  composeWarpWrites,
  type WarpCompositionOverrides,
  type WarpWrites,
} from '../../../src/application/WarpWriteComposition.ts';
import StagedContent from '../../../src/domain/api/StagedContent.ts';
import ObservationCustodyService from '../../../src/domain/services/custody/ObservationCustodyService.ts';
import { buildCheckpointRef } from '../../../src/domain/utils/RefLayout.ts';
import GitCasMaterializationStoreAdapter from '../../../src/infrastructure/adapters/GitCasMaterializationStoreAdapter.ts';
import type ObservationCustodyPort from '../../../src/ports/ObservationCustodyPort.ts';
import * as fixture from '../../helpers/WarpWriteFixture.ts';

const STAGED = { content: 'staged text', metadata: undefined };
const compositions: WarpWrites[] = [];

/** Composes one graph's write path directly, on the fixture's fixed clock and the given overrides. */
async function compose(path: string, overrides: WarpCompositionOverrides = {}): Promise<WarpWrites> {
  const access = new fixture.TestAccess();
  fixture.overrideWithFixedClock(access, overrides);
  const writes = await composeWarpWrites({ address: WarpAddress.of(GitStorage.at(path), fixture.GRAPH), access, logger: undefined });
  compositions.push(writes);
  return writes;
}

/** Custody that cannot open its first `failures` times, as a store that is briefly unavailable. */
function unavailableFor(failures: number): (custody: ObservationCustodyPort) => ObservationCustodyPort {
  let remaining = failures;
  return (custody) => {
    if (remaining > 0) {
      remaining -= 1;
      throw new Error('custody unavailable');
    }
    return custody;
  };
}

/** Keeps every warning it is given. */
class RecordingLogger extends LoggerPort {
  readonly warnings: string[] = [];

  override debug(): void {}
  override info(): void {}
  override error(): void {}
  override warn(message: string): void {
    this.warnings.push(message);
  }
  override child(): LoggerPort {
    return this;
  }
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(compositions.splice(0).map(async (writes) => await writes.close()));
  await fixture.disposeWarpFixtures();
});

describe('Warp write composition paths (#1112)', () => {
  it('opens custody once and hands every caller the same service', async () => {
    const writes = await compose(await fixture.repository());

    const first = await writes.openCustody();

    expect(await writes.openCustody()).toBe(first);
  });

  it('opens the write path again after an open that failed', async () => {
    const writes = await compose(await fixture.repository(), { wrapCustody: unavailableFor(1) });
    await expect(writes.openCustody()).rejects.toThrow('custody unavailable');

    const custody = await writes.openCustody();

    expect(custody).toBeInstanceOf(ObservationCustodyService);
  });

  it('releases the storage services of the cone when custody does not open', async () => {
    const closed = vi.spyOn(GitCasMaterializationStoreAdapter.prototype, 'close');
    const writes = await compose(await fixture.repository(), { wrapCustody: unavailableFor(1) });

    await expect(writes.openCustody()).rejects.toThrow('custody unavailable');

    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('refuses to open custody when the graph keeps another retention capacity', async () => {
    const path = await fixture.repository();
    await (await compose(path, { limit: 5 })).openCustody();

    // Oracle: RetentionStoreOpenError documents policy-mismatch for a saved capacity this build does not open with.
    await expect((await compose(path)).openCustody())
      .rejects.toMatchObject({ code: 'E_WARP_RETENTION_OPEN', refusal: 'policy-mismatch' });
  });

  it('opens a writer host again after an open that failed', async () => {
    const path = await fixture.repository();
    const writes = await compose(path);
    // A graph ref with no substrate marker makes every host open refuse until the ref is gone.
    fixture.git(path, ['update-ref', buildCheckpointRef(fixture.GRAPH), fixture.git(path, ['write-tree'])]);
    await expect(writes.stage('alice', STAGED)).rejects.toMatchObject({ code: 'E_SUBSTRATE_MARKER_MISSING' });
    fixture.git(path, ['update-ref', '-d', buildCheckpointRef(fixture.GRAPH)]);

    const staged = await writes.stage('alice', STAGED);

    expect(staged).toBeInstanceOf(StagedContent);
  });

  it('gives each writer host the logger the Warp was opened with', async () => {
    const logger = new RecordingLogger();
    const warp = await fixture.open(await fixture.repository(), {}, new fixture.TestAccess(), { logger });
    fixture.retained(await warp.as('alice').execute(intent.entity.add({ subject: 'n', properties: { color: 'red' } })));

    fixture.retained(await warp.as('alice').execute(intent.node.remove({ subject: 'n' })));

    // Oracle: the default removal policy is `warn` (Warp.open documents the logger hearing it).
    expect(logger.warnings).toEqual([expect.stringContaining("Deleting node 'n' which has attached data")]);
  });
});
