import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitRepositoryLockedError } from '@git-stunts/plumbing/errors';
import { intent } from '../../../advanced.ts';
import ObservationAttemptId from '../../../src/domain/services/custody/ObservationAttemptId.ts';
import { buildObservationConstructionRef } from '../../../src/domain/utils/ObservationRefLayout.ts';
import { buildWriteAttemptRef } from '../../../src/domain/utils/WriteAttemptRefLayout.ts';
import GitTimelineHistoryAdapter from '../../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import ObservationAttemptSourcePort from '../../../src/ports/ObservationAttemptSourcePort.ts';
import { GRAPH, attemptRefs, disposeWarpFixtures, git, open, repository, retained, tip, unpublished } from '../../helpers/WarpWriteFixture.ts';

afterEach(async () => {
  vi.restoreAllMocks();
  await disposeWarpFixtures();
});

/** The first attempt id is fixed, so a test can name its refs; later ones are fresh. */
const FIRST = '1'.repeat(32);

class FixedFirstAttempt extends ObservationAttemptSourcePort {
  #issued = 0;

  override next(): ObservationAttemptId {
    this.#issued += 1;
    return new ObservationAttemptId(this.#issued === 1 ? FIRST : this.#issued.toString(16).padStart(32, '0'));
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

const LOCKED = new GitRepositoryLockedError('Git command failed: repository is locked', 'ExecutionOrchestrator.orchestrate', { code: 128, stderr: 'fatal: Unable to create index.lock' });

describe('the attempt-journal step classifies failures by type (#1109)', () => {
  it('reports a real held lock on the attempt record ref as attempt-journal-unavailable, then writes once it is released', async () => {
    const path = await repository();
    const warp = await open(path, { attempts: new FixedFirstAttempt(), limit: 1 });
    const lock = join(path, '.git', `${buildWriteAttemptRef(GRAPH, FIRST)}.lock`);
    mkdirSync(dirname(lock), { recursive: true });
    writeFileSync(lock, '');

    expect(unpublished(await warp.as('alice').execute(intent.node.add({ subject: 'x' }))).cause).toBe('attempt-journal-unavailable');
    expect(tip(path, 'alice')).toBeNull();
    expect(attemptRefs(path)).toEqual([]);

    unlinkSync(lock);
    retained(await warp.as('alice').execute(intent.node.add({ subject: 'x' })));
  });

  it('rejects a defect thrown while saving the attempt record, having published and reserved nothing', async () => {
    const path = await repository();
    const warp = await open(path, { attempts: new FixedFirstAttempt(), limit: 1 });
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
    const warp = await open(path, { attempts: new FixedFirstAttempt(), limit: 1 });
    failRefReadOnce(buildObservationConstructionRef(GRAPH, FIRST), LOCKED);

    expect(unpublished(await warp.as('alice').execute(intent.node.add({ subject: 'x' }))).cause).toBe('retention-unavailable');
    expect(tip(path, 'alice')).toBeNull();
    expect(attemptRefs(path)).toEqual([buildWriteAttemptRef(GRAPH, FIRST)]);
    expect(unpublished(await warp.as('alice').execute(intent.node.add({ subject: 'y' }))).cause).toBe('retention-capacity-exhausted');
  });

  it('rejects a defect thrown while building support, and leaves no attempt ref or reserved slot behind', async () => {
    const path = await repository();
    const warp = await open(path, { attempts: new FixedFirstAttempt(), limit: 1 });
    const defect = new RangeError('Invalid array length');
    failRefReadOnce(buildObservationConstructionRef(GRAPH, FIRST), defect);

    await expect(warp.as('alice').execute(intent.node.add({ subject: 'x' }))).rejects.toBe(defect);
    expect(tip(path, 'alice')).toBeNull();
    expect(attemptRefs(path)).toEqual([]);
    expect(constructionRefs(path)).toEqual([]);
    retained(await warp.as('alice').execute(intent.node.add({ subject: 'fits' })));
  });
});
