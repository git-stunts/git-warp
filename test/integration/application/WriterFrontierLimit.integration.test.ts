import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { intent } from '../../../advanced.ts';
import type { Warp } from '../../../index.ts';
import { WARP_SUPPORT_LIMITS } from '../../../src/application/WarpWriteComposition.ts';
import ConeBasis from '../../../src/domain/services/cone/ConeBasis.ts';
import ConeFrontier from '../../../src/domain/services/cone/ConeFrontier.ts';
import ConeLaneBasis from '../../../src/domain/services/cone/ConeLaneBasis.ts';
import ConeWritePremise from '../../../src/domain/services/cone/ConeWritePremise.ts';
import ConeWriterPosition from '../../../src/domain/services/cone/ConeWriterPosition.ts';
import StoredConeBasis from '../../../src/domain/services/cone/StoredConeBasis.ts';
import ConeFrontierCborCodec from '../../../src/infrastructure/adapters/ConeFrontierCborCodec.ts';
import codec from '../../../src/infrastructure/codecs/CborCodec.ts';
import MeteredObservationCustody from '../../helpers/MeteredObservationCustody.ts';
import * as fixture from '../../helpers/WarpWriteFixture.ts';

/**
 * The writer limit as both of its readers see one frontier (#1075): the lowering guard,
 * which counts writer ids, and custody's support reader, which counts the distinct head
 * commits in the frontier blob of the basis tree. Everything from `Warp.open` to Git is
 * the production path with the production limits. One thing is arranged: folding 4,096
 * real patch chains costs minutes, so the frontier of the basis each write fixes is
 * widened here with writers whose heads are real, distinct commits, and stored as a real
 * basis tree. Both readers then read that one stored frontier, as they do in production.
 */
const LIMIT = WARP_SUPPORT_LIMITS.writers;
const CASE_TIMEOUT_MS = 240_000;
/** A fixed composition clock: no write here may depend on host time. */
const CLOCK = (): number => 1_000;

/** Independent root commits, one fast-import for all; each can stand as one writer's head. */
function seedCommits(path: string, count: number): readonly string[] {
  const commands = Array.from({ length: count }, (_, index) => [
    `commit refs/seed/${index}`, `committer Seed <seed@example.invalid> ${index} +0000`, 'data 9', `s${String(index).padStart(8, '0')}`, '',
  ].join('\n'));
  execFileSync('git', ['fast-import', '--quiet'], { cwd: path, input: `${commands.join('\n')}\n` });
  return fixture.git(path, ['for-each-ref', '--format=%(objectname)', 'refs/seed/']).split('\n');
}

/** The basis tree `revision` with its frontier blob replaced by `frontier`, in the store's own encoding. */
function storedWith(path: string, revision: string, frontier: ConeFrontier): string {
  const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], {
    cwd: path, encoding: 'utf8', input: new ConeFrontierCborCodec(codec).encode(frontier),
  }).trim();
  const kept = fixture.git(path, ['ls-tree', revision]).split('\n').filter((entry) => !entry.endsWith('\tfrontier'));
  return execFileSync('git', ['mktree'], { cwd: path, encoding: 'utf8', input: `${[...kept, `100644 blob ${blob}\tfrontier`].join('\n')}\n` }).trim();
}

