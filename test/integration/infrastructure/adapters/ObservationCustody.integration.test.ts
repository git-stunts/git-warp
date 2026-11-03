import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import CustodyAcknowledged from '../../../../src/domain/services/custody/CustodyAcknowledged.ts';
import CustodyInspection from '../../../../src/domain/services/custody/CustodyInspection.ts';
import CustodyRefused from '../../../../src/domain/services/custody/CustodyRefused.ts';
import ObservationAdmitted from '../../../../src/domain/services/custody/ObservationAdmitted.ts';
import type ObservationAttempt from '../../../../src/domain/services/custody/ObservationAttempt.ts';
import type ObservationBindings from '../../../../src/domain/services/custody/ObservationBindings.ts';
import ObservationCoordinate from '../../../../src/domain/services/custody/ObservationCoordinate.ts';
import type ObservationCustodyService from '../../../../src/domain/services/custody/ObservationCustodyService.ts';
import ObservationKnownUnpublished from '../../../../src/domain/services/custody/ObservationKnownUnpublished.ts';
import ObservationPrepared from '../../../../src/domain/services/custody/ObservationPrepared.ts';
import ObservationPublicationEvidence from '../../../../src/domain/services/custody/ObservationPublicationEvidence.ts';
import ObservationPublicationPermission from '../../../../src/domain/services/custody/ObservationPublicationPermission.ts';
import ObservationReconcileOnly from '../../../../src/domain/services/custody/ObservationReconcileOnly.ts';
import ObservationReconciled from '../../../../src/domain/services/custody/ObservationReconciled.ts';
import ObservationRefused from '../../../../src/domain/services/custody/ObservationRefused.ts';
import ObservationSupportCancelled from '../../../../src/domain/services/custody/ObservationSupportCancelled.ts';
import ObservationSupportLimits from '../../../../src/domain/services/custody/ObservationSupportLimits.ts';
import ObservationUnavailable from '../../../../src/domain/services/custody/ObservationUnavailable.ts';
import ResolvedObservation from '../../../../src/domain/services/custody/ResolvedObservation.ts';
import RetainedObservation from '../../../../src/domain/services/custody/RetainedObservation.ts';
import GitCasObservationCustodyAdapter from '../../../../src/infrastructure/adapters/GitCasObservationCustodyAdapter.ts';
import ObservationCustodyFixture, {
  FIXTURE_GRAPH,
  basisTree,
  blob,
  blobDependency,
  collectGarbage,
  git,
  narrowed,
  readBindings,
  readCore,
  removeFixtureRefs,
  sources,
  treeDependency,
  writeBindings,
  writeCore,
  writerCommits,
} from '../../../helpers/ObservationCustodyFixture.ts';

const fixture = new ObservationCustodyFixture();

afterEach(async () => {
  await fixture.dispose();
});

async function admitted(service: ObservationCustodyService, bindings: ObservationBindings): Promise<ObservationAttempt> {
  return narrowed(await service.begin(bindings), ObservationAdmitted).attempt;
}

async function retainRead(
  service: ObservationCustodyService,
  options: {
    readonly basis: string;
    readonly label: string;
    readonly heads?: readonly string[];
    readonly dependencies?: Parameters<typeof sources>[1];
  },
): Promise<RetainedObservation> {
  const attempt = await admitted(service, readBindings(options.basis));
  narrowed(await service.prepare(attempt, sources(options.heads ?? [], options.dependencies ?? [])), ObservationPrepared);
  return narrowed(await service.settle(attempt, { core: readCore(options.label), publication: null }), RetainedObservation);
}

function parentCount(path: string, commit: string): number {
  return git(path, ['rev-list', '--parents', '-n', '1', commit]).split(/\s+/u).length - 1;
}

function loosePath(path: string, oid: string): string {
  return join(path, 'objects', oid.slice(0, 2), oid.slice(2));
}

function constructionRefs(path: string): string {
  return git(path, ['for-each-ref', '--format=%(refname)', `refs/warp/${FIXTURE_GRAPH}/observations/`]);
}

