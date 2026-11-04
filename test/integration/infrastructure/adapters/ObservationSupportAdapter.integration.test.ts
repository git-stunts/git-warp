import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import Plumbing from '@git-stunts/plumbing';
import { afterEach, describe, expect, it } from 'vitest';
import ObservationAdmitted from '../../../../src/domain/services/custody/ObservationAdmitted.ts';
import type ObservationCustodyIdentity from '../../../../src/domain/services/custody/ObservationCustodyIdentity.ts';
import ObservationCustodyRoots from '../../../../src/domain/services/custody/ObservationCustodyRoots.ts';
import type ObservationDependency from '../../../../src/domain/services/custody/ObservationDependency.ts';
import ObservationDependencyClaim from '../../../../src/domain/services/custody/ObservationDependencyClaim.ts';
import ObservationDigest from '../../../../src/domain/services/custody/ObservationDigest.ts';
import ObservationSupportCancelled from '../../../../src/domain/services/custody/ObservationSupportCancelled.ts';
import ObservationSupportFault from '../../../../src/domain/services/custody/ObservationSupportFault.ts';
import ObservationSupportLimits from '../../../../src/domain/services/custody/ObservationSupportLimits.ts';
import ObservationSupportRefused from '../../../../src/domain/services/custody/ObservationSupportRefused.ts';
import ObservationSupportRetained from '../../../../src/domain/services/custody/ObservationSupportRetained.ts';
import ObservationSupportSummary from '../../../../src/domain/services/custody/ObservationSupportSummary.ts';
import { buildObservationConstructionRef } from '../../../../src/domain/utils/ObservationRefLayout.ts';
import GitCasObservationSupportAdapter from '../../../../src/infrastructure/adapters/GitCasObservationSupportAdapter.ts';
import GitTimelineHistoryAdapter from '../../../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import { OBSERVATION_DEPENDENCY_PAGE, OBSERVATION_DEPENDENCY_PAGES } from '../../../../src/infrastructure/adapters/ObservationDependencyPages.ts';
import codec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import ObservationCustodyFixture, {
  DEFAULT_SUPPORT_LIMITS,
  FIXTURE_GRAPH,
  type OpenedCustody,
  basisTree,
  blob,
  blobDependency,
  claimOf,
  git,
  narrowed,
  readBindings,
  removeFixtureRefs,
  stream,
  writerCommits,
} from '../../../helpers/ObservationCustodyFixture.ts';

const fixture = new ObservationCustodyFixture();

afterEach(async () => {
  await fixture.dispose();
});

type Harness = {
  readonly path: string;
  readonly opened: OpenedCustody;
  readonly basis: string;
  readonly identity: ObservationCustodyIdentity;
};

async function harness(format: string, heads: (path: string) => readonly string[] = () => []): Promise<Harness> {
  const path = await fixture.repository(format);
  const opened = await fixture.open(path, { limit: 8 });
  const basis = basisTree(path, 'support', heads(path));
  const { identity } = narrowed(await opened.service.begin(readBindings(basis)), ObservationAdmitted).attempt;
  return { path, opened, basis, identity };
}

function requestOf(h: Harness, options: {
  readonly dependencies?: readonly ObservationDependency[];
  readonly claim?: ObservationDependencyClaim;
  readonly basis?: string;
} = {}): Parameters<GitCasObservationSupportAdapter['retain']>[0] {
  return {
    identity: h.identity,
    basis: options.basis ?? h.basis,
    claim: options.claim ?? ObservationDependencyClaim.NONE,
    dependencies: stream(options.dependencies ?? []),
    isCancelled: () => false,
  };
}

function constructionRef(identity: ObservationCustodyIdentity): string {
  return buildObservationConstructionRef(FIXTURE_GRAPH, identity.attemptId.value);
}

function loosePath(path: string, oid: string): string {
  return join(path, 'objects', oid.slice(0, 2), oid.slice(2));
}

async function supportOver(h: Harness, overrides: {
  readonly limits?: ObservationSupportLimits;
  readonly commitFailure?: Error;
  readonly publications?: GitCasPublications;
}): Promise<GitCasObservationSupportAdapter> {
  const { commitFailure } = overrides;
  return new GitCasObservationSupportAdapter({
    publications: overrides.publications
      ?? (commitFailure === undefined ? h.opened.store.publications : { commit: async () => await Promise.reject(commitFailure) }),
    assets: h.opened.store.assets,
    history: new GitTimelineHistoryAdapter({ plumbing: await Plumbing.createDefault({ cwd: h.path }) }),
    crypto: new NodeCryptoAdapter(),
    codec,
    graphName: FIXTURE_GRAPH,
    limits: overrides.limits ?? DEFAULT_SUPPORT_LIMITS,
  });
}

