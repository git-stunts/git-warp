import { chmod, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import Plumbing from '@git-stunts/plumbing';
import { afterEach, describe, expect, it } from 'vitest';
import ConeBasis from '../../../../src/domain/services/cone/ConeBasis.ts';
import ConeBasisHead from '../../../../src/domain/services/cone/ConeBasisHead.ts';
import ConeFrontier from '../../../../src/domain/services/cone/ConeFrontier.ts';
import ConeRoot from '../../../../src/domain/services/cone/ConeRoot.ts';
import ConeWriterPosition from '../../../../src/domain/services/cone/ConeWriterPosition.ts';
import CustodyAcknowledged from '../../../../src/domain/services/custody/CustodyAcknowledged.ts';
import CustodyInspection from '../../../../src/domain/services/custody/CustodyInspection.ts';
import CustodyRefused from '../../../../src/domain/services/custody/CustodyRefused.ts';
import ObservationAdmitted from '../../../../src/domain/services/custody/ObservationAdmitted.ts';
import type ObservationAttempt from '../../../../src/domain/services/custody/ObservationAttempt.ts';
import type ObservationBindings from '../../../../src/domain/services/custody/ObservationBindings.ts';
import ObservationCoordinate from '../../../../src/domain/services/custody/ObservationCoordinate.ts';
import type ObservationCustodyService from '../../../../src/domain/services/custody/ObservationCustodyService.ts';
import type ObservationDependency from '../../../../src/domain/services/custody/ObservationDependency.ts';
import ObservationIndeterminate from '../../../../src/domain/services/custody/ObservationIndeterminate.ts';
import ObservationKnownUnpublished from '../../../../src/domain/services/custody/ObservationKnownUnpublished.ts';
import ObservationPrepared from '../../../../src/domain/services/custody/ObservationPrepared.ts';
import ObservationPublicationEvidence from '../../../../src/domain/services/custody/ObservationPublicationEvidence.ts';
import ObservationPublicationPermission from '../../../../src/domain/services/custody/ObservationPublicationPermission.ts';
import ObservationReconcileOnly from '../../../../src/domain/services/custody/ObservationReconcileOnly.ts';
import ObservationReconciled from '../../../../src/domain/services/custody/ObservationReconciled.ts';
import ObservationRefused from '../../../../src/domain/services/custody/ObservationRefused.ts';
import ObservationSupportCancelled from '../../../../src/domain/services/custody/ObservationSupportCancelled.ts';
import ObservationSupportLimits from '../../../../src/domain/services/custody/ObservationSupportLimits.ts';
import ObservationSupportRefused from '../../../../src/domain/services/custody/ObservationSupportRefused.ts';
import ObservationUnavailable from '../../../../src/domain/services/custody/ObservationUnavailable.ts';
import ResolvedObservation from '../../../../src/domain/services/custody/ResolvedObservation.ts';
import RetainedObservation from '../../../../src/domain/services/custody/RetainedObservation.ts';
import GitCasObservationCustodyAdapter from '../../../../src/infrastructure/adapters/GitCasObservationCustodyAdapter.ts';
import GitConeRecordStoreAdapter from '../../../../src/infrastructure/adapters/GitConeRecordStoreAdapter.ts';
import GitTimelineHistoryAdapter from '../../../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import codec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import ObservationCustodyFixture, {
  FIXTURE_GRAPH,
  basisTree,
  blob,
  blobDependency,
  claimOf,
  collectGarbage,
  git,
  narrowed,
  readBindings,
  readCore,
  removeFixtureRefs,
  sources,
  stream,
  treeDependency,
  writeBindings,
  writeCore,
  writerCommits,
  preparationOf,
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
  options: { readonly basis: string; readonly label: string; readonly dependencies?: readonly ObservationDependency[] },
): Promise<RetainedObservation> {
  const dependencies = options.dependencies ?? [];
  const attempt = await admitted(service, readBindings(options.basis, await claimOf(dependencies)));
  narrowed(await service.prepare(attempt, sources(dependencies)), ObservationPrepared);
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

/** Fails every update of the namespace ledger: custody pins land, the ledger cannot advance. */
async function freezeLedger(path: string): Promise<void> {
  const namespace = await GitCasObservationCustodyAdapter.namespaceOf(new NodeCryptoAdapter(), FIXTURE_GRAPH);
  const hook = join(path, 'hooks', 'reference-transaction');
  await writeFile(hook, [
    '#!/bin/sh',
    '[ "$1" = prepared ] || exit 0',
    `if grep -q ' refs/cas/reservations/${namespace}$'; then exit 1; fi`,
    'exit 0',
    '',
  ].join('\n'));
  await chmod(hook, 0o755);
}

describe.each(['sha1', 'sha256'])('shared observation custody on published git-cas (%s)', (format) => {
  it('resolves the oldest of more than 64 observations, with 129 writers and ancestors, after reopen and GC', async () => {
    const path = await fixture.repository(format);
    const first = await fixture.open(path, { limit: 80 });
    const heads = writerCommits(path, 129);
    const ancestors = heads.map((head) => git(path, ['rev-parse', `${head}^`]));
    const content = blob(path, 'retained content');
    const basis = basisTree(path, 'oldest', heads);
    const oldest = await retainRead(first.service, { basis, label: 'oldest', dependencies: [blobDependency(content)] });
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
    for (const commit of [...heads, ...ancestors]) {
      expect(git(path, ['cat-file', '-t', commit])).toBe('commit');
    }
    expect(git(path, ['cat-file', '-p', content])).toBe('retained content');
    expect(git(path, ['ls-tree', '--name-only', basis]).split('\n')).toEqual(['frontier', 'layout']);
    expect(narrowed(await reopened.service.resolve(newest.coordinate), ResolvedObservation).core()).toEqual(newest.core());
  });

  it('retains every head its basis frontier names, with nothing supplied by the producer', async () => {
    const path = await fixture.repository(format);
    const opened = await fixture.open(path, { limit: 4 });
    const heads = writerCommits(path, 3);
    const retained = await retainRead(opened.service, { basis: basisTree(path, 'whole', heads), label: 'whole' });
    removeFixtureRefs(path);
    collectGarbage(path);
    expect(await opened.service.resolve(retained.coordinate)).toBeInstanceOf(ResolvedObservation);
    for (const head of heads) {
      expect(git(path, ['cat-file', '-t', head])).toBe('commit');
    }
  });

  it('retains history through bounded carriers of 63, 64 and 4 parents', async () => {
    const path = await fixture.repository(format);
    const opened = await fixture.open(path, { limit: 4 });
    const attempt = await admitted(opened.service, readBindings(basisTree(path, 'carriers', writerCommits(path, 129))));
    const prepared = narrowed(await opened.service.prepare(attempt, sources()), ObservationPrepared);
    const carriers = git(path, ['rev-list', '--first-parent', '-n', '3', prepared.roots.parents[0] ?? '']).split('\n');
    expect(carriers.map((commit) => parentCount(path, commit))).toEqual([4, 64, 63]);
    expect(opened.carriersPublished()).toBe(3);
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
    const { attemptId } = attempt.identity;
    expect(await opened.service.resume(attemptId, readBindings(basis))).toMatchObject({ phase: 'reserved' });
    expect(await opened.service.resume(attemptId, readBindings(basisTree(path, 'other'))))
      .toEqual(new ObservationRefused('binding-conflict'));
    await expect(GitCasObservationCustodyAdapter.open({
      reservations: opened.store.reservations, graphName: FIXTURE_GRAPH, limit: 5, crypto: new NodeCryptoAdapter(),
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
    expect(await opened.service.settle(attempt, { core, publication })).toMatchObject({ cause: { code: 'E_OBSERVATION_CUSTODY_CONTRADICTED' } });
    expect(await opened.service.authorizePublication(preparationOf(attempt))).toBeInstanceOf(ObservationPublicationPermission);
    expect(await opened.service.authorizePublication(preparationOf(attempt))).toBeInstanceOf(ObservationReconcileOnly);
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
    const cancelled = await admitted(opened.service, writeBindings(basisTree(path, 'cancelled', writerCommits(path, 2))));
    narrowed(await opened.service.prepare(cancelled, sources()), ObservationPrepared);
    expect(await opened.service.cancel(cancelled)).toBeInstanceOf(ObservationKnownUnpublished);
    expect(await opened.service.authorizePublication(preparationOf(cancelled))).toBeInstanceOf(ObservationKnownUnpublished);
    expect(await opened.service.resume(cancelled.identity.attemptId, cancelled.preparation.bindings))
      .toEqual(new ObservationRefused('cancelled'));

    const armed = await admitted(opened.service, writeBindings(basisTree(path, 'armed')));
    narrowed(await opened.service.prepare(armed, sources()), ObservationPrepared);
    expect(await opened.service.authorizePublication(preparationOf(armed))).toBeInstanceOf(ObservationPublicationPermission);
    expect(await opened.service.cancel(armed)).toBeInstanceOf(ObservationReconcileOnly);
    expect(await opened.service.begin(readBindings(basisTree(path, 'full')))).toEqual(new ObservationRefused('capacity-full'));
  });

  it('survives restart after arm without rebuilding or re-arming', async () => {
    const path = await fixture.repository(format);
    const first = await fixture.open(path, { limit: 4 });
    const bindings = writeBindings(basisTree(path, 'restart', writerCommits(path, 70)));
    const attempt = await admitted(first.service, bindings);
    const prepared = narrowed(await first.service.prepare(attempt, sources()), ObservationPrepared);
    expect(await first.service.authorizePublication(preparationOf(attempt))).toBeInstanceOf(ObservationPublicationPermission);
    await fixture.close(first);

    const second = await fixture.open(path, { limit: 4 });
    const resumed = narrowed(await second.service.resume(attempt.identity.attemptId, bindings), ObservationAdmitted);
    expect(resumed.phase).toBe('armed');
    const recovered = narrowed(await second.service.prepare(resumed.attempt, sources()), ObservationPrepared);
    expect(recovered.roots.parents).toEqual(prepared.roots.parents);
    expect(await second.service.authorizePublication(recovered)).toBeInstanceOf(ObservationReconcileOnly);
    expect(second.carriersPublished()).toBe(0);
    expect(constructionRefs(path)).toBe('');
  });

  it('resumes a partial construction, and refuses one that retained another basis', async () => {
    const path = await fixture.repository(format);
    const opened = await fixture.open(path, { limit: 4 });
    const heads = writerCommits(path, 130);
    const basis = basisTree(path, 'partial', heads);
    const attempt = await admitted(opened.service, readBindings(basis));
    const request = {
      identity: attempt.identity, claim: attempt.preparation.bindings.dependencies, dependencies: stream([]),
    };
    let checks = 0;
    const interrupted = await opened.support.retain({
      ...request,
      basis,
      isCancelled: () => {
        checks += 1;
        return checks > 1;
      },
    });
    expect(interrupted).toBeInstanceOf(ObservationSupportCancelled);
    const ref = constructionRefs(path);
    const partialTip = git(path, ['rev-parse', ref]);
    expect(opened.carriersPublished()).toBe(1);

    const other = basisTree(path, 'other', [...heads].reverse());
    const foreign = await opened.support.retain({ ...request, dependencies: stream([]), basis: other, isCancelled: () => false });
    expect(foreign).toEqual(new ObservationSupportRefused('construction-mismatch'));
    expect(git(path, ['rev-parse', ref])).toBe(partialTip);

    const prepared = narrowed(await opened.service.prepare(attempt, sources()), ObservationPrepared);
    const carriers = git(path, ['rev-list', '--first-parent', '-n', '3', prepared.roots.parents[0] ?? '']).split('\n');
    expect(carriers.map((commit) => parentCount(path, commit))).toEqual([5, 64, 63]);
    expect(opened.carriersPublished()).toBe(3);
    expect(carriers.at(-1)).toBe(partialTip);
    expect(constructionRefs(path)).toBe('');
    const retained = narrowed(await opened.service.settle(attempt, { core: readCore('resumed'), publication: null }), RetainedObservation);
    expect(await opened.service.resolve(retained.coordinate)).toBeInstanceOf(ResolvedObservation);
  });

  it('lets two racing builders of one attempt converge, each loser refused and nothing uncertain', async () => {
    const path = await fixture.repository(format);
    const left = await fixture.open(path, { limit: 4 });
    const right = await fixture.open(path, { limit: 4 });
    const attempt = await admitted(left.service, readBindings(basisTree(path, 'race', writerCommits(path, 130))));
    const racing = await Promise.all([left.service.prepare(attempt, sources()), right.service.prepare(attempt, sources())]);
    for (const outcome of racing.filter((candidate) => candidate instanceof ObservationRefused)) {
      expect(['construction-contended', 'construction-mismatch', 'contention', 'preparation-mismatch']).toContain(outcome.reason);
    }
    expect(racing.every((outcome) => !(outcome instanceof ObservationKnownUnpublished || outcome instanceof ObservationIndeterminate))).toBe(true);
    const prepared = narrowed(await right.service.prepare(attempt, sources()), ObservationPrepared);
    expect(prepared.roots.parents).toHaveLength(1);
    const retained = narrowed(await left.service.settle(attempt, { core: readCore('raced'), publication: null }), RetainedObservation);
    expect(await right.service.resolve(retained.coordinate)).toBeInstanceOf(ResolvedObservation);
  });

  it('refuses a second build of one attempt in one service, keeping the first owned', async () => {
    const path = await fixture.repository(format);
    const opened = await fixture.open(path, { limit: 4 });
    const attempt = await admitted(opened.service, readBindings(basisTree(path, 'twice', writerCommits(path, 2))));
    const [first, second] = await Promise.all([opened.service.prepare(attempt, sources()), opened.service.prepare(attempt, sources())]);
    expect(first).toBeInstanceOf(ObservationPrepared);
    expect(second).toEqual(new ObservationRefused('construction-contended'));
  });

  it('refuses a producer whose stream does not match its bound claim, before arm', async () => {
    const path = await fixture.repository(format);
    const opened = await fixture.open(path, { limit: 8 });
    const kept = blobDependency(blob(path, 'kept'));
    const dropped = blobDependency(blob(path, 'dropped'));
    const attempt = await admitted(opened.service, readBindings(basisTree(path, 'claim'), await claimOf([kept, dropped])));
    expect(await opened.service.prepare(attempt, sources([kept]))).toEqual(new ObservationRefused('dependency-mismatch'));
    expect(await opened.service.prepare(attempt, sources([dropped, kept]))).toEqual(new ObservationRefused('dependency-mismatch'));
    narrowed(await opened.service.prepare(attempt, sources([kept, dropped])), ObservationPrepared);

    const oneShot = await admitted(opened.service, readBindings(basisTree(path, 'one-shot'), await claimOf([kept])));
    const spent = sources([kept]);
    const iterator = spent.dependencies[Symbol.asyncIterator]();
    await iterator.next();
    await iterator.return?.();
    expect(await opened.service.prepare(oneShot, spent)).toEqual(new ObservationRefused('dependency-mismatch'));
  });

  it('refuses over-budget and missing support before arm', async () => {
    const path = await fixture.repository(format);
    const limits = new ObservationSupportLimits({ writers: 64, dependencies: 2, frontierBytes: 1024 * 1024, work: 100_000 });
    const opened = await fixture.open(path, { limit: 16, limits });
    const attempt = await admitted(opened.service, writeBindings(basisTree(path, 'budget', writerCommits(path, 70))));
    expect(await opened.service.prepare(attempt, sources())).toEqual(new ObservationRefused('writer-limit'));
    expect(opened.carriersPublished()).toBe(0);
    expect(await opened.service.authorizePublication(preparationOf(attempt))).toEqual(new ObservationRefused('not-prepared'));

    const content = blobDependency(blob(path, 'content'));
    const three = [content, content, content];
    const dependent = await admitted(opened.service, readBindings(basisTree(path, 'dependencies'), await claimOf(three)));
    expect(await opened.service.prepare(dependent, sources(three))).toEqual(new ObservationRefused('dependency-limit'));

    const missing = [blobDependency(missingOid(path, '1'))];
    const ghost = await admitted(opened.service, readBindings(basisTree(path, 'ghost'), await claimOf(missing)));
    expect(await opened.service.prepare(ghost, sources(missing))).toEqual(new ObservationRefused('dependency-unavailable'));
    const absent = await admitted(opened.service, readBindings(missingOid(path, '2')));
    expect(await opened.service.prepare(absent, sources())).toEqual(new ObservationRefused('basis-unavailable'));
    const headless = await admitted(opened.service, readBindings(basisTree(path, 'headless', [missingOid(path, '4')])));
    expect(await opened.service.prepare(headless, sources())).toEqual(new ObservationRefused('writer-head-unavailable'));
    const frontierless = await admitted(opened.service, readBindings(git(path, ['mktree'], '')));
    expect(await opened.service.prepare(frontierless, sources())).toEqual(new ObservationRefused('basis-corrupt'));
  });

  it('takes every accepted attempt through to resolve, refusing the rest before arm', async () => {
    const path = await fixture.repository(format);
    const heads = writerCommits(path, 3);
    const content = [blobDependency(blob(path, 'budgeted'))];
    const claim = await claimOf(content);
    const outcomes: string[] = [];
    for (let work = 0; work <= 16; work++) {
      const limits = new ObservationSupportLimits({ writers: 8, dependencies: 8, frontierBytes: 1024 * 1024, work });
      const opened = await fixture.open(path, { limit: 32, limits });
      const attempt = await admitted(opened.service, readBindings(basisTree(path, `budget-${work}`, heads), claim));
      const prepared = await opened.service.prepare(attempt, sources(content));
      if (prepared instanceof ObservationPrepared) {
        const retained = narrowed(await opened.service.settle(attempt, { core: readCore(`w${work}`), publication: null }), RetainedObservation);
        expect(await opened.service.resolve(retained.coordinate)).toBeInstanceOf(ResolvedObservation);
        outcomes.push('resolved');
      } else {
        expect(prepared).toEqual(new ObservationRefused('work-limit'));
        outcomes.push('refused');
      }
      await fixture.close(opened);
    }
    expect(outcomes[0]).toBe('refused');
    expect(outcomes.at(-1)).toBe('resolved');
    expect(outcomes.lastIndexOf('refused')).toBeLessThan(outcomes.indexOf('resolved'));
  });

  it('retains a real published cone basis, with its record trie and strand writers, through GC', async () => {
    const path = await fixture.repository(format);
    const opened = await fixture.open(path, { limit: 4 });
    const heads = writerCommits(path, 3);
    const record = blob(path, 'cone record');
    const family = git(path, ['mktree'], `100644 blob ${record}\trecord\n`);
    const records = git(path, ['mktree'], `040000 tree ${family}\tn\n`);
    const strand = 'ab'.repeat(32);
    const frontier = new ConeFrontier(new Map([
      ['alice', new ConeWriterPosition(heads[0] ?? '', 1)],
      ['bob', new ConeWriterPosition(heads[1] ?? '', 2)],
      [`@w.alice@s.${strand}`, new ConeWriterPosition(heads[2] ?? '', 3)],
    ]));
    const store = new GitConeRecordStoreAdapter({ history: new GitTimelineHistoryAdapter({ plumbing: await Plumbing.createDefault({ cwd: path }) }), codec });
    const head = ConeBasisHead.forLane(FIXTURE_GRAPH);
    const stored = await store.publishBasis(head, new ConeBasis(ConeRoot.at(records), frontier), null);
    const basis = stored?.revision ?? '';
    const retained = await retainRead(opened.service, { basis, label: 'real' });
    await store.dropBasis(head);
    removeFixtureRefs(path);
    collectGarbage(path);
    expect(await opened.service.resolve(retained.coordinate)).toBeInstanceOf(ResolvedObservation);
    expect(git(path, ['cat-file', '-p', record])).toBe('cone record');
    for (const commit of heads) {
      expect(git(path, ['cat-file', '-t', commit])).toBe('commit');
    }
  });

  it('refuses a dependency whose declared type is not its real one, and pins empty-tree behaviour', async () => {
    const path = await fixture.repository(format);
    const opened = await fixture.open(path, { limit: 4 });
    const mistyped = [treeDependency(blob(path, 'really a blob'))];
    const attempt = await admitted(opened.service, readBindings(basisTree(path, 'mistyped'), await claimOf(mistyped)));
    expect(await opened.service.prepare(attempt, sources(mistyped))).toEqual(new ObservationRefused('dependency-mismatch'));

    const empty = [treeDependency(git(path, ['mktree'], ''))];
    const hollow = await admitted(opened.service, readBindings(basisTree(path, 'hollow'), await claimOf(empty)));
    const outcome = await opened.service.prepare(hollow, sources(empty));
    expect(outcome).toEqual(new ObservationRefused('support-unverified'));
  });

  it('retains identical and distinct dependency pages through GC', async () => {
    const path = await fixture.repository(format);
    const opened = await fixture.open(path, { limit: 4 });
    const content = blob(path, 'retained content');
    const tree = basisTree(path, 'dependency tree');
    const dependencies = Array.from({ length: 2500 }, (_, index) =>
      (index % 2 === 0 ? blobDependency(content) : treeDependency(tree)));
    const retained = await retainRead(opened.service, { basis: basisTree(path, 'paged'), label: 'paged', dependencies });
    collectGarbage(path);
    expect(await opened.service.resolve(retained.coordinate)).toBeInstanceOf(ResolvedObservation);
    expect(git(path, ['cat-file', '-p', content])).toBe('retained content');
    expect(git(path, ['cat-file', '-t', tree])).toBe('tree');
  });

  it('returns typed unavailable evidence for removed and corrupted objects, and mints nothing', async () => {
    const path = await fixture.repository(format);
    const opened = await fixture.open(path, { limit: 8 });
    const heads = writerCommits(path, 3);
    const content = blob(path, 'removable content');
    const basis = basisTree(path, 'removable basis');
    const frontierBasis = basisTree(path, 'removable frontier', writerCommits(path, 1));
    const frontier = git(path, ['rev-parse', `${frontierBasis}:frontier`]);
    const corruptBasis = basisTree(path, 'corrupt frontier', writerCommits(path, 1));
    const corrupt = git(path, ['rev-parse', `${corruptBasis}:frontier`]);
    const withContent = await retainRead(opened.service, { basis: basisTree(path, 'c'), label: 'c', dependencies: [blobDependency(content)] });
    const withHistory = await retainRead(opened.service, { basis: basisTree(path, 'h', heads), label: 'h' });
    const withBasis = await retainRead(opened.service, { basis, label: 'b' });
    const withFrontier = await retainRead(opened.service, { basis: frontierBasis, label: 'f' });
    const withCorrupt = await retainRead(opened.service, { basis: corruptBasis, label: 'x' });
    const publication = writerCommits(path, 1)[0] ?? '';
    const written = await admitted(opened.service, writeBindings(basisTree(path, 'w')));
    narrowed(await opened.service.prepare(written, sources()), ObservationPrepared);
    narrowed(await opened.service.authorizePublication(preparationOf(written)), ObservationPublicationPermission);
    const withPublication = narrowed(await opened.service.settle(written, {
      core: writeCore('w'), publication: new ObservationPublicationEvidence('writer-1', publication),
    }), RetainedObservation);
    removeFixtureRefs(path);
    const refsBefore = git(path, ['for-each-ref']);

    await rm(loosePath(path, content));
    await rm(loosePath(path, heads[1] ?? ''));
    await rm(loosePath(path, basis));
    await rm(loosePath(path, frontier));
    await rm(loosePath(path, publication));
    await rm(loosePath(path, corrupt), { force: true });
    await writeFile(loosePath(path, corrupt), 'not a git object');
    expect(await opened.service.resolve(withContent.coordinate)).toEqual(new ObservationUnavailable('dependency-missing'));
    expect(await opened.service.resolve(withHistory.coordinate)).toEqual(new ObservationUnavailable('history-missing'));
    expect(await opened.service.resolve(withBasis.coordinate)).toEqual(new ObservationUnavailable('basis-missing'));
    expect(await opened.service.resolve(withFrontier.coordinate)).toEqual(new ObservationUnavailable('basis-missing'));
    expect(await opened.service.resolve(withPublication.coordinate)).toEqual(new ObservationUnavailable('evidence-unreadable'));
    // An object Git cannot parse counts as missing: neither is there to read.
    expect(await opened.service.resolve(withCorrupt.coordinate)).toEqual(new ObservationUnavailable('basis-missing'));
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
    expect(await opened.service.authorizePublication(preparationOf(attempt))).toBeInstanceOf(ObservationReconcileOnly);
    expect(narrowed(await opened.service.reconcile(attempt), ObservationReconciled).phase).toBe('armed');
    expect(await opened.service.authorizePublication(preparationOf(attempt))).toBeInstanceOf(ObservationReconcileOnly);
  });

  it('reconciles preparation and settlement when only the ledger update was lost', async () => {
    const path = await fixture.repository(format);
    const opened = await fixture.open(path, { limit: 4 });
    const attempt = await admitted(opened.service, readBindings(basisTree(path, 'window', writerCommits(path, 2))));

    await freezeLedger(path);
    expect(await opened.service.prepare(attempt, sources())).toBeInstanceOf(ObservationIndeterminate);
    await rm(join(path, 'hooks', 'reference-transaction'));
    expect(narrowed(await opened.service.reconcile(attempt), ObservationReconciled).phase).toBe('prepared');
    narrowed(await opened.service.prepare(attempt, sources()), ObservationPrepared);

    const core = readCore('window');
    await freezeLedger(path);
    expect(await opened.service.settle(attempt, { core, publication: null })).toBeInstanceOf(ObservationIndeterminate);
    await rm(join(path, 'hooks', 'reference-transaction'));
    expect(narrowed(await opened.service.reconcile(attempt), ObservationReconciled).phase).toBe('settled');
    const retained = narrowed(await opened.service.settle(attempt, { core, publication: null }), RetainedObservation);
    collectGarbage(path);
    expect(await opened.service.resolve(retained.coordinate)).toBeInstanceOf(ResolvedObservation);
  });
});