function missingOid(path: string, digit: string): string {
  return digit.repeat(git(path, ['rev-parse', '--show-object-format']) === 'sha256' ? 64 : 40);
}

describe.each(['sha1', 'sha256'])('shared observation custody on published git-cas (%s)', (format) => {
  it('resolves the oldest of more than 64 observations, with 129 writers, after reopen and GC', async () => {
    const path = await fixture.repository(format);
    const first = await fixture.open(path, { limit: 80 });
    const heads = writerCommits(path, 129);
    const oldest = await retainRead(first.service, { basis: basisTree(path, 'oldest'), label: 'oldest', heads });
    let newest = oldest;
    for (let index = 0; index < 65; index++) {
      newest = await retainRead(first.service, { basis: basisTree(path, `b${index}`), label: `o${index}` });
    }
    const token = oldest.coordinate.toString();
    removeFixtureRefs(path);
    await fixture.close(first);
    expect(constructionRefs(path)).toBe('');
    collectGarbage(path);

    const reopened = await fixture.open(path, { limit: 80 });
    const coordinate = narrowed(ObservationCoordinate.parse(token), ObservationCoordinate);
    expect(narrowed(await reopened.service.resolve(coordinate), ResolvedObservation).core()).toEqual(oldest.core());
    for (const head of heads) {
      expect(git(path, ['cat-file', '-t', head])).toBe('commit');
    }
    expect(narrowed(await reopened.service.resolve(newest.coordinate), ResolvedObservation).core()).toEqual(newest.core());
  });

  it('retains history through bounded carriers of 63, 64 and 4 parents', async () => {
    const path = await fixture.repository(format);
    const opened = await fixture.open(path, { limit: 4 });
    const attempt = await admitted(opened.service, readBindings(basisTree(path, 'carriers')));
    const prepared = narrowed(await opened.service.prepare(attempt, sources(writerCommits(path, 129))), ObservationPrepared);
    const carriers = git(path, ['rev-list', '--first-parent', '-n', '3', prepared.roots.parents[0] ?? '']).split('\n');
    expect(carriers.map((commit) => parentCount(path, commit))).toEqual([4, 64, 63]);
  });

  it('admits at most the capacity under concurrency and preserves earlier tokens', async () => {
    const path = await fixture.repository(format);
    const opened = await fixture.open(path, { limit: 4 });
    const issued = await retainRead(opened.service, { basis: basisTree(path, 'issued'), label: 'issued' });
    const outcomes = await Promise.all(Array.from({ length: 8 }, async (_, index) =>
      await opened.service.begin(readBindings(basisTree(path, `race${index}`)))));
    const winners = outcomes.filter((outcome) => outcome instanceof ObservationAdmitted);
    expect(winners.length).toBeGreaterThan(0);
    expect(winners.length).toBeLessThanOrEqual(3);
    const probe = narrowed(winners[0] ?? null, ObservationAdmitted).attempt.identity;
    const inspected = narrowed(await opened.custody.inspect(probe), CustodyInspection);
    expect(inspected).toMatchObject({ charged: winners.length + 1, limit: 4 });
    for (const outcome of outcomes.filter((candidate) => !(candidate instanceof ObservationAdmitted))) {
      expect(['capacity-full', 'contention']).toContain(narrowed(outcome, ObservationRefused).reason);
    }
    expect(await opened.service.resolve(issued.coordinate)).toBeInstanceOf(ResolvedObservation);
  });

  it('refuses at a full namespace without disturbing what was issued', async () => {
    const path = await fixture.repository(format);
    const opened = await fixture.open(path, { limit: 1 });
    const issued = await retainRead(opened.service, { basis: basisTree(path, 'only'), label: 'only' });
    expect(await opened.service.begin(readBindings(basisTree(path, 'over')))).toEqual(new ObservationRefused('capacity-full'));
    expect(narrowed(await opened.service.resolve(issued.coordinate), ResolvedObservation).core()).toEqual(issued.core());
  });

  it('recovers an exact retry, and refuses conflicting reuse and a changed policy', async () => {
    const path = await fixture.repository(format);
    const opened = await fixture.open(path, { limit: 4 });
    const basis = basisTree(path, 'retry');
    const attempt = await admitted(opened.service, readBindings(basis));
    const attemptId = attempt.identity.attemptId;
    expect(await opened.service.resume(attemptId, readBindings(basis))).toMatchObject({ phase: 'reserved' });
    expect(await opened.service.resume(attemptId, readBindings(basisTree(path, 'other'))))
      .toEqual(new ObservationRefused('binding-conflict'));
    await expect(GitCasObservationCustodyAdapter.open({
      reservations: opened.store.reservations, graphName: FIXTURE_GRAPH, limit: 5,
    })).resolves.toEqual(new CustodyRefused('policy-mismatch'));
  });

  it('permits one publication, settles its exact evidence, and never re-arms', async () => {
    const path = await fixture.repository(format);
    const opened = await fixture.open(path, { limit: 4 });
    const attempt = await admitted(opened.service, writeBindings(basisTree(path, 'write')));
    narrowed(await opened.service.prepare(attempt, sources()), ObservationPrepared);
    const core = writeCore('published');
    const commit = writerCommits(path, 1)[0] ?? '';
    const publication = new ObservationPublicationEvidence('writer-1', commit);
    expect(await opened.service.settle(attempt, { core, publication })).toEqual(new ObservationRefused('not-armed'));
    expect(await opened.service.authorizePublication(attempt)).toBeInstanceOf(ObservationPublicationPermission);
    expect(await opened.service.authorizePublication(attempt)).toBeInstanceOf(ObservationReconcileOnly);
    const retained = narrowed(await opened.service.settle(attempt, { core, publication }), RetainedObservation);
    removeFixtureRefs(path);
    collectGarbage(path);
    const resolved = narrowed(await opened.service.resolve(retained.coordinate), ResolvedObservation);
    expect(resolved.core()).toEqual(retained.core());
    expect(resolved.record.publication?.commit).toBe(commit);
    expect(git(path, ['cat-file', '-t', commit])).toBe('commit');
  });

  it('lets a durable cancel beat arm and refund its slot, and refuses to cancel once armed', async () => {
    const path = await fixture.repository(format);
    const opened = await fixture.open(path, { limit: 1 });
    const cancelled = await admitted(opened.service, writeBindings(basisTree(path, 'cancelled')));
    narrowed(await opened.service.prepare(cancelled, sources(writerCommits(path, 2))), ObservationPrepared);
    expect(await opened.service.cancel(cancelled)).toBeInstanceOf(ObservationKnownUnpublished);
    expect(await opened.service.authorizePublication(cancelled)).toBeInstanceOf(ObservationKnownUnpublished);
    expect(await opened.service.resume(cancelled.identity.attemptId, cancelled.preparation.bindings))
      .toEqual(new ObservationRefused('cancelled'));

    const armed = await admitted(opened.service, writeBindings(basisTree(path, 'armed')));
    narrowed(await opened.service.prepare(armed, sources()), ObservationPrepared);
    expect(await opened.service.authorizePublication(armed)).toBeInstanceOf(ObservationPublicationPermission);
    expect(await opened.service.cancel(armed)).toBeInstanceOf(ObservationReconcileOnly);
    expect(await opened.service.begin(readBindings(basisTree(path, 'full')))).toEqual(new ObservationRefused('capacity-full'));
  });

  it('survives restart after arm without rebuilding or re-arming', async () => {
    const path = await fixture.repository(format);
    const first = await fixture.open(path, { limit: 4 });
    const bindings = writeBindings(basisTree(path, 'restart'));
    const attempt = await admitted(first.service, bindings);
    const prepared = narrowed(await first.service.prepare(attempt, sources(writerCommits(path, 70))), ObservationPrepared);
    expect(await first.service.authorizePublication(attempt)).toBeInstanceOf(ObservationPublicationPermission);
    await fixture.close(first);

    const second = await fixture.open(path, { limit: 4 });
    const resumed = narrowed(await second.service.resume(attempt.identity.attemptId, bindings), ObservationAdmitted);
    expect(resumed.phase).toBe('armed');
    expect(await second.service.authorizePublication(resumed.attempt)).toBeInstanceOf(ObservationReconcileOnly);
    const recovered = await second.service.prepare(resumed.attempt, sources([missingOid(path, '3')]));
    expect(narrowed(recovered, ObservationPrepared).roots.parents).toEqual(prepared.roots.parents);
    expect(constructionRefs(path)).toBe('');
  });

  it('resumes a partial construction from its input and refuses a different one', async () => {
    const path = await fixture.repository(format);
    const opened = await fixture.open(path, { limit: 4 });
    const heads = writerCommits(path, 130);
    const attempt = await admitted(opened.service, readBindings(basisTree(path, 'partial')));
    let pulled = 0;
    async function* interruptible(): AsyncGenerator<string> {
      for (const head of heads) {
        pulled += 1;
        yield head;
      }
    }
    const interrupted = await opened.support.retain({
      identity: attempt.identity,
      basis: attempt.preparation.bindings.basis,
      limits: new ObservationSupportLimits({ writers: 512, dependencies: 16 }),
      isCancelled: () => pulled >= 70,
      writerHeads: interruptible(),
      dependencies: sources().dependencies,
    });
    expect(interrupted).toBeInstanceOf(ObservationSupportCancelled);
    const ref = constructionRefs(path);
    const partialTip = git(path, ['rev-parse', ref]);

    const reordered = [...heads.slice(1, 70), heads[0] ?? '', ...heads.slice(70)];
    expect(await opened.service.prepare(attempt, sources(reordered))).toEqual(new ObservationRefused('construction-mismatch'));
    expect(await opened.service.prepare(attempt, sources(heads.slice(0, 30)))).toEqual(new ObservationRefused('construction-mismatch'));
    expect(git(path, ['rev-parse', ref])).toBe(partialTip);

    const prepared = narrowed(await opened.service.prepare(attempt, sources(heads)), ObservationPrepared);
    const carriers = git(path, ['rev-list', '--first-parent', '-n', '3', prepared.roots.parents[0] ?? '']).split('\n');
    expect(carriers.map((commit) => parentCount(path, commit))).toEqual([5, 64, 63]);
    expect(constructionRefs(path)).toBe('');
    const retained = narrowed(await opened.service.settle(attempt, { core: readCore('resumed'), publication: null }), RetainedObservation);
    expect(await opened.service.resolve(retained.coordinate)).toBeInstanceOf(ResolvedObservation);
  });

  it('refuses over-budget and missing support before arm, without collecting the source', async () => {
    const path = await fixture.repository(format);
    const limits = new ObservationSupportLimits({ writers: 64, dependencies: 2 });
    const opened = await fixture.open(path, { limit: 8, limits });
    const heads = writerCommits(path, 70);
    const attempt = await admitted(opened.service, writeBindings(basisTree(path, 'budget')));
    let pulled = 0;
    async function* counted(): AsyncGenerator<string> {
      for (const head of heads) {
        pulled += 1;
        yield head;
      }
    }
    const refused = await opened.service.prepare(attempt, { writerHeads: counted(), dependencies: sources().dependencies });
    expect(refused).toEqual(new ObservationRefused('writer-limit'));
    expect(pulled).toBe(65);
    expect(await opened.service.authorizePublication(attempt)).toEqual(new ObservationRefused('not-prepared'));

    const dependent = await admitted(opened.service, readBindings(basisTree(path, 'dependencies')));
    const content = blobDependency(blob(path, 'content'));
    expect(await opened.service.prepare(dependent, sources([], [content, content, content])))
      .toEqual(new ObservationRefused('dependency-limit'));

    const ghost = await admitted(opened.service, readBindings(basisTree(path, 'ghost')));
    expect(await opened.service.prepare(ghost, sources([], [blobDependency(missingOid(path, '1'))])))
      .toEqual(new ObservationRefused('dependency-unavailable'));
    const absent = await admitted(opened.service, readBindings(missingOid(path, '2')));
    expect(await opened.service.prepare(absent, sources())).toEqual(new ObservationRefused('basis-unavailable'));
    const headless = await admitted(opened.service, readBindings(basisTree(path, 'headless')));
    expect(await opened.service.prepare(headless, sources([missingOid(path, '4')])))
      .toEqual(new ObservationRefused('writer-head-unavailable'));
  });

  it('retains content dependencies across pages through GC', async () => {
    const path = await fixture.repository(format);
    const opened = await fixture.open(path, { limit: 4 });
    const content = blob(path, 'retained content');
    const tree = basisTree(path, 'dependency tree');
    const dependencies = Array.from({ length: 1500 }, (_, index) =>
      (index % 2 === 0 ? blobDependency(content) : treeDependency(tree)));
    const retained = await retainRead(opened.service, { basis: basisTree(path, 'paged'), label: 'paged', dependencies });
    collectGarbage(path);
    expect(await opened.service.resolve(retained.coordinate)).toBeInstanceOf(ResolvedObservation);
    expect(git(path, ['cat-file', '-p', content])).toBe('retained content');
    expect(git(path, ['cat-file', '-t', tree])).toBe('tree');
  });

  it('returns typed unavailable evidence for removed objects and mints nothing new', async () => {
    const path = await fixture.repository(format);
    const opened = await fixture.open(path, { limit: 8 });
    const heads = writerCommits(path, 3);
    const content = blob(path, 'removable content');
    const basis = basisTree(path, 'removable basis');
    const withContent = await retainRead(opened.service, {
      basis: basisTree(path, 'c'), label: 'c', dependencies: [blobDependency(content)],
    });
    const withHistory = await retainRead(opened.service, { basis: basisTree(path, 'h'), label: 'h', heads });
    const withBasis = await retainRead(opened.service, { basis, label: 'b' });
    const [publication] = writerCommits(path, 1);
    const written = await admitted(opened.service, writeBindings(basisTree(path, 'w')));
    narrowed(await opened.service.prepare(written, sources()), ObservationPrepared);
    narrowed(await opened.service.authorizePublication(written), ObservationPublicationPermission);
    const withPublication = narrowed(await opened.service.settle(written, {
      core: writeCore('w'), publication: new ObservationPublicationEvidence('writer-1', publication ?? ''),
    }), RetainedObservation);
    removeFixtureRefs(path);
    const refsBefore = git(path, ['for-each-ref']);

    await rm(loosePath(path, content));
    await rm(loosePath(path, heads[1] ?? ''));
    await rm(loosePath(path, basis));
    await rm(loosePath(path, publication ?? ''));
    expect(await opened.service.resolve(withContent.coordinate)).toEqual(new ObservationUnavailable('dependency-missing'));
    expect(await opened.service.resolve(withHistory.coordinate)).toEqual(new ObservationUnavailable('history-missing'));
    expect(await opened.service.resolve(withBasis.coordinate)).toEqual(new ObservationUnavailable('basis-missing'));
    expect(await opened.service.resolve(withPublication.coordinate)).toEqual(new ObservationUnavailable('evidence-unreadable'));
    expect(git(path, ['for-each-ref'])).toBe(refsBefore);

    const unknown = ObservationCoordinate.parse(withBasis.coordinate.toString().replace(/[0-9a-f]{32}/u, 'f'.repeat(32)));
    expect(await opened.service.resolve(narrowed(unknown, ObservationCoordinate))).toBeInstanceOf(ObservationUnavailable);
  });

  it('treats an armed attempt whose acknowledgement was lost as reconcile-only', async () => {
    const path = await fixture.repository(format);
    const opened = await fixture.open(path, { limit: 4 });
    const attempt = await admitted(opened.service, writeBindings(basisTree(path, 'lost')));
    narrowed(await opened.service.prepare(attempt, sources()), ObservationPrepared);
    expect(await opened.custody.arm(attempt.identity)).toEqual(new CustodyAcknowledged('armed', 'armed'));
    expect(await opened.service.authorizePublication(attempt)).toBeInstanceOf(ObservationReconcileOnly);
    expect(narrowed(await opened.service.reconcile(attempt), ObservationReconciled).phase).toBe('armed');
    expect(await opened.service.authorizePublication(attempt)).toBeInstanceOf(ObservationReconcileOnly);
  });
});
