import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitRepositoryLockedError } from '@git-stunts/plumbing/errors';
import { intent } from '../../../advanced.ts';
import OperationPolicyExhaustedError from '../../../src/domain/errors/OperationPolicyExhaustedError.ts';
import ObservationAttemptId from '../../../src/domain/services/custody/ObservationAttemptId.ts';
import { buildObservationConstructionRef } from '../../../src/domain/utils/ObservationRefLayout.ts';
import { buildWriteAttemptRef } from '../../../src/domain/utils/WriteAttemptRefLayout.ts';
import GitTimelineHistoryAdapter from '../../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import ObservationAttemptSourcePort from '../../../src/ports/ObservationAttemptSourcePort.ts';
import { GRAPH, attemptRefs, disposeWarpFixtures, git, open, openSwept, repository, retained, tip, unpublished } from '../../helpers/WarpWriteFixture.ts';

afterEach(async () => {
  vi.restoreAllMocks();
  await disposeWarpFixtures();
});

/** The first attempt id is fixed, so a test can name its refs; later ones are fresh. */
const FIRST = '1'.repeat(32);
/** The id of a write made after one other, once the frontier names a writer whose history support must retain. */
const SECOND = '2'.repeat(32);

class FixedAttempts extends ObservationAttemptSourcePort {
  #issued = 0;

