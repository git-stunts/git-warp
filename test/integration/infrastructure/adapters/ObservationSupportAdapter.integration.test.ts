import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import ObservationAdmitted from '../../../../src/domain/services/custody/ObservationAdmitted.ts';
import type ObservationCustodyIdentity from '../../../../src/domain/services/custody/ObservationCustodyIdentity.ts';
import ObservationCustodyRoots from '../../../../src/domain/services/custody/ObservationCustodyRoots.ts';
import ObservationDigest from '../../../../src/domain/services/custody/ObservationDigest.ts';
import ObservationSupportCancelled from '../../../../src/domain/services/custody/ObservationSupportCancelled.ts';
import ObservationSupportFault from '../../../../src/domain/services/custody/ObservationSupportFault.ts';
import ObservationSupportLimits from '../../../../src/domain/services/custody/ObservationSupportLimits.ts';
import ObservationSupportRefused from '../../../../src/domain/services/custody/ObservationSupportRefused.ts';
import type { ObservationSupportRequest } from '../../../../src/domain/services/custody/ObservationSupportRequest.ts';
import ObservationSupportRetained from '../../../../src/domain/services/custody/ObservationSupportRetained.ts';
import ObservationSupportSummary from '../../../../src/domain/services/custody/ObservationSupportSummary.ts';
import { buildObservationConstructionRef } from '../../../../src/domain/utils/ObservationRefLayout.ts';
import GitCasObservationSupportAdapter from '../../../../src/infrastructure/adapters/GitCasObservationSupportAdapter.ts';
import GitTimelineHistoryAdapter from '../../../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import { OBSERVATION_DEPENDENCY_PAGE } from '../../../../src/infrastructure/adapters/ObservationDependencyPages.ts';
import Plumbing from '@git-stunts/plumbing';
import ObservationCustodyFixture, {
  FIXTURE_GRAPH,
  type OpenedCustody,
  basisTree,
  blob,
  blobDependency,
  git,
  narrowed,
  readBindings,
  sources,
  stream,
  writerCommits,
} from '../../../helpers/ObservationCustodyFixture.ts';

const fixture = new ObservationCustodyFixture();
const LIMITS = new ObservationSupportLimits({ writers: 512, dependencies: 4096 });

afterEach(async () => {
  await fixture.dispose();
});

type Harness = {
  readonly path: string;
  readonly opened: OpenedCustody;
  readonly basis: string;
  readonly identity: ObservationCustodyIdentity;
  readonly request: Omit<ObservationSupportRequest, 'writerHeads' | 'dependencies'>;
};

async function harness(format: string): Promise<Harness> {
  const path = await fixture.repository(format);
  const opened = await fixture.open(path, { limit: 8 });
  const basis = basisTree(path, 'support');
  const { identity } = narrowed(await opened.service.begin(readBindings(basis)), ObservationAdmitted).attempt;
  return { path, opened, basis, identity, request: { identity, basis, limits: LIMITS, isCancelled: () => false } };
}

function constructionRef(identity: ObservationCustodyIdentity): string {
  return buildObservationConstructionRef(FIXTURE_GRAPH, identity.attemptId.value);
}

function loosePath(path: string, oid: string): string {
  return join(path, 'objects', oid.slice(0, 2), oid.slice(2));
}

/** A support adapter over `path` whose publications fail with `cause`. */
async function failingSupport(opened: OpenedCustody, path: string, cause: Error): Promise<GitCasObservationSupportAdapter> {
  return new GitCasObservationSupportAdapter({
    publications: { commit: async () => await Promise.reject(cause) },
    assets: opened.store.assets,
    history: new GitTimelineHistoryAdapter({ plumbing: await Plumbing.createDefault({ cwd: path }) }),
    crypto: new NodeCryptoAdapter(),
    graphName: FIXTURE_GRAPH,
  });
}

function coded(code: string): Error {
  return Object.assign(new Error(code), { code });
}

