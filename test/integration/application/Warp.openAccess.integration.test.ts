import { afterEach, describe, expect, it } from 'vitest';
import { intent } from '../../../advanced.ts';
import { WarpAccessDenied, WarpAccessPort, type WarpWriteGrant } from '../../../index.ts';
import type LogFields from '../../../src/domain/types/log/LogFields.ts';
import LoggerPort from '../../../src/ports/LoggerPort.ts';
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

/** Keeps every warning it is given. */
class RecordingLogger extends LoggerPort {
  readonly warnings: string[] = [];

  override debug(): void {}
  override info(): void {}
  override error(): void {}
  override warn(message: string): void {
    this.warnings.push(message);
  }
  override child(_context: LogFields): LoggerPort {
    return this;
  }
}

/** Every ref and the object it names, so any mutation shows. */
function refs(path: string): string {
  return git(path, ['for-each-ref', '--format=%(refname) %(objectname)']);
}

const HOUR = 60 * 60 * 1000;

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

    expect(git(replica, ['for-each-ref', '--format=%(refname)']).split('\n').filter((ref) => ref.includes('write-attempts'))).toEqual([]);
    const warp = await open(replica);
    retained(await warp.as('bob').execute(intent.node.add({ subject: 'second' })));
    expect(attemptRefs(replica)).toEqual([]);
    expect(attemptRefs(origin)).toHaveLength(1);
  });
});

describe('the removal policy reaches the configured logger (#1078)', () => {
  it('warns when a removed node still has attached data', async () => {
    const path = await repository();
    const logger = new RecordingLogger();
    const warp = await open(path, { logger });

    retained(await warp.as('alice').execute(intent.entity.add({ subject: 'n', properties: { color: 'red' } })));
    retained(await warp.as('alice').execute(intent.node.remove({ subject: 'n' })));

    expect(logger.warnings).toHaveLength(1);
    expect(logger.warnings[0]).toContain("Deleting node 'n' which has attached data");
  });
});
