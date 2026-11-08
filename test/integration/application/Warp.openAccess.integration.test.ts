import { afterEach, describe, expect, it } from 'vitest';
import { intent } from '../../../advanced.ts';
import { WarpAccessDenied, WarpAccessPort, type WarpWriteGrant } from '../../../index.ts';
import type ObservationCustodyPort from '../../../src/ports/ObservationCustodyPort.ts';
import {
  attemptRefs,
  crashingAt,
  disposeWarpFixtures,
  git,
  open,
  repository,
  retained,
  unpublished,
} from '../../helpers/WarpWriteFixture.ts';

afterEach(async () => {
  await disposeWarpFixtures();
});

/** Denies every operation, as an opener with no rights would be. */
class DenyAll extends WarpAccessPort {
  asked = 0;

  override authorizeWrite(): Promise<WarpWriteGrant | WarpAccessDenied> {
    this.asked += 1;
    return Promise.resolve(new WarpAccessDenied('no rights here'));
  }
}

/** Every ref and the object it names, so any mutation shows. */
function refs(path: string): string {
  return git(path, ['for-each-ref', '--format=%(refname) %(objectname)']);
}

const HOUR = 60 * 60 * 1000;

/** Refs a wildcard fetch brought that name in-flight state: attempts or support under construction. */
function inFlight(path: string): string[] {
  return git(path, ['for-each-ref', '--format=%(refname)']).split('\n').filter((ref) => ref.includes('write-attempts') || ref.includes('/construction/'));
}

/** Custody that runs `during` just before it records a preparation, while the write is in flight. */
function duringPrepare(during: () => void): (custody: ObservationCustodyPort) => ObservationCustodyPort {
  return (custody) => new Proxy(custody, {
    get(target: ObservationCustodyPort, name: string | symbol) {
      if (name === 'prepare') {
        return async (...args: Parameters<ObservationCustodyPort['prepare']>) => {
          during();
          return await target.prepare(...args);
        };
      }
      const value = Reflect.get(target, name) as unknown;
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

describe('Warp.open before any access decision (#1078)', () => {
  it('leaves a fresh repository untouched for a deny-all opener', async () => {
    const path = await repository();
    const access = new DenyAll();

    const warp = await open(path, {}, access);
    expect(unpublished(await warp.as('alice').execute(intent.node.add({ subject: 'x' }))).cause).toBe('access-denied: no rights here');
    expect(await warp.as('alice').reconcile('a'.repeat(32))).toBeNull();
    expect(await warp.as('alice').stage('hello')).toBeInstanceOf(WarpAccessDenied);
    await warp.close();

    expect(access.asked).toBe(3);
    expect(refs(path)).toBe('');
  });

  it('neither sweeps attempts nor touches custody for a deny-all opener', async () => {
    const path = await repository();
    let now = 1_000;
    const clock = (): number => now;
    const crashed = await open(path, { clock, wrapCustody: crashingAt('arm') });
    unpublished(await crashed.as('alice').execute(intent.node.add({ subject: 'never' })));
    await crashed.close();
    now += 2 * HOUR;
    const before = refs(path);
    expect(attemptRefs(path)).toHaveLength(1);

    const denied = await open(path, { clock }, new DenyAll());
    unpublished(await denied.as('alice').execute(intent.node.add({ subject: 'x' })));
    await denied.close();

    expect(refs(path)).toBe(before);
    const granted = await open(path, { clock });
    retained(await granted.as('alice').execute(intent.node.add({ subject: 'y' })));
    expect(attemptRefs(path)).toEqual([]);
  });
});

describe('write attempts stay with their clone (#1078)', () => {
  it('does not copy an in-flight attempt through a wildcard WARP fetch', async () => {
    const origin = await repository();
    const first = await open(origin);
    retained(await first.as('alice').execute(intent.node.add({ subject: 'first' })));
    await first.close();
    const crashed = await open(origin, { wrapCustody: crashingAt('arm') });
    unpublished(await crashed.as('alice').execute(intent.node.add({ subject: 'never' })));
    await crashed.close();
    expect(attemptRefs(origin)).toHaveLength(1);

    const replica = await repository();
    git(replica, ['fetch', '-q', origin, 'refs/warp/*:refs/warp/*']);

    expect(inFlight(replica)).toEqual([]);
    const warp = await open(replica);
    retained(await warp.as('bob').execute(intent.node.add({ subject: 'second' })));
    expect(attemptRefs(replica)).toEqual([]);
    expect(attemptRefs(origin)).toHaveLength(1);
  });

  it('copies nothing of a write in flight through a wildcard WARP fetch', async () => {
    const origin = await repository();
    const replica = await repository();
    const first = await open(origin);
    retained(await first.as('alice').execute(intent.node.add({ subject: 'first' })));
    await first.close();
    let local: string[] = [];
    const warp = await open(origin, {
      wrapCustody: duringPrepare(() => {
        local = inFlight(origin);
        git(replica, ['fetch', '-q', origin, 'refs/warp/*:refs/warp/*']);
      }),
    });

    retained(await warp.as('alice').execute(intent.node.add({ subject: 'second' })));

    expect(local.some((ref) => ref.includes('/construction/'))).toBe(true);
    expect(local.some((ref) => ref.includes('write-attempts'))).toBe(true);
    expect(inFlight(replica)).toEqual([]);
  });
});