describe('the writer limit through lowering and custody, on 4,096 distinct writer heads (#1075)', () => {
  let path: string;
  let warp: Warp;
  let seeds: readonly string[];
  /** Writers the frontier of the next write's basis is widened to, counting the ones really folded; 0 widens nothing. */
  let frontierSize = 0;
  const transitions: string[] = [];

  /** The published basis, widened to `frontierSize` writers and stored as a tree custody can read. */
  function widened(real: StoredConeBasis): StoredConeBasis {
    const positions = new Map(real.basis.frontier.entries());
    for (let index = 0; positions.size < frontierSize; index += 1) {
      positions.set(`seed-${index}`, new ConeWriterPosition(seeds[index] ?? '', 1));
    }
    const frontier = new ConeFrontier(positions);
    return new StoredConeBasis(new ConeBasis(real.basis.root, frontier), storedWith(path, real.revision, frontier));
  }

  beforeAll(async () => {
    path = await fixture.repository();
    seeds = seedCommits(path, LIMIT + 1);
    const published = ConeLaneBasis.prototype.writePremise;
    vi.spyOn(ConeLaneBasis.prototype, 'writePremise').mockImplementation(async function widenedPremise(this: ConeLaneBasis) {
      const premise = await published.call(this);
      return premise instanceof ConeWritePremise
        ? new ConeWritePremise({ from: premise.from, stored: widened(premise.stored), reader: premise.reader })
        : premise;
    });
    warp = await fixture.openSwept(path, {
      clock: CLOCK,
      wrapCustody: (custody) => new MeteredObservationCustody(custody, (transition, side) => transitions.push(`${transition}:${side}`)),
    });
    fixture.retained(await warp.as('alice').execute(intent.node.add({ subject: 'first' })));
  }, CASE_TIMEOUT_MS);

  beforeEach(() => {
    transitions.length = 0;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await fixture.disposeWarpFixtures();
  });

  it('seeds one distinct head commit for every writer the limit allows, and one more', () => {
    expect(new Set(seeds).size).toBe(LIMIT + 1);
    expect(LIMIT).toBe(4096);
  });

  it('retains a write by a writer already in a frontier of 4,096 distinct heads', async () => {
    frontierSize = LIMIT;

    const receipt = fixture.retained(await warp.as('alice').execute(intent.node.add({ subject: 'at-the-limit' })));

    expect(receipt.writer).toBe('alice');
    expect(transitions).toContain('settle:after');
    expect(fixture.attemptRefs(path)).toEqual([]);
  }, CASE_TIMEOUT_MS);

  it('refuses a new writer on a frontier of 4,096 in lowering, reserving and journaling nothing', async () => {
    frontierSize = LIMIT;

    const receipt = fixture.unpublished(await warp.as('newcomer-at-the-limit').execute(intent.node.add({ subject: 'refused' })));

    expect(receipt.cause).toBe('writer-limit-reached');
    expect(receipt.repairHints.map((hint) => hint.code)).toEqual(['reuse_writer_id']);
    expect(transitions).toEqual([]);
    expect(fixture.attemptRefs(path)).toEqual([]);
    expect(fixture.tip(path, 'newcomer-at-the-limit')).toBeNull();
  }, CASE_TIMEOUT_MS);

  it('admits a new writer on a frontier of 4,095, and custody retains its write', async () => {
    frontierSize = LIMIT - 1;

    const receipt = fixture.retained(await warp.as('newcomer-below-the-limit').execute(intent.node.add({ subject: 'admitted' })));

    expect(receipt.writer).toBe('newcomer-below-the-limit');
    expect(fixture.tip(path, 'newcomer-below-the-limit')).not.toBeNull();
  }, CASE_TIMEOUT_MS);

  it('gives a new writer and an existing writer one cause and one repair on a frontier of 4,097', async () => {
    frontierSize = LIMIT + 1;

    const newcomer = fixture.unpublished(await warp.as('newcomer-past-the-limit').execute(intent.node.add({ subject: 'refused' })));
    const reservedForNewcomer = [...transitions];
    const existing = fixture.unpublished(await warp.as('alice').execute(intent.node.add({ subject: 'refused-too' })));

    expect(reservedForNewcomer).toEqual([]);
    expect([newcomer.cause, existing.cause]).toEqual(['retention-refused-writer-limit', 'retention-refused-writer-limit']);
    expect(newcomer.repairHints).toEqual(existing.repairHints);
    expect(existing.repairHints.map((hint) => hint.code)).toEqual(['compact_writer_frontier']);
    expect(transitions).toContain('reserve:after');
    expect(fixture.attemptRefs(path)).toEqual([]);
  }, CASE_TIMEOUT_MS);
});
