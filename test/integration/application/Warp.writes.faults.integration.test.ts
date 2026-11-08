import { afterEach, describe, expect, it, vi } from 'vitest';
import { intent } from '../../../advanced.ts';
import { Coordinate, GitStorage, UnretainedWriteReceipt, Warp, WarpAccessDenied, WarpAccessPort, WarpAddress, WarpWriteGrant } from '../../../index.ts';
import { composeWarpWrites, overrideWarpComposition } from '../../../src/application/WarpWriteComposition.ts';
import ConeRecordKey from '../../../src/domain/services/cone/ConeRecordKey.ts';
import ConeWriteBasis from '../../../src/domain/services/cone/ConeWriteBasis.ts';
import CustodyIndeterminate from '../../../src/domain/services/custody/CustodyIndeterminate.ts';
import CustodyRefused from '../../../src/domain/services/custody/CustodyRefused.ts';
import ObservationCoordinate from '../../../src/domain/services/custody/ObservationCoordinate.ts';
import ResolvedObservation from '../../../src/domain/services/custody/ResolvedObservation.ts';
import ObservationAttemptId from '../../../src/domain/services/custody/ObservationAttemptId.ts';
import { textDecode } from '../../../src/domain/utils/bytes.ts';
import { buildWriterRef } from '../../../src/domain/utils/RefLayout.ts';
import GitCasRepositoryAdapter from '../../../src/infrastructure/adapters/GitCasRepositoryAdapter.ts';
import GitTimelineHistoryAdapter from '../../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import GitWriteAttemptJournalAdapter from '../../../src/infrastructure/adapters/GitWriteAttemptJournalAdapter.ts';
import type ObservationCustodyPort from '../../../src/ports/ObservationCustodyPort.ts';
import {
  GRAPH,
  TestAccess,
  attemptRefs,
  disposeWarpFixtures,
  git,
  indeterminate,
  materialized,
  open,
  repository,
  retained,
  tip,
  unpublished,
} from '../../helpers/WarpWriteFixture.ts';

afterEach(async () => {
  vi.restoreAllMocks();
  await disposeWarpFixtures();
});