describe.each(['sha1', 'sha256'])('GitCasObservationSupportAdapter on real Git (%s)', (format) => {
  it('reports a lost construction race as contention and surfaces anything else', async () => {
    const { path, opened, request } = await harness(format);
    const heads = sources(writerCommits(path, 2));
    const contended = await failingSupport(opened, path, coded('PUBLICATION_CONFLICT'));
    expect(await contended.retain({ ...request, ...heads })).toEqual(new ObservationSupportRefused('construction-contended'));
    const broken = await failingSupport(opened, path, coded('GIT_ERROR'));
    await expect(broken.retain({ ...request, ...sources(writerCommits(path, 2)) })).rejects.toMatchObject({ code: 'GIT_ERROR' });
  });

  it('refuses a construction ref that points at anything but this attempt', async () => {
    const { path, opened, request, identity } = await harness(format);
    const [foreign] = writerCommits(path, 1);
    git(path, ['update-ref', constructionRef(identity), foreign ?? '']);
    expect(await opened.support.retain({ ...request, ...sources() })).toEqual(new ObservationSupportRefused('construction-mismatch'));
  });

  it('refuses a complete construction when the input has fewer heads than it retained', async () => {
    const { path, opened, request } = await harness(format);
    const heads = writerCommits(path, 5);
    narrowed(await opened.support.retain({ ...request, ...sources(heads) }), ObservationSupportRetained);
    expect(await opened.support.retain({ ...request, ...sources(heads.slice(0, 3)) }))
      .toEqual(new ObservationSupportRefused('construction-mismatch'));
    expect(await opened.support.retain({ ...request, ...sources([heads[1] ?? '', heads[0] ?? '', ...heads.slice(2)]) }))
      .toEqual(new ObservationSupportRefused('construction-mismatch'));
  });

  it('refuses extension of a partial final carrier, since its batch boundary differs', async () => {
    const { path, opened, request } = await harness(format);
    const heads = writerCommits(path, 70);
    narrowed(await opened.support.retain({ ...request, ...sources(heads.slice(0, 5)) }), ObservationSupportRetained);
    expect(await opened.support.retain({ ...request, ...sources(heads) }))
      .toEqual(new ObservationSupportRefused('construction-mismatch'));
  });

  it('resumes an interrupted construction idempotently from the same input', async () => {
    const { path, opened, request } = await harness(format);
    const heads = writerCommits(path, 5);
    const first = narrowed(await opened.support.retain({ ...request, ...sources(heads) }), ObservationSupportRetained);
    const again = narrowed(await opened.support.retain({ ...request, ...sources(heads) }), ObservationSupportRetained);
    expect(again.roots.parents).toEqual(first.roots.parents);
    expect(again.summary).toEqual(first.summary);
  });

  it('stops dependency work when cancelled and leaves no page', async () => {
    const { opened, request, path } = await harness(format);
    const content = blobDependency(blob(path, 'content'));
    const outcome = await opened.support.retain({ ...request, isCancelled: () => true, ...sources([], [content]) });
    expect(outcome).toBeInstanceOf(ObservationSupportCancelled);
  });

  it('refuses a full dependency page holding a missing object', async () => {
    const { opened, request, path } = await harness(format);
    const ghost = blobDependency((git(path, ['rev-parse', '--show-object-format']) === 'sha256' ? '7'.repeat(64) : '7'.repeat(40)));
    const dependencies = Array.from({ length: OBSERVATION_DEPENDENCY_PAGE }, () => ghost);
    expect(await opened.support.retain({ ...request, ...sources([], dependencies) }))
      .toEqual(new ObservationSupportRefused('dependency-unavailable'));
  });

  it('refuses more dependencies than bounded pages can hold, whatever the configured limit', async () => {
    const { opened, request, path } = await harness(format);
    const content = blobDependency(blob(path, 'content'));
    const generous = new ObservationSupportLimits({ writers: 1, dependencies: Number.MAX_SAFE_INTEGER });
    let pulled = 0;
    async function* endless(): AsyncGenerator<typeof content> {
      for (;;) {
        pulled += 1;
        yield await Promise.resolve(content);
      }
    }
    const outcome = await opened.support.retain({ ...request, limits: generous, writerHeads: stream([]), dependencies: endless() });
    expect(outcome).toEqual(new ObservationSupportRefused('dependency-limit'));
    expect(pulled).toBe((OBSERVATION_DEPENDENCY_PAGE * 63) + 1);
  }, 120_000);

  it('releases only existing construction state', async () => {
    const { path, opened, request, identity } = await harness(format);
    await expect(opened.support.release(identity)).resolves.toBeUndefined();
    narrowed(await opened.support.retain({ ...request, ...sources(writerCommits(path, 1)) }), ObservationSupportRetained);
    expect(git(path, ['for-each-ref', constructionRef(identity)])).not.toBe('');
    await opened.support.release(identity);
    expect(git(path, ['for-each-ref', constructionRef(identity)])).toBe('');
  });

  describe('verify', () => {
    async function retained(h: Harness, heads: readonly string[], dependency: string): Promise<ObservationSupportRetained> {
      return narrowed(
        await h.opened.support.retain({ ...h.request, ...sources(heads, [blobDependency(dependency)]) }),
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
      const h = await harness(format);
      const { roots, summary } = await retained(h, writerCommits(h.path, 2), blob(h.path, 'kept'));
      const reversed = new ObservationCustodyRoots([...roots.supports].reverse(), roots.parents);
      expect(await h.opened.support.verify(h.identity, { basis: h.basis, roots: reversed, summary })).toBeNull();
    });

    it('accepts no history when no writer was declared, and refuses a missing chain', async () => {
      const h = await harness(format);
      const { roots, summary } = await retained(h, [], blob(h.path, 'kept'));
      expect(await h.opened.support.verify(h.identity, { basis: h.basis, roots, summary })).toBeNull();
      expect(await h.opened.support.verify(h.identity, { basis: h.basis, roots, summary: withSummary(summary, { writers: 1 }) }))
        .toEqual(new ObservationSupportFault('history-missing'));
    });

    it('refuses declared edges custody does not hold', async () => {
      const h = await harness(format);
      const { roots, summary } = await retained(h, [], blob(h.path, 'kept'));
      const unheld = new ObservationCustodyRoots(roots.supports.filter((entry) => entry.oid === h.basis), roots.parents);
      expect(await h.opened.support.verify(h.identity, { basis: h.basis, roots: unheld, summary }))
        .toEqual(new ObservationSupportFault('dependency-mismatch'));
      const otherBasis = basisTree(h.path, 'other');
      expect(await h.opened.support.verify(h.identity, { basis: otherBasis, roots, summary }))
        .toEqual(new ObservationSupportFault('dependency-mismatch'));
    });

    it('refuses a summary its edges do not match', async () => {
      const h = await harness(format);
      const { roots, summary } = await retained(h, writerCommits(h.path, 2), blob(h.path, 'kept'));
      const verify = async (changed: ObservationSupportSummary): Promise<ObservationSupportFault | null> =>
        await h.opened.support.verify(h.identity, { basis: h.basis, roots, summary: changed });
      const forged = new ObservationDigest('00'.repeat(32));
      expect(await verify(withSummary(summary, { dependencies: 9 }))).toEqual(new ObservationSupportFault('dependency-mismatch'));
      expect(await verify(withSummary(summary, { dependency: forged }))).toEqual(new ObservationSupportFault('dependency-mismatch'));
      expect(await verify(withSummary(summary, { writers: 9 }))).toEqual(new ObservationSupportFault('history-mismatch'));
      expect(await verify(withSummary(summary, { history: forged }))).toEqual(new ObservationSupportFault('history-mismatch'));
    });

    it('reports a removed page, entry, carrier and publication', async () => {
      const h = await harness(format);
      const content = blob(h.path, 'removable');
      const { roots, summary } = await retained(h, writerCommits(h.path, 1), content);
      const verify = async (): Promise<ObservationSupportFault | null> =>
        await h.opened.support.verify(h.identity, { basis: h.basis, roots, summary });
      expect(await verify()).toBeNull();
      await rm(loosePath(h.path, content));
      expect(await verify()).toEqual(new ObservationSupportFault('dependency-missing'));

      const page = await harness(format);
      const pages = await retained(page, [], blob(page.path, 'paged'));
      await rm(loosePath(page.path, pages.summary.pages[0] ?? ''));
      expect(await page.opened.support.verify(page.identity, { basis: page.basis, roots: pages.roots, summary: pages.summary }))
        .toEqual(new ObservationSupportFault('dependency-missing'));

      const carrier = await harness(format);
      const chained = await retained(carrier, writerCommits(carrier.path, 1), blob(carrier.path, 'carried'));
      await rm(loosePath(carrier.path, chained.roots.parents[0] ?? ''));
      expect(await carrier.opened.support.verify(carrier.identity, { basis: carrier.basis, roots: chained.roots, summary: chained.summary }))
        .toEqual(new ObservationSupportFault('history-missing'));

      const missingBasis = await harness(format);
      const absent = await retained(missingBasis, [], blob(missingBasis.path, 'b'));
      await rm(loosePath(missingBasis.path, missingBasis.basis));
      expect(await missingBasis.opened.support.verify(missingBasis.identity, { basis: missingBasis.basis, roots: absent.roots, summary: absent.summary }))
        .toEqual(new ObservationSupportFault('basis-missing'));

      const [commit] = writerCommits(h.path, 1);
      expect(await h.opened.support.verifyPublication(commit ?? '')).toBeNull();
      git(h.path, ['update-ref', '-d', `refs/warp/${FIXTURE_GRAPH}/writers/w0`]);
      await rm(loosePath(h.path, commit ?? ''));
      expect(await h.opened.support.verifyPublication(commit ?? '')).toEqual(new ObservationSupportFault('publication-missing'));
    });
  });
});
