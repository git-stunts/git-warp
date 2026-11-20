import { afterEach, describe, expect, it, vi } from 'vitest';
import { intent } from '../../../advanced.ts';
import { GitStorage, ObserverIdentity, Optic, Purpose, type WarpAccessDenied, type WarpReadGrant, type WarpReadRequest } from '../../../index.ts';
import OpticObservation from '../../../src/domain/api/OpticObservation.ts';
import GitCasMaterializationStoreAdapter from '../../../src/infrastructure/adapters/GitCasMaterializationStoreAdapter.ts';
import GitCasRepositoryAdapter from '../../../src/infrastructure/adapters/GitCasRepositoryAdapter.ts';
import GitConeRecordStoreAdapter from '../../../src/infrastructure/adapters/GitConeRecordStoreAdapter.ts';
import CallLatch from '../../helpers/CallLatch.ts';
import { TestAccess, disposeWarpFixtures, git, open, repository } from '../../helpers/WarpWriteFixture.ts';

const OBSERVER = ObserverIdentity.of('person', 'reader');
const PURPOSE = Purpose.of('todos', 'display', 1);

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await disposeWarpFixtures();
});

describe('Warp read resource ownership', () => {
  it('leaves the repository and storage services untouched when access denies a read', async () => {
    const path = await repository();
    const before = git(path, ['for-each-ref', '--format=%(refname) %(objectname)']);
    const services = vi.spyOn(GitCasRepositoryAdapter.prototype, 'createRuntimeStorageServices');
    const warp = await open(path, {}, new TestAccess(['reader']));
    const observation = await Optic(warp.forObserver(OBSERVER)).forPurpose(PURPOSE).node('todo').read();

    expect((await observation.receipt).status).toBe('refused');
    expect(services).not.toHaveBeenCalled();
    expect(git(path, ['for-each-ref', '--format=%(refname) %(objectname)'])).toBe(before);
  });

  it('opens one read service, reuses it, and closes it once without write custody', async () => {
    const path = await repository();
    const services = vi.spyOn(GitCasRepositoryAdapter.prototype, 'createRuntimeStorageServices');
    const close = vi.spyOn(GitCasMaterializationStoreAdapter.prototype, 'close');
    const warp = await open(path, { wrapCustody: () => { throw new Error('reads must not open custody'); } });
    const query = Optic(warp.forObserver(OBSERVER)).forPurpose(PURPOSE).node('todo');

    expect((await (await query.read()).receipt).status).toBe('completed');
    expect((await (await query.read()).receipt).status).toBe('completed');
    expect(services).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();
    await Promise.all([warp.close(), warp.close()]);
    expect(close).toHaveBeenCalledOnce();
  });

  it('keeps read services alive when opening write custody fails', async () => {
    const warp = await open(await repository(), { wrapCustody: () => { throw new Error('custody failed'); } });
    const services = vi.spyOn(GitCasRepositoryAdapter.prototype, 'createRuntimeStorageServices');
    const close = vi.spyOn(GitCasMaterializationStoreAdapter.prototype, 'close');
    const query = Optic(warp.forObserver(OBSERVER)).forPurpose(PURPOSE).node('todo');
    expect((await (await query.read()).receipt).status).toBe('completed');
    const readServices = await services.mock.results[0]?.value;
    expect(readServices).toBeDefined();

    await expect(warp.as('alice').execute(intent.node.add({ subject: 'todo' }))).rejects.toThrow('custody failed');

    expect(services).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledOnce();
    expect(close.mock.contexts).not.toContain(readServices?.materializations);
    expect((await (await query.read()).receipt).status).toBe('completed');
    await warp.close();
    expect(close.mock.contexts.filter((owner) => owner === readServices?.materializations)).toHaveLength(1);
  });

  it('waits for a pending record read before closing storage and emits no late reading', async () => {
    const warp = await open(await repository());
    const observation = await Optic(warp.forObserver(OBSERVER)).forPurpose(PURPOSE).node('todo').read();
    const latch = new CallLatch('before');
    const readRecords = GitConeRecordStoreAdapter.prototype.readRecords;
    vi.spyOn(GitConeRecordStoreAdapter.prototype, 'readRecords').mockImplementation(async function (this: GitConeRecordStoreAdapter, root, keys) {
      return await latch.through(async () => await readRecords.call(this, root, keys));
    });
    const closeStorage = vi.spyOn(GitStorage.prototype, 'close');
    const next = observation[Symbol.asyncIterator]().next();
    await latch.arrived();
    vi.useFakeTimers();
    const closing = warp.close();
    try {
      await vi.runAllTimersAsync();
      expect(closeStorage).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      latch.release();
      await Promise.allSettled([next, closing]);
    }
    expect(await next).toEqual({ done: true, value: undefined });
    expect(closeStorage).toHaveBeenCalledOnce();
    expect(await observation.receipt).toMatchObject({ status: 'cancelled', records: 1 });
  });

  it('does not hold a read that settled before it returned, so close leaves it alone', async () => {
    const warp = await open(await repository(), {}, new TestAccess(['reader']));
    const refused = await Optic(warp.forObserver(OBSERVER)).forPurpose(PURPOSE).node('todo').read();
    // A refusal settles while read() builds it. Close cancels only the reads the Warp still holds.
    const cancel = vi.spyOn(OpticObservation.prototype, 'cancel');

    await warp.close();

    expect(cancel).not.toHaveBeenCalled();
    expect((await refused.receipt).status).toBe('refused');
  });

  it('cancels a read whose access decision was still pending when close began, and waits for it', async () => {
    const latch = new CallLatch('before');
    const slow = new (class extends TestAccess {
      override async authorizeRead(request: WarpReadRequest): Promise<WarpReadGrant | WarpAccessDenied> {
        return await latch.through(async () => await super.authorizeRead(request));
      }
    })();
    const warp = await open(await repository(), {}, slow);
    const reading = Optic(warp.forObserver(OBSERVER)).forPurpose(PURPOSE).node('todo').read();
    await latch.arrived();
    let closed = false;
    vi.useFakeTimers();
    const closing = warp.close().then(() => { closed = true; });
    try {
      await vi.runAllTimersAsync();
      expect(closed).toBe(false);
    } finally {
      vi.useRealTimers();
      latch.release();
    }

    const observation = await reading;
    await closing;

    expect(await observation.receipt).toMatchObject({ status: 'cancelled', records: 0 });
  });
});
