import { execFileSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WARP_SUPPORT_LIMITS } from '../../../../src/application/WarpWriteComposition.ts';
import ObservationAdmitted from '../../../../src/domain/services/custody/ObservationAdmitted.ts';
import type ObservationCustodyIdentity from '../../../../src/domain/services/custody/ObservationCustodyIdentity.ts';
import ObservationDependencyClaim from '../../../../src/domain/services/custody/ObservationDependencyClaim.ts';
import ObservationSupportFault from '../../../../src/domain/services/custody/ObservationSupportFault.ts';
import ObservationSupportRetained from '../../../../src/domain/services/custody/ObservationSupportRetained.ts';
import type GitCasObservationSupportAdapter from '../../../../src/infrastructure/adapters/GitCasObservationSupportAdapter.ts';
import ObservationCustodyFixture, {
  FIXTURE_GRAPH,
  type OpenedCustody,
  basisTree,
  git,
  narrowed,
  readBindings,
  stream,
} from '../../../helpers/ObservationCustodyFixture.ts';

/**
 * Frontier anchors as custody's support contract states them (#1197): a write's basis is
 * retained through shared, deterministic anchor commits, so the new commits a write adds
 * when one writer head changes do not grow with the writer count, two clones hold the same
 * anchors for the same frontier, and verification still holds every head the basis names.
 */
const fixture = new ObservationCustodyFixture();
const CASE_TIMEOUT_MS = 240_000;
/** Writer counts for the boundedness witness: one carrier's worth, the newcomer limit, and close to `frontierBytes`. */
const WRITER_COUNTS = [64, 4096, 70_000];
/** Removing a repository of 70,000 heads and their anchors outlasts the default hook timeout on a slow runner. */
const CLEANUP_TIMEOUT_MS = 120_000;

afterEach(async () => {
  await fixture.dispose();
}, CLEANUP_TIMEOUT_MS);

let headSequence = 0;

/** `count` distinct root commits with fixed metadata, one fast-import for all, and no ref left behind. */
function heads(path: string, count: number): string[] {
  const first = headSequence;
  headSequence += count;
  const commands = Array.from({ length: count }, (_unused, index) => [
    'reset refs/warp-local/fixture-heads', `commit refs/warp-local/fixture-heads`, `mark :${index + 1}`,
    'committer Head <head@example.invalid> 0 +0000', `data <<END\nhead ${first + index}\nEND`, '',
  ].join('\n'));
  const marks = Array.from({ length: count }, (_unused, index) => `get-mark :${index + 1}`);
  const script = `${[...commands, 'reset refs/warp-local/fixture-heads', '', ...marks, 'done'].join('\n')}\n`;
  return execFileSync('git', ['fast-import', '--quiet', '--done'], { cwd: path, encoding: 'utf8', input: script, maxBuffer: 64 * 1024 * 1024 })
    .trim().split('\n');
}