  override next(): ObservationAttemptId {
    this.#issued += 1;
    const fixed = [FIRST, SECOND][this.#issued - 1];
    return new ObservationAttemptId(fixed ?? this.#issued.toString(16).padStart(32, '0'));
  }
}

function constructionRefs(path: string): string[] {
  const listed = git(path, ['for-each-ref', '--format=%(refname)', `refs/warp-local/${GRAPH}/observations/construction/`]);
  return listed === '' ? [] : listed.split('\n');
}

/** Makes the first update of `ref` throw `failure`, as the history adapter's caller would see it. */
function failRefUpdateOnce(ref: string, failure: Error): void {
  const original = GitTimelineHistoryAdapter.prototype.updateRef;
  let failed = false;
  vi.spyOn(GitTimelineHistoryAdapter.prototype, 'updateRef').mockImplementation(async function (this: GitTimelineHistoryAdapter, target: string, oid: string) {
    if (target === ref && !failed) {
      failed = true;
      throw failure;
    }
    await original.call(this, target, oid);
  });
}

/** Makes the first read of `ref` throw `failure`, as the history adapter's caller would see it. */
function failRefReadOnce(ref: string, failure: Error): void {
  const original = GitTimelineHistoryAdapter.prototype.readRef;
  let failed = false;
  vi.spyOn(GitTimelineHistoryAdapter.prototype, 'readRef').mockImplementation(async function (this: GitTimelineHistoryAdapter, target: string) {
    if (target === ref && !failed) {
      failed = true;
      throw failure;
    }
    return await original.call(this, target);
  });
}

/** Holds a real lock file on `ref`, as a concurrent `git gc` or another writer would, and returns its release. */
function holdRefLock(path: string, ref: string): () => void {
  const lock = join(path, '.git', `${ref}.lock`);
  mkdirSync(dirname(lock), { recursive: true });
  writeFileSync(lock, '');
  return () => {
    unlinkSync(lock);
  };
}

/** How long an unarmed attempt waits before the sweep finishes it. */
const SWEEP_AGE = 2 * 60 * 60 * 1000;

const LOCKED = new GitRepositoryLockedError('Git command failed: repository is locked', 'ExecutionOrchestrator.orchestrate', { code: 128, stderr: 'fatal: Unable to create index.lock' });

describe('the attempt-journal step classifies failures by type (#1109)', () => {
  it('reports a held lock met while saving the attempt record as attempt-journal-unavailable, then writes', async () => {
    const path = await repository();
    const warp = await open(path, { attempts: new FixedAttempts(), limit: 1 });
    failRefUpdateOnce(buildWriteAttemptRef(GRAPH, FIRST), LOCKED);

    expect(unpublished(await warp.as('alice').execute(intent.node.add({ subject: 'x' }))).cause).toBe('attempt-journal-unavailable');
    expect(tip(path, 'alice')).toBeNull();
    expect(attemptRefs(path)).toEqual([]);
    retained(await warp.as('alice').execute(intent.node.add({ subject: 'x' })));
  });

  it('reports a real held lock on the attempt record ref as attempt-journal-unavailable, publishing and reserving nothing', async () => {
    const path = await repository();
    const warp = await open(path, { attempts: new FixedAttempts(), limit: 1 });
    const release = holdRefLock(path, buildWriteAttemptRef(GRAPH, FIRST));

    expect(unpublished(await warp.as('alice').execute(intent.node.add({ subject: 'x' }))).cause).toBe('attempt-journal-unavailable');
    expect(tip(path, 'alice')).toBeNull();
    expect(attemptRefs(path)).toEqual([]);
    release();
    retained(await warp.as('alice').execute(intent.node.add({ subject: 'x' })));
  });

  it('rejects a retry wrapper around a defect met while saving the attempt record', async () => {
    const path = await repository();
    const warp = await open(path, { attempts: new FixedAttempts(), limit: 1 });
    const wrapped = new OperationPolicyExhaustedError(4, new TypeError("Cannot read properties of undefined (reading 'oid')"));
    failRefUpdateOnce(buildWriteAttemptRef(GRAPH, FIRST), wrapped);

    await expect(warp.as('alice').execute(intent.node.add({ subject: 'x' }))).rejects.toBe(wrapped);
    expect(tip(path, 'alice')).toBeNull();
    expect(attemptRefs(path)).toEqual([]);
  });

  it('rejects a defect thrown while saving the attempt record, having published and reserved nothing', async () => {
    const path = await repository();
    const warp = await open(path, { attempts: new FixedAttempts(), limit: 1 });
    const defect = new TypeError("Cannot read properties of undefined (reading 'oid')");
    failRefUpdateOnce(buildWriteAttemptRef(GRAPH, FIRST), defect);

    await expect(warp.as('alice').execute(intent.node.add({ subject: 'x' }))).rejects.toBe(defect);
    expect(tip(path, 'alice')).toBeNull();
    expect(attemptRefs(path)).toEqual([]);
    retained(await warp.as('alice').execute(intent.node.add({ subject: 'fits' })));
  });
});

describe('the custody-support step classifies failures by type (#1109)', () => {
  it('reports unavailable support as retention-unavailable, keeping the record of the slot it reserved', async () => {
    const path = await repository();
    const warp = await open(path, { attempts: new FixedAttempts(), limit: 2 });
    retained(await warp.as('alice').execute(intent.node.add({ subject: 'first' })));
    const before = tip(path, 'alice');
    failRefReadOnce(buildObservationConstructionRef(GRAPH, SECOND), LOCKED);

    expect(unpublished(await warp.as('alice').execute(intent.node.add({ subject: 'x' }))).cause).toBe('retention-unavailable');
    expect(tip(path, 'alice')).toBe(before);
    expect(attemptRefs(path)).toEqual([buildWriteAttemptRef(GRAPH, SECOND)]);
    expect(unpublished(await warp.as('alice').execute(intent.node.add({ subject: 'y' }))).cause).toBe('retention-capacity-exhausted');
  });

  it('reports a real held lock on the construction ref as retention-unavailable, and the sweep finishes the attempt it reserved', async () => {
    const path = await repository();
    let now = 1_000;
    const clock = (): number => now;
    const warp = await open(path, { attempts: new FixedAttempts(), limit: 2, clock });
    retained(await warp.as('alice').execute(intent.node.add({ subject: 'first' })));
    const before = tip(path, 'alice');
    const release = holdRefLock(path, buildObservationConstructionRef(GRAPH, SECOND));

    expect(unpublished(await warp.as('alice').execute(intent.node.add({ subject: 'x' }))).cause).toBe('retention-unavailable');
    expect(tip(path, 'alice')).toBe(before);
    expect(attemptRefs(path)).toEqual([buildWriteAttemptRef(GRAPH, SECOND)]);
    expect(constructionRefs(path)).toEqual([]);
    release();
    await warp.close();
    now += SWEEP_AGE;

    const swept = await openSwept(path, { limit: 2, clock });
    expect(attemptRefs(path)).toEqual([]);
    retained(await swept.as('alice').execute(intent.node.add({ subject: 'x' })));
  });

  it('rejects a defect thrown while building support, and leaves no attempt ref or reserved slot behind', async () => {
    const path = await repository();
    const warp = await open(path, { attempts: new FixedAttempts(), limit: 2 });
    retained(await warp.as('alice').execute(intent.node.add({ subject: 'first' })));
    const before = tip(path, 'alice');
    const defect = new RangeError('Invalid array length');
    failRefReadOnce(buildObservationConstructionRef(GRAPH, SECOND), defect);

    await expect(warp.as('alice').execute(intent.node.add({ subject: 'x' }))).rejects.toBe(defect);
    expect(tip(path, 'alice')).toBe(before);
    expect(attemptRefs(path)).toEqual([]);
    expect(constructionRefs(path)).toEqual([]);
    retained(await warp.as('alice').execute(intent.node.add({ subject: 'fits' })));
  });
});