/** Replaces custody port methods; everything else reaches the real adapter. */
function custodyWith(replaced: Readonly<Record<string, () => Promise<object>>>): (custody: ObservationCustodyPort) => ObservationCustodyPort {
  return (custody) => new Proxy(custody, {
    get(target: ObservationCustodyPort, name: string | symbol) {
      const replacement = typeof name === 'string' ? replaced[name] : undefined;
      if (replacement !== undefined) {
        return replacement;
      }
      const value = Reflect.get(target, name) as unknown;
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

const unavailable = (): Promise<CustodyIndeterminate> => Promise.resolve(new CustodyIndeterminate(new Error('store went away')));

describe('a retained write survives what the graph does later', () => {
  it('resolves its original evidence after its cone refs are gone and Git collected garbage', async () => {
    const path = await repository();
    const first = await open(path);
    const receipt = retained(await first.as('alice').execute(intent.node.add({ subject: 'kept' })));
    retained(await first.as('alice').execute(intent.node.add({ subject: 'later' })));
    await first.close();
    git(path, ['update-ref', '-d', `refs/warp/${GRAPH}/cone/head`]);
    git(path, ['gc', '--prune=now', '--quiet']);

    const access = new TestAccess();
    const writes = await composeWarpWrites(WarpAddress.of(GitStorage.at(path), GRAPH), access);
    const parsed = ObservationCoordinate.parse(receipt.coordinate.toString());
    const resolved = parsed === null ? null : await writes.custody.resolve(parsed);
    await writes.close();

    expect(resolved).toBeInstanceOf(ResolvedObservation);
    const original = resolved instanceof ResolvedObservation ? resolved : null;
    expect(original?.preparation.bindings.writePremise?.writerId).toBe('alice');
    expect(original?.preparation.bindings.writePremise?.predecessor).toBeNull();
    expect(original?.preparation.bindings.observer).toBe('writer:alice');
    expect(original?.record.publication?.commit).toBe(receipt.publication.toString());
    expect(textDecode(original?.core() ?? new Uint8Array())).toContain(receipt.publication.toString());
  });

  it('binds the basis it read, not a newer one', async () => {
    const path = await repository();
    const warp = await open(path);
    retained(await warp.as('bob').execute(intent.node.add({ subject: 'before' })));
    const basisAtWrite = git(path, ['rev-parse', `refs/warp/${GRAPH}/cone/head`]);
    const receipt = retained(await warp.as('alice').execute(intent.node.add({ subject: 'mine' })));
    retained(await warp.as('bob').execute(intent.node.add({ subject: 'after' })));
    await warp.close();

    const writes = await composeWarpWrites(WarpAddress.of(GitStorage.at(path), GRAPH), new TestAccess());
    const parsed = ObservationCoordinate.parse(receipt.coordinate.toString());
    const resolved = parsed === null ? null : await writes.custody.resolve(parsed);
    await writes.close();

    expect(resolved instanceof ResolvedObservation ? resolved.preparation.bindings.basis : null).toBe(basisAtWrite);
  });
});

describe('current authority', () => {
  it('cancels a write whose authority was revoked before it could arm', async () => {
    const path = await repository();
    const access = new TestAccess();
    let calls = 0;
    const revoking = new (class extends WarpAccessPort {
      override authorizeWrite(request: Parameters<WarpAccessPort['authorizeWrite']>[0]): ReturnType<WarpAccessPort['authorizeWrite']> {
        calls += 1;
        if (calls === 2) {
          access.denied.add(request.writer);
        }
        return access.authorizeWrite(request);
      }
    })();
    const warp = await open(path, { limit: 1 }, revoking);

    expect(unpublished(await warp.as('alice').execute(intent.node.add({ subject: 'x' }))).cause).toContain('access-denied');
    expect(tip(path, 'alice')).toBeNull();
    expect(attemptRefs(path)).toEqual([]);
    access.denied.clear();
    retained(await warp.as('alice').execute(intent.node.add({ subject: 'fits' })));
  });

  it('tells another or a denied writer nothing about an attempt', async () => {
    const path = await repository();
    const access = new TestAccess();
    const warp = await open(path, {}, access);
    retained(await warp.as('alice').execute(intent.node.add({ subject: 'first' })));
    const { CborPatchJournalAdapter } = await import('../../../src/infrastructure/adapters/CborPatchJournalAdapter.ts');
    vi.spyOn(CborPatchJournalAdapter.prototype, 'appendPatch').mockRejectedValueOnce(new Error('disk went away'));
    const { attempt } = indeterminate(await warp.as('alice').execute(intent.node.add({ subject: 'second' })));

    expect(await warp.as('bob').reconcile(attempt)).toBeNull();
    expect(await warp.as('alice').reconcile('f'.repeat(32))).toBeNull();
    access.denied.add('alice');
    expect(await warp.as('alice').reconcile(attempt)).toBeNull();
    expect(attemptRefs(path)).toHaveLength(1);
  });
});

describe('stage', () => {
  it('asks the access boundary, and stays within the budget', async () => {
    const path = await repository();
    const access = new TestAccess(['mallory']);
    const warp = await open(path, {}, access);

    expect(await warp.as('mallory').stage('hello')).toBeInstanceOf(WarpAccessDenied);
    expect(await warp.as('alice').stage('x'.repeat(2 * 1024 * 1024))).toMatchObject({ cause: 'budget-exhausted' });
    expect(await warp.as('alice').stage('hello')).not.toBeInstanceOf(WarpAccessDenied);
  });
});

describe('an access port that misbehaves', () => {
  it('treats anything but a real grant as a denial', async () => {
    const path = await repository();
    const confused = new (class extends WarpAccessPort {
      override authorizeWrite(): ReturnType<WarpAccessPort['authorizeWrite']> {
        return Promise.resolve({ authority: 'looks right' } as unknown as WarpWriteGrant);
      }
    })();
    const warp = await open(path, {}, confused);

    expect(unpublished(await warp.as('alice').execute(intent.node.add({ subject: 'x' }))).cause).toContain('no grant');
    expect(await warp.as('alice').stage('hello')).toBeInstanceOf(WarpAccessDenied);
    expect(await warp.as('alice').reconcile('f'.repeat(32))).toBeNull();
    expect(tip(path, 'alice')).toBeNull();
  });

  it('stops the attempt when it throws at the recheck, freeing the slot', async () => {
    const path = await repository();
    const access = new TestAccess();
    let calls = 0;
    const throwing = new (class extends WarpAccessPort {
      override authorizeWrite(request: Parameters<WarpAccessPort['authorizeWrite']>[0]): ReturnType<WarpAccessPort['authorizeWrite']> {
        calls += 1;
        return calls === 2 ? Promise.reject(new Error('boundary went away')) : access.authorizeWrite(request);
      }
    })();
    const warp = await open(path, { limit: 1 }, throwing);

    await expect(warp.as('alice').execute(intent.node.add({ subject: 'x' }))).rejects.toThrow('went away');
    expect(attemptRefs(path)).toEqual([]);
    retained(await warp.as('alice').execute(intent.node.add({ subject: 'fits' })));
  });
});

describe('a grant that changes before publication', () => {
  it('refuses rather than retain the authority it was not admitted under', async () => {
    const path = await repository();
    let authority = 'first';
    const changing = new (class extends WarpAccessPort {
      override authorizeWrite(): Promise<WarpWriteGrant> {
        const grant = new WarpWriteGrant({ authority, budget: { records: 9, bytes: 9999, work: 9 } });
        authority = 'second';
        return Promise.resolve(grant);
      }
    })();
    const warp = await open(path, {}, changing);

    expect(unpublished(await warp.as('alice').execute(intent.node.add({ subject: 'x' }))).cause).toBe('authority-changed');
    expect(tip(path, 'alice')).toBeNull();
    expect(attemptRefs(path)).toEqual([]);
  });
});

describe('custody that cannot answer', () => {
  it('reports unpublished and keeps the record when a reservation is unacknowledged', async () => {
    const path = await repository();
    const warp = await open(path, { wrapCustody: custodyWith({ reserve: unavailable }) });

    expect(unpublished(await warp.as('alice').execute(intent.node.add({ subject: 'x' }))).cause).toBe('retention-unavailable');
    expect(attemptRefs(path)).toHaveLength(1);
    expect(tip(path, 'alice')).toBeNull();
  });

  it('keeps an attempt it cannot read, and frees one old enough only when custody confirms', async () => {
    const path = await repository();
    let now = 1_000;
    const clock = (): number => now;
    const crashed = await open(path, { clock, wrapCustody: custodyWith({ arm: unavailable }) });
    unpublished(await crashed.as('alice').execute(intent.node.add({ subject: 'x' })));
    await crashed.close();
    now += 2 * 60 * 60 * 1000;

    const noReserve = await open(path, { clock, wrapCustody: custodyWith({ reserve: unavailable }) });
    expect(attemptRefs(path)).toHaveLength(1);
    await noReserve.close();
    const noCancel = await open(path, { clock, wrapCustody: custodyWith({ cancel: unavailable }) });
    expect(attemptRefs(path)).toHaveLength(1);
    await noCancel.close();

    await open(path, { clock });
    expect(attemptRefs(path)).toEqual([]);
  });

  it('finishes a saved attempt custody says was cancelled', async () => {
    const path = await repository();
    const crashed = await open(path, { wrapCustody: custodyWith({ arm: unavailable }) });
    unpublished(await crashed.as('alice').execute(intent.node.add({ subject: 'x' })));
    await crashed.close();

    await open(path, { wrapCustody: custodyWith({ reserve: () => Promise.resolve(new CustodyRefused('cancelled')) }) });

    expect(attemptRefs(path)).toEqual([]);
  });

  it('repeats a step only while another participant holds it', async () => {
    const path = await repository();
    let contended = 2;
    const warp = await open(path, {
      wrapCustody: (custody) => new Proxy(custody, {
        get(target: ObservationCustodyPort, name: string | symbol) {
          const value = Reflect.get(target, name) as unknown;
          if (name === 'reserve' && contended > 0) {
            contended -= 1;
            return () => Promise.resolve(new CustodyRefused('contention'));
          }
          return typeof value === 'function' ? value.bind(target) : value;
        },
      }),
    });

    retained(await warp.as('alice').execute(intent.node.add({ subject: 'x' })));
    expect(contended).toBe(0);
  });
});

describe('a store that fails before publication is permitted', () => {
  /** The blob id of the cone record that stores node `subject`, found through Git, not through the adapter. */
  function recordBlob(path: string, subject: string): string {
    const route = ConeRecordKey.forNode(subject).route;
    const line = git(path, ['ls-tree', '-r', `refs/warp/${GRAPH}/cone/head`]).split('\n').find((entry) => entry.endsWith(`/${route}`));
    return line?.split(/\s+/u)[2] ?? '';
  }

  it('returns an unpublished receipt, not a rejection, when the host fails beneath the premise record read', async () => {
    const path = await repository();
    const warp = await open(path);
    retained(await warp.as('alice').execute(intent.node.add({ subject: 'x' })));
    const before = tip(path, 'alice');
    const blob = recordBlob(path, 'x');
    expect(blob).toMatch(/^[0-9a-f]{40}$/u);
    const readBlob = GitTimelineHistoryAdapter.prototype.readBlob;
    let failed = 0;
    vi.spyOn(GitTimelineHistoryAdapter.prototype, 'readBlob').mockImplementation(async function (this: GitTimelineHistoryAdapter, oid: string) {
      if (oid === blob && failed === 0) {
        failed += 1;
        throw new Error('EIO: i/o error, read');
      }
      return await readBlob.call(this, oid);
    });

    const receipt = unpublished(await warp.as('alice').execute(intent.node.remove({ subject: 'x' })));

    expect(failed).toBe(1);
    expect(receipt.cause).toBe('write-premise-unavailable');
    expect(tip(path, 'alice')).toBe(before);
    expect(attemptRefs(path)).toEqual([]);
    retained(await warp.as('alice').execute(intent.node.remove({ subject: 'x' })));
    expect((await materialized(path)).nodes).toEqual([]);
  });

  it('rejects, publishing nothing, when a defect throws while reading the premise records', async () => {
    const path = await repository();
    const warp = await open(path);
    retained(await warp.as('alice').execute(intent.node.add({ subject: 'x' })));
    const before = tip(path, 'alice');
    const defect = new TypeError("Cannot read properties of undefined (reading 'root')");
    vi.spyOn(ConeWriteBasis, 'capture').mockRejectedValueOnce(defect);

    await expect(warp.as('alice').execute(intent.node.remove({ subject: 'x' }))).rejects.toBe(defect);

    expect(tip(path, 'alice')).toBe(before);
    expect(attemptRefs(path)).toEqual([]);
    retained(await warp.as('alice').execute(intent.node.remove({ subject: 'x' })));
  });
});

describe('a record that outlives its attempt', () => {
  it('rebuilds an unretained write, with the entity it admitted, from its saved record', async () => {
    const path = await repository();
    const crashed = await open(path, { wrapCustody: custodyWith({ settle: unavailable }) });
    const receipt = await crashed.as('alice').execute(intent.entity.addAuto({ namespace: 'todo', properties: { title: 'one' } }));
    if (!(receipt instanceof UnretainedWriteReceipt) || receipt.attempt === null) {
      throw new Error('Expected a repeatable unretained receipt');
    }
    await crashed.close();

    const finished = retained(await (await open(path)).as('alice').reconcile(receipt.attempt));

    expect(finished.occurrences).toEqual(receipt.occurrences);
    expect((await materialized(path)).nodes).toEqual([receipt.occurrences[0]?.subject]);
  });

  it('leaves nothing unfinished when a sweep cannot settle a crash nobody holds a receipt for', async () => {
    const path = await repository();
    const crashed = await open(path, { wrapCustody: custodyWith({ settle: unavailable }) });
    const original = GitWriteAttemptJournalAdapter.prototype.save;
    let saves = 0;
    vi.spyOn(GitWriteAttemptJournalAdapter.prototype, 'save').mockImplementation(async function failingSecond(this: GitWriteAttemptJournalAdapter, record) {
      saves += 1;
      if (saves === 2) {
        throw new Error('crash before marking');
      }
      await original.call(this, record);
    });
    await crashed.as('alice').execute(intent.node.add({ subject: 'x' }));
    await crashed.close();
    vi.restoreAllMocks();

    await (await open(path, { wrapCustody: custodyWith({ settle: unavailable }) })).close();
    expect(attemptRefs(path)).toHaveLength(1);
    await open(path);

    expect(attemptRefs(path)).toEqual([]);
  });

  it('answers from custody when the chain no longer shows a settled publication', async () => {
    const path = await repository();
    const warp = await open(path);
    vi.spyOn(GitWriteAttemptJournalAdapter.prototype, 'remove').mockRejectedValueOnce(new Error('ref store went away'));
    const receipt = retained(await warp.as('alice').execute(intent.node.add({ subject: 'x' })));
    const [ref] = attemptRefs(path);
    const attempt = (ref ?? '').split('/').at(-1) ?? '';
    git(path, ['update-ref', '-d', buildWriterRef(GRAPH, 'alice')]);

    const answered = retained(await warp.as('alice').reconcile(attempt));

    expect(answered.publication.toString()).toBe(receipt.publication.toString());
    expect(answered.coordinate.toString()).toBe(receipt.coordinate.toString());
  });

  it('finishes a retained write whose record could not be removed', async () => {
    const path = await repository();
    const warp = await open(path);
    vi.spyOn(GitWriteAttemptJournalAdapter.prototype, 'remove').mockRejectedValueOnce(new Error('ref store went away'));

    retained(await warp.as('alice').execute(intent.node.add({ subject: 'x' })));
    expect(attemptRefs(path)).toHaveLength(1);
    await warp.close();

    await open(path);
    expect(attemptRefs(path)).toEqual([]);
  });

  it('finishes a lost race whose record could not be removed', async () => {
    const path = await repository();
    const rival = await open(path);
    let raced = false;
    const warp = await open(path, {
      attempts: {
        next: () => new ObservationAttemptId(globalThis.crypto.randomUUID().replaceAll('-', '')),
      },
      wrapCustody: (custody) => new Proxy(custody, {
        get(target: ObservationCustodyPort, name: string | symbol) {
          const value = Reflect.get(target, name) as unknown;
          if (name === 'arm' && !raced) {
            raced = true;
            return async (...args: Parameters<ObservationCustodyPort['arm']>) => {
              retained(await rival.as('alice').execute(intent.node.add({ subject: 'rival' })));
              return await target.arm(...args);
            };
          }
          return typeof value === 'function' ? value.bind(target) : value;
        },
      }),
    });
    const original = GitWriteAttemptJournalAdapter.prototype.remove;
    let removals = 0;
    const remove = vi.spyOn(GitWriteAttemptJournalAdapter.prototype, 'remove').mockImplementation(async function failingSecond(this: GitWriteAttemptJournalAdapter, id) {
      removals += 1;
      if (removals === 2) {
        throw new Error('ref store went away');
      }
      await original.call(this, id);
    });

    expect(unpublished(await warp.as('alice').execute(intent.node.add({ subject: 'mine' }))).cause).toBe('stale-predecessor');
    expect(attemptRefs(path)).toHaveLength(1);
    await warp.close();
    await rival.close();
    remove.mockRestore();

    await open(path);
    expect(attemptRefs(path)).toEqual([]);
  });
});

describe('composition', () => {
  it('refuses a graph already opened with another retention capacity, and releases what it opened', async () => {
    const path = await repository();
    await (await open(path, { limit: 3 })).close();

    await expect(open(path, { limit: 4 })).rejects.toMatchObject({ code: 'E_WARP_RETENTION_OPEN' });
  });

  it('requires a storage located by root or at', async () => {
    const path = await repository();
    const located = await GitStorage.open({ cwd: path });
    try {
      await expect(Warp.open(WarpAddress.of(located, GRAPH), new TestAccess())).rejects.toThrow('GitStorage.root');
    } finally {
      await located.close();
    }
  });

  it('keeps operating after one fails, and closes once', async () => {
    const path = await repository();
    const flaky = new (class extends WarpAccessPort {
      failing = true;
      override authorizeWrite(): Promise<WarpWriteGrant> {
        if (this.failing) {
          this.failing = false;
          return Promise.reject(new Error('access boundary went away'));
        }
        return Promise.resolve(new WarpWriteGrant({ authority: 'x', budget: { records: 9, bytes: 9999, work: 9 } }));
      }
    })();
    overrideWarpComposition(flaky, {});
    const warp = await Warp.open(WarpAddress.of(GitStorage.at(path), GRAPH), flaky);

    await expect(warp.as('alice').execute(intent.node.add({ subject: 'x' }))).rejects.toThrow('went away');
    retained(await warp.as('alice').execute(intent.node.add({ subject: 'y' })));
    await Promise.all([warp.close(), warp.close()]);
    expect((await materialized(path)).nodes).toEqual(['y']);
  });

  it('rejects an untyped failure opening a writer, then tries that writer again', async () => {
    const path = await repository();
    const warp = await open(path);
    vi.spyOn(GitCasRepositoryAdapter.prototype, 'createRuntimeStorageServices').mockImplementationOnce(() => Promise.reject(new Error('blip')));

    await expect(warp.as('alice').execute(intent.node.add({ subject: 'x' }))).rejects.toThrow('blip');
    expect(tip(path, 'alice')).toBeNull();
    retained(await warp.as('alice').execute(intent.node.add({ subject: 'y' })));
  });

  it('parses only an exact Coordinate, and validates grants', () => {
    expect(() => Coordinate.parse('nope')).toThrow('not a saved Coordinate');
    expect(() => new WarpWriteGrant({ authority: '', budget: { records: 1, bytes: 1, work: 1 } })).toThrow('finite positive');
    expect(() => new WarpWriteGrant({ authority: 'x', budget: { records: 0, bytes: 1, work: 1 } })).toThrow('finite positive');
    expect(() => new WarpWriteGrant({ authority: 5 as unknown as string, budget: { records: 1, bytes: 1, work: 1 } })).toThrow('finite positive');
    expect(() => new WarpWriteGrant({ authority: 'x' } as unknown as ConstructorParameters<typeof WarpWriteGrant>[0])).toThrow('finite positive');
  });
});