function commitCount(path: string): number {
  const listed = execFileSync('git', ['cat-file', '--batch-all-objects', '--batch-check=%(objecttype)'], { cwd: path, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return listed.split('\n').filter((type) => type === 'commit').length;
}

async function attempt(opened: OpenedCustody, basis: string): Promise<ObservationCustodyIdentity> {
  return narrowed(await opened.service.begin(readBindings(basis)), ObservationAdmitted).attempt.identity;
}

function request(identity: ObservationCustodyIdentity, basis: string): Parameters<GitCasObservationSupportAdapter['retain']>[0] {
  return { identity, basis, claim: ObservationDependencyClaim.NONE, dependencies: stream([]), isCancelled: () => false };
}

async function retained(opened: OpenedCustody, basis: string): Promise<{ readonly identity: ObservationCustodyIdentity; readonly support: ObservationSupportRetained }> {
  const identity = await attempt(opened, basis);
  return { identity, support: narrowed(await opened.support.retain(request(identity, basis)), ObservationSupportRetained) };
}

/** The commits a retained carrier reaches that are neither the carrier nor any head: the anchors. */
function anchorsOf(path: string, carrier: string, named: readonly string[]): string[] {
  const listed = execFileSync('git', ['rev-list', '--stdin', carrier], { cwd: path, encoding: 'utf8', input: named.map((head) => `^${head}`).join('\n'), maxBuffer: 64 * 1024 * 1024 });
  return listed.trim().split('\n').filter((oid) => oid !== '' && oid !== carrier).sort();
}

function loosePath(path: string, oid: string): string {
  return join(path, 'objects', oid.slice(0, 2), oid.slice(2));
}

describe('frontier anchors bound what one changed head costs (#1197, D2)', () => {
  it.each(WRITER_COUNTS)('adds the same few commits when one of %i writer heads changes', async (writers) => {
    const path = await fixture.repository('sha1');
    const opened = await fixture.open(path, { limit: 8, limits: WARP_SUPPORT_LIMITS });
    const before = heads(path, writers);
    await retained(opened, basisTree(path, 'before', before));
    const after = [...before];
    after[writers - 1] = heads(path, 1)[0] ?? '';
    const changed = basisTree(path, 'after', after);
    const identity = await attempt(opened, changed);
    const counted = commitCount(path);

    narrowed(await opened.support.retain(request(identity, changed)), ObservationSupportRetained);

    // One leaf anchor and one branch anchor change, and the attempt adds its one carrier.
    expect(commitCount(path) - counted).toBe(3);
  }, CASE_TIMEOUT_MS);
});

describe.each(['sha1', 'sha256'])('frontier anchors on real Git (%s)', (format) => {
  it('retains a frontier past 4,096 writers with production limits, and verifies it', async () => {
    const path = await fixture.repository(format);
    const opened = await fixture.open(path, { limit: 8, limits: WARP_SUPPORT_LIMITS });
    const basis = basisTree(path, 'past', heads(path, 4097));

    const { identity, support } = await retained(opened, basis);

    expect(await opened.support.verify(identity, { basis, roots: support.roots, summary: support.summary })).toBeNull();
    expect(support.summary.writers).toBe(4097);
  }, CASE_TIMEOUT_MS);

  it('reuses every anchor for a second attempt over the same frontier, adding only its carrier', async () => {
    const path = await fixture.repository(format);
    const opened = await fixture.open(path, { limit: 8 });
    const basis = basisTree(path, 'same', heads(path, 200));
    const first = await retained(opened, basis);
    const identity = await attempt(opened, basis);
    const counted = commitCount(path);

    const second = narrowed(await opened.support.retain(request(identity, basis)), ObservationSupportRetained);

    expect(commitCount(path) - counted).toBe(1);
    expect(git(path, ['rev-parse', `${second.roots.parents[0] ?? ''}^@`])).toBe(git(path, ['rev-parse', `${first.support.roots.parents[0] ?? ''}^@`]));
  });

  it('gives two clones byte-identical anchors for the same frontier', async () => {
    const clones = await Promise.all([fixture.repository(format), fixture.repository(format)]);
    headSequence = 1_000_000;
    const [left = '', right = ''] = clones;
    const leftHeads = heads(left, 200);
    headSequence = 1_000_000;
    const rightHeads = heads(right, 200);
    const leftSupport = await retained(await fixture.open(left, { limit: 8 }), basisTree(left, 'shared', leftHeads));
    const rightSupport = await retained(await fixture.open(right, { limit: 8 }), basisTree(right, 'shared', rightHeads));

    const leftAnchors = anchorsOf(left, leftSupport.support.roots.parents[0] ?? '', leftHeads);
    const rightAnchors = anchorsOf(right, rightSupport.support.roots.parents[0] ?? '', rightHeads);

    expect(rightHeads).toEqual(leftHeads);
    expect(leftAnchors.length).toBeGreaterThan(1);
    expect(rightAnchors).toEqual(leftAnchors);
  });

  it('rebuilds only the anchors a crash left missing, and verifies the result', async () => {
    const path = await fixture.repository(format);
    const opened = await fixture.open(path, { limit: 8 });
    const named = heads(path, 5);
    const basis = basisTree(path, 'half', named);
    const first = await retained(opened, basis);
    const anchors = anchorsOf(path, first.support.roots.parents[0] ?? '', named);
    await opened.support.release(first.identity);
    const lost = anchors.filter((_anchor, index) => index % 2 === 0);
    await Promise.all(lost.map(async (anchor) => { await rm(loosePath(path, anchor)); }));
    const identity = await attempt(opened, basis);
    const counted = commitCount(path);

    const resumed = narrowed(await opened.support.retain(request(identity, basis)), ObservationSupportRetained);

    expect(lost.length).toBeGreaterThan(0);
    expect(commitCount(path) - counted).toBe(lost.length + 1);
    expect(await opened.support.verify(identity, { basis, roots: resumed.roots, summary: resumed.summary })).toBeNull();
  });

  it.each([
    ['an anchor', (anchors: readonly string[]): string => anchors[0] ?? ''],
    ['the last anchor, which the carrier names', (anchors: readonly string[]): string => anchors.at(-1) ?? ''],
  ])('reports %s removed after retention as missing history', async (_name, pick) => {
    const path = await fixture.repository(format);
    const opened = await fixture.open(path, { limit: 8 });
    const named = heads(path, 3);
    const basis = basisTree(path, 'removed', named);
    const { identity, support } = await retained(opened, basis);
    const removed = pick(anchorsOf(path, support.roots.parents[0] ?? '', named));
    expect(removed).not.toBe('');
    await rm(loosePath(path, removed));

    const verified = await opened.support.verify(identity, { basis, roots: support.roots, summary: support.summary });

    expect(verified).toEqual(new ObservationSupportFault('history-missing'));
  });

  it('reports a head removed after retention as missing history', async () => {
    const path = await fixture.repository(format);
    const opened = await fixture.open(path, { limit: 8 });
    const named = heads(path, 3);
    const basis = basisTree(path, 'head-removed', named);
    const { identity, support } = await retained(opened, basis);
    await rm(loosePath(path, named[1] ?? ''));

    const verified = await opened.support.verify(identity, { basis, roots: support.roots, summary: support.summary });

    expect(verified).toEqual(new ObservationSupportFault('history-missing'));
  });
});