type GitCasPublications = ConstructorParameters<typeof GitCasObservationSupportAdapter>[0]['publications'];

function coded(code: string): Error {
  return Object.assign(new Error(code), { code });
}

function limitsWith(changes: Partial<ConstructorParameters<typeof ObservationSupportLimits>[0]>): ObservationSupportLimits {
  return new ObservationSupportLimits({
    writers: DEFAULT_SUPPORT_LIMITS.writers,
    dependencies: DEFAULT_SUPPORT_LIMITS.dependencies,
    frontierBytes: DEFAULT_SUPPORT_LIMITS.frontierBytes,
    work: DEFAULT_SUPPORT_LIMITS.work,
    ...changes,
  });
}

describe.each(['sha1', 'sha256'])('GitCasObservationSupportAdapter on real Git (%s)', (format) => {
  it('reports a lost construction race as contention and surfaces anything else', async () => {
    const h = await harness(format, (path) => writerCommits(path, 2));
    const contended = await supportOver(h, { commitFailure: coded('PUBLICATION_CONFLICT') });
    expect(await contended.retain(requestOf(h))).toEqual(new ObservationSupportRefused('construction-contended'));
    const broken = await supportOver(h, { commitFailure: coded('GIT_ERROR') });
    await expect(broken.retain(requestOf(h))).rejects.toMatchObject({ code: 'GIT_ERROR' });
  });

  it('finds a carrier that landed with its acknowledgement lost, without publishing it again', async () => {
    const h = await harness(format, (path) => writerCommits(path, 2));
    const lost = new Error('acknowledgement lost');
    const lossy = await supportOver(h, {
      publications: {
        commit: async (request) => {
          await h.opened.store.publications.commit(request);
          throw lost;
        },
      },
    });
    await expect(lossy.retain(requestOf(h))).rejects.toBe(lost);
    const landed = git(h.path, ['rev-parse', constructionRef(h.identity)]);
    const resumed = narrowed(await h.opened.support.retain(requestOf(h)), ObservationSupportRetained);
    expect(resumed.roots.parents).toEqual([landed]);
    expect(h.opened.carriersPublished()).toBe(0);
  });

  it('refuses a construction ref that points at anything but this attempt', async () => {
    const h = await harness(format);
    const [foreign] = writerCommits(h.path, 1);
    git(h.path, ['update-ref', constructionRef(h.identity), foreign ?? '']);
    expect(await h.opened.support.retain(requestOf(h))).toEqual(new ObservationSupportRefused('construction-mismatch'));
  });

  it('refuses a complete construction of a different frontier, shorter or reordered', async () => {
    const h = await harness(format);
    const heads = writerCommits(h.path, 5);
    const whole = basisTree(h.path, 'whole', heads);
    narrowed(await h.opened.support.retain(requestOf(h, { basis: whole })), ObservationSupportRetained);
    expect(await h.opened.support.retain(requestOf(h, { basis: basisTree(h.path, 'shorter', heads.slice(0, 3)) })))
      .toEqual(new ObservationSupportRefused('construction-mismatch'));
    expect(await h.opened.support.retain(requestOf(h, { basis: basisTree(h.path, 'reordered', [...heads].reverse()) })))
      .toEqual(new ObservationSupportRefused('construction-mismatch'));
  });

  it('refuses to extend a partial final carrier, whose batch boundary differs', async () => {
    const h = await harness(format);
    const heads = writerCommits(h.path, 70);
    narrowed(await h.opened.support.retain(requestOf(h, { basis: basisTree(h.path, 'few', heads.slice(0, 5)) })), ObservationSupportRetained);
    expect(await h.opened.support.retain(requestOf(h, { basis: basisTree(h.path, 'many', heads) })))
      .toEqual(new ObservationSupportRefused('construction-mismatch'));
  });

  it('resumes a finished construction idempotently', async () => {
    const h = await harness(format, (path) => writerCommits(path, 5));
    const first = narrowed(await h.opened.support.retain(requestOf(h)), ObservationSupportRetained);
    const again = narrowed(await h.opened.support.retain(requestOf(h)), ObservationSupportRetained);
    expect(again.roots.parents).toEqual(first.roots.parents);
    expect(again.summary).toEqual(first.summary);
    expect(h.opened.carriersPublished()).toBe(1);
  });

  it('stops dependency and history work when cancelled, leaving nothing published', async () => {
    const h = await harness(format, (path) => writerCommits(path, 2));
    const content = [blobDependency(blob(h.path, 'content'))];
    const claim = await claimOf(content);
    const stoppedPages = await h.opened.support.retain({ ...requestOf(h, { dependencies: content, claim }), isCancelled: () => true });
    expect(stoppedPages).toBeInstanceOf(ObservationSupportCancelled);
    const stoppedChain = await h.opened.support.retain({ ...requestOf(h), isCancelled: () => true });
    expect(stoppedChain).toBeInstanceOf(ObservationSupportCancelled);
    expect(h.opened.carriersPublished()).toBe(0);
  });

  it('checks a dependency exists before writing its page', async () => {
    const h = await harness(format);
    const ghost = blobDependency((git(h.path, ['rev-parse', '--show-object-format']) === 'sha256' ? '7' : '7').repeat(h.basis.length));
    const dependencies = Array.from({ length: OBSERVATION_DEPENDENCY_PAGE }, () => ghost);
    expect(await h.opened.support.retain(requestOf(h, { dependencies, claim: await claimOf(dependencies) })))
      .toEqual(new ObservationSupportRefused('dependency-unavailable'));
  });

  it('refuses more dependencies than bounded pages can hold, whatever the configured limit', async () => {
    const h = await harness(format);
    const content = blobDependency(blob(h.path, 'content'));
    const generous = await supportOver(h, { limits: limitsWith({ dependencies: Number.MAX_SAFE_INTEGER, work: Number.MAX_SAFE_INTEGER }) });
    let pulled = 0;
    async function* endless(): AsyncGenerator<ObservationDependency> {
      for (;;) {
        pulled += 1;
        yield await Promise.resolve(content);
      }
    }
    const claim = new ObservationDependencyClaim(Number.MAX_SAFE_INTEGER, ObservationDependencyClaim.NONE.digest);
    const outcome = await generous.retain({ ...requestOf(h, { claim }), dependencies: endless() });
    expect(outcome).toEqual(new ObservationSupportRefused('dependency-limit'));
    expect(pulled).toBe((OBSERVATION_DEPENDENCY_PAGE * OBSERVATION_DEPENDENCY_PAGES) + 1);
  });

  it('stops a stream at the count its claim allows', async () => {
    const h = await harness(format);
    const content = blobDependency(blob(h.path, 'content'));
    const claim = await claimOf([content]);
    let pulled = 0;
    async function* longer(): AsyncGenerator<ObservationDependency> {
      for (;;) {
        pulled += 1;
        yield await Promise.resolve(content);
      }
    }
    expect(await h.opened.support.retain({ ...requestOf(h, { claim }), dependencies: longer() }))
      .toEqual(new ObservationSupportRefused('dependency-mismatch'));
    expect(pulled).toBe(2);
  });

  it('pulls no more than one page of dependencies ahead of the pages it has written', async () => {
    const h = await harness(format);
    const real = await Plumbing.createDefault({ cwd: h.path });
    let pagesWritten = 0;
    const plumbing = {
      execute: async (options: { args: string[]; input?: string | Buffer }): Promise<string> => {
        if (options.args[0] === 'fast-import') {
          pagesWritten += 1;
        }
        return await real.execute(options);
      },
      executeStream: async (options: { args: string[] }) => await real.executeStream(options),
    };
    const history = new GitTimelineHistoryAdapter({ plumbing: real });
    const support = new GitCasObservationSupportAdapter({
      publications: h.opened.store.publications,
      assets: h.opened.store.assets,
      history: {
        plumbing,
        readRef: async (ref) => await history.readRef(ref),
        deleteRef: async (ref) => await history.deleteRef(ref),
        nodeExists: async (oid) => await history.nodeExists(oid),
        readBlob: async (oid) => await history.readBlob(oid),
        readTreeObjectEntries: async (oid) => await history.readTreeObjectEntries(oid),
      },
      crypto: new NodeCryptoAdapter(),
      codec,
      graphName: FIXTURE_GRAPH,
      limits: DEFAULT_SUPPORT_LIMITS,
    });
    const content = blobDependency(blob(h.path, 'streamed'));
    const all = Array.from({ length: 2500 }, () => content);
    let pulled = 0;
    let furthestAhead = 0;
    async function* watched(): AsyncGenerator<ObservationDependency> {
      for (const dependency of all) {
        pulled += 1;
        furthestAhead = Math.max(furthestAhead, pulled - (pagesWritten * OBSERVATION_DEPENDENCY_PAGE));
        yield await Promise.resolve(dependency);
      }
    }
    narrowed(await support.retain({ ...requestOf(h, { claim: await claimOf(all) }), dependencies: watched() }), ObservationSupportRetained);
    expect(pulled).toBe(all.length);
    expect(pagesWritten).toBe(3);
    expect(furthestAhead).toBeLessThanOrEqual(OBSERVATION_DEPENDENCY_PAGE);
    expect(furthestAhead).toBeGreaterThan(1);
  });

  it('enforces its frontier byte and work bounds while building', async () => {
    const h = await harness(format, (path) => writerCommits(path, 3));
    const small = await supportOver(h, { limits: limitsWith({ frontierBytes: 1 }) });
    expect(await small.retain(requestOf(h))).toEqual(new ObservationSupportRefused('frontier-limit'));
    for (const work of [0, 1, 2, 3, 4]) {
      const meager = await supportOver(h, { limits: limitsWith({ work }) });
      expect(await meager.retain(requestOf(h))).toEqual(new ObservationSupportRefused('work-limit'));
    }
    const content = [blobDependency(blob(h.path, 'metered'))];
    const noPages = await supportOver(h, { limits: limitsWith({ work: 4 }) });
    expect(await noPages.retain(requestOf(h, { dependencies: content, claim: await claimOf(content) })))
      .toEqual(new ObservationSupportRefused('work-limit'));
  });

  it('reports a work-exhausted resume as such, not as a mismatch', async () => {
    const h = await harness(format, (path) => writerCommits(path, 3));
    narrowed(await h.opened.support.retain(requestOf(h)), ObservationSupportRetained);
    const meager = await supportOver(h, { limits: limitsWith({ work: 5 }) });
    expect(await meager.retain(requestOf(h))).toEqual(new ObservationSupportRefused('work-limit'));
  });

  it('refuses a corrupt frontier and a frontier naming too many writers', async () => {
    const h = await harness(format);
    const junk = blob(h.path, 'not a frontier');
    const corrupt = git(h.path, ['mktree'], `100644 blob ${junk}\tfrontier\n`);
    expect(await h.opened.support.retain(requestOf(h, { basis: corrupt }))).toEqual(new ObservationSupportRefused('basis-corrupt'));
    expect(await h.opened.support.retain(requestOf(h, { basis: junk }))).toEqual(new ObservationSupportRefused('basis-corrupt'));
    const few = await supportOver(h, { limits: limitsWith({ writers: 1 }) });
    expect(await few.retain(requestOf(h, { basis: basisTree(h.path, 'two', writerCommits(h.path, 2)) })))
      .toEqual(new ObservationSupportRefused('writer-limit'));
  });

  it('retains one head once when two writers share it', async () => {
    const h = await harness(format);
    const [head = ''] = writerCommits(h.path, 1);
    const shared = narrowed(await h.opened.support.retain(requestOf(h, { basis: basisTree(h.path, 'shared', [head, head]) })), ObservationSupportRetained);
    expect(shared.summary.writers).toBe(1);
  });

  it('releases only existing construction state', async () => {
    const h = await harness(format, (path) => writerCommits(path, 1));
    await expect(h.opened.support.release(h.identity)).resolves.toBeUndefined();
    narrowed(await h.opened.support.retain(requestOf(h)), ObservationSupportRetained);
    expect(git(h.path, ['for-each-ref', constructionRef(h.identity)])).not.toBe('');
    await h.opened.support.release(h.identity);
    expect(git(h.path, ['for-each-ref', constructionRef(h.identity)])).toBe('');
  });

  describe('verify', () => {
    async function retained(h: Harness, dependency: string): Promise<ObservationSupportRetained> {
      const dependencies = [blobDependency(dependency)];
      return narrowed(
        await h.opened.support.retain(requestOf(h, { dependencies, claim: await claimOf(dependencies) })),
        ObservationSupportRetained,
      );
    }

    function withSummary(summary: ObservationSupportSummary, changes: Partial<ConstructorParameters<typeof ObservationSupportSummary>[0]>): ObservationSupportSummary {
      return new ObservationSupportSummary({
        writers: summary.writers,
        history: summary.history,
        dependencies: summary.dependencies,
        dependency: summary.dependency,
        pages: summary.pages,
        ...changes,
      });
    }

    it('accepts retained edges in any support order', async () => {
      const h = await harness(format, (path) => writerCommits(path, 2));
      const { roots, summary } = await retained(h, blob(h.path, 'kept'));
      const reversed = new ObservationCustodyRoots([...roots.supports].reverse(), roots.parents);
      expect(await h.opened.support.verify(h.identity, { basis: h.basis, roots: reversed, summary })).toBeNull();
    });

    it('holds retained history to what the basis frontier names', async () => {
      const h = await harness(format, (path) => writerCommits(path, 2));
      const { roots, summary } = await retained(h, blob(h.path, 'kept'));
      const forged = new ObservationDigest('00'.repeat(32));
      const verify = async (changes: Parameters<typeof withSummary>[1]): Promise<ObservationSupportFault | null> =>
        await h.opened.support.verify(h.identity, { basis: h.basis, roots, summary: withSummary(summary, changes) });
      expect(await verify({ writers: 9 })).toEqual(new ObservationSupportFault('history-mismatch'));
      expect(await verify({ history: forged })).toEqual(new ObservationSupportFault('history-mismatch'));
      expect(await verify({ dependencies: 9 })).toEqual(new ObservationSupportFault('dependency-mismatch'));
      expect(await verify({ dependency: forged })).toEqual(new ObservationSupportFault('dependency-mismatch'));

      const narrower = basisTree(h.path, 'narrower', writerCommits(h.path, 1));
      expect(await h.opened.support.verify(h.identity, {
        basis: narrower, roots: new ObservationCustodyRoots([...roots.supports, { type: 'tree', oid: narrower }], roots.parents), summary,
      })).toEqual(new ObservationSupportFault('history-mismatch'));
    });

    it('refuses a chain that retains other heads than its frontier, or none at all', async () => {
      const h = await harness(format, (path) => writerCommits(path, 2));
      const { roots, summary } = await retained(h, blob(h.path, 'kept'));
      const unchained = new ObservationCustodyRoots(roots.supports, []);
      expect(await h.opened.support.verify(h.identity, { basis: h.basis, roots: unchained, summary }))
        .toEqual(new ObservationSupportFault('history-missing'));

      const other = await harness(format, (path) => writerCommits(path, 2));
      const otherEdges = await retained(other, blob(other.path, 'other'));
      expect(await other.opened.support.verify(other.identity, {
        basis: other.basis,
        roots: new ObservationCustodyRoots(otherEdges.roots.supports, [other.basis]),
        summary: otherEdges.summary,
      })).toEqual(new ObservationSupportFault('history-mismatch'));

      const empty = await harness(format);
      const noHeads = await retained(empty, blob(empty.path, 'none'));
      expect(await empty.opened.support.verify(empty.identity, { basis: empty.basis, roots: noHeads.roots, summary: noHeads.summary })).toBeNull();
    });

    it('refuses an honest chain that retains other heads than the basis names', async () => {
      const h = await harness(format);
      const heads = writerCommits(h.path, 2);
      const basis = basisTree(h.path, 'named', heads);
      const named = narrowed(await h.opened.support.retain(requestOf(h, { basis })), ObservationSupportRetained);
      await h.opened.support.release(h.identity);
      const sameCount = narrowed(await h.opened.support.retain(requestOf(h, { basis: basisTree(h.path, 'same', writerCommits(h.path, 2)) })), ObservationSupportRetained);
      await h.opened.support.release(h.identity);
      const otherCount = narrowed(await h.opened.support.retain(requestOf(h, { basis: basisTree(h.path, 'more', writerCommits(h.path, 3)) })), ObservationSupportRetained);
      for (const chain of [sameCount, otherCount]) {
        const roots = new ObservationCustodyRoots(named.roots.supports, chain.roots.parents);
        expect(await h.opened.support.verify(h.identity, { basis, roots, summary: named.summary }))
          .toEqual(new ObservationSupportFault('history-mismatch'));
      }
    });

    it('refuses declared edges custody does not hold', async () => {
      const h = await harness(format);
      const { roots, summary } = await retained(h, blob(h.path, 'kept'));
      const unheld = new ObservationCustodyRoots(roots.supports.filter((entry) => entry.oid === h.basis), roots.parents);
      expect(await h.opened.support.verify(h.identity, { basis: h.basis, roots: unheld, summary }))
        .toEqual(new ObservationSupportFault('dependency-mismatch'));
      expect(await h.opened.support.verify(h.identity, { basis: basisTree(h.path, 'other'), roots, summary }))
        .toEqual(new ObservationSupportFault('dependency-mismatch'));
    });

    it('enforces its work bound at the basis, pages, entries and chain', async () => {
      const h = await harness(format, (path) => writerCommits(path, 2));
      const { roots, summary } = await retained(h, blob(h.path, 'kept'));
      for (const work of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
        const meager = await supportOver(h, { limits: limitsWith({ work }) });
        expect(await meager.verify(h.identity, { basis: h.basis, roots, summary })).toEqual(new ObservationSupportFault('work-limit'));
      }
      const enough = await supportOver(h, { limits: limitsWith({ work: 9 }) });
      expect(await enough.verify(h.identity, { basis: h.basis, roots, summary })).toBeNull();
    });

    it('reports a removed entry, page, carrier, basis child and publication', async () => {
      const h = await harness(format, (path) => writerCommits(path, 1));
      const content = blob(h.path, 'removable');
      const { roots, summary } = await retained(h, content);
      expect(await h.opened.support.verify(h.identity, { basis: h.basis, roots, summary })).toBeNull();
      await rm(loosePath(h.path, content));
      expect(await h.opened.support.verify(h.identity, { basis: h.basis, roots, summary }))
        .toEqual(new ObservationSupportFault('dependency-missing'));

      const page = await harness(format);
      const pages = await retained(page, blob(page.path, 'paged'));
      await rm(loosePath(page.path, pages.summary.pages[0] ?? ''));
      expect(await page.opened.support.verify(page.identity, { basis: page.basis, roots: pages.roots, summary: pages.summary }))
        .toEqual(new ObservationSupportFault('dependency-missing'));

      const carrier = await harness(format, (path) => writerCommits(path, 1));
      const chained = await retained(carrier, blob(carrier.path, 'carried'));
      await rm(loosePath(carrier.path, chained.roots.parents[0] ?? ''));
      expect(await carrier.opened.support.verify(carrier.identity, { basis: carrier.basis, roots: chained.roots, summary: chained.summary }))
        .toEqual(new ObservationSupportFault('history-missing'));

      const child = await harness(format);
      const childEdges = await retained(child, blob(child.path, 'c'));
      await rm(loosePath(child.path, git(child.path, ['rev-parse', `${child.basis}:layout`])));
      expect(await child.opened.support.verify(child.identity, { basis: child.basis, roots: childEdges.roots, summary: childEdges.summary }))
        .toEqual(new ObservationSupportFault('basis-missing'));

      const corrupt = await harness(format);
      const corruptEdges = await retained(corrupt, blob(corrupt.path, 'x'));
      await rm(loosePath(corrupt.path, corrupt.basis));
      expect(await corrupt.opened.support.verify(corrupt.identity, { basis: corrupt.basis, roots: corruptEdges.roots, summary: corruptEdges.summary }))
        .toEqual(new ObservationSupportFault('basis-missing'));

      const [commit = ''] = writerCommits(h.path, 1);
      expect(await h.opened.support.verifyPublication(commit)).toBeNull();
      removeFixtureRefs(h.path);
      await rm(loosePath(h.path, commit));
      expect(await h.opened.support.verifyPublication(commit)).toEqual(new ObservationSupportFault('publication-missing'));
    });

    it('reports an undecodable frontier as corrupt', async () => {
      const h = await harness(format);
      const { summary } = await retained(h, blob(h.path, 'kept'));
      const junk = blob(h.path, 'junk frontier');
      const corrupt = git(h.path, ['mktree'], `100644 blob ${junk}\tfrontier\n`);
      expect(await h.opened.support.verify(h.identity, { basis: corrupt, roots: new ObservationCustodyRoots([], []), summary }))
        .toEqual(new ObservationSupportFault('basis-corrupt'));
    });
  });
});
