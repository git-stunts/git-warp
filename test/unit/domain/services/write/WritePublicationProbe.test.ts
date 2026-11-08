import { describe, expect, it } from 'vitest';
import type { NodeInfo } from '../../../../../src/ports/CommitPort.ts';
import type CommitMessageCodecPort from '../../../../../src/ports/CommitMessageCodecPort.ts';
import ObservationAttemptId from '../../../../../src/domain/services/custody/ObservationAttemptId.ts';
import ObservationBindings from '../../../../../src/domain/services/custody/ObservationBindings.ts';
import ObservationBudget from '../../../../../src/domain/services/custody/ObservationBudget.ts';
import ObservationDependencyClaim from '../../../../../src/domain/services/custody/ObservationDependencyClaim.ts';
import ObservationDigest from '../../../../../src/domain/services/custody/ObservationDigest.ts';
import ObservationPreparation from '../../../../../src/domain/services/custody/ObservationPreparation.ts';
import ObservationQuestion from '../../../../../src/domain/services/custody/ObservationQuestion.ts';
import ObservationWritePremise from '../../../../../src/domain/services/custody/ObservationWritePremise.ts';
import WriteAttemptRecord from '../../../../../src/domain/services/write/WriteAttemptRecord.ts';
import WritePublicationProbe, * as probing from '../../../../../src/domain/services/write/WritePublicationProbe.ts';
import type { WritePublicationHistory } from '../../../../../src/domain/services/write/WritePublicationProbe.ts';
import WriteReadBudget from '../../../../../src/domain/services/write/WriteReadBudget.ts';

const ATTEMPT = new ObservationAttemptId('a'.repeat(32));
const DIGEST = new ObservationDigest('b'.repeat(64));
/** First-parent commits one probe reads, and the most it lists: one more shows the predecessor lies beyond. */
const PUBLICATION_PROBE_WINDOW = 4096;
const PUBLICATION_PROBE_READS = PUBLICATION_PROBE_WINDOW + 1;
/** Deeper than one probe reads, so the old per-commit walk gave up there. */
const DEEP_CHAIN = PUBLICATION_PROBE_WINDOW + 904;

/** The commit at `depth` behind a writer's tip; depth 0 is the tip. */
function shaAt(depth: number): string {
  return depth.toString(16).padStart(40, '0');
}

/** Reads back the graph, writer and attempt a fake patch message names, as `graph|writer|attempt`. */
const NAMED_MESSAGES = {
  decodePatch: (message: string) => {
    const [graph = '', writer = '', publicationAttempt = ''] = message.split('|');
    return { graph, writer, publicationAttempt };
  },
} as unknown as CommitMessageCodecPort;

/** One writer's linear chain of `length` commits; the root is at depth `length - 1`. Every read is counted. */
class CountedChain implements WritePublicationHistory {
  reads = 0;
  readonly #length: number;
  readonly #message: (depth: number) => string;

  constructor(length: number, message: (depth: number) => string) {
    this.#length = length;
    this.#message = message;
  }

  readRef(): Promise<string | null> {
    this.reads += 1;
    return Promise.resolve(this.#length === 0 ? null : shaAt(0));
  }

  getNodeInfo(sha: string): Promise<NodeInfo> {
    this.reads += 1;
    const depth = parseInt(sha, 16);
    const parents = depth + 1 < this.#length ? [shaAt(depth + 1)] : [];
    return Promise.resolve({ sha, message: this.#message(depth), author: 'a', date: 'd', parents });
  }

  firstParentsSince(range: { readonly tip: string; readonly stopAt: string | null; readonly limit: number }): Promise<readonly string[]> {
    this.reads += 1;
    const end = range.stopAt === null ? this.#length : parseInt(range.stopAt, 16);
    const shas = Array.from({ length: Math.min(end, this.#length, range.limit) }, (_, depth) => shaAt(depth));
    return Promise.resolve(shas);
  }
}

function recordAfter(predecessor: string | null): WriteAttemptRecord {
  const premise = new ObservationWritePremise({ intents: DIGEST, writerId: 'alice', predecessor });
  return new WriteAttemptRecord({
    preparation: new ObservationPreparation(ATTEMPT, new ObservationBindings({
      basis: 'c'.repeat(40), observer: 'writer:alice', question: new ObservationQuestion('q', 1), purpose: 'p',
      budget: new ObservationBudget({ records: 1, bytes: 1, work: 1 }), evidence: [],
      dependencies: ObservationDependencyClaim.NONE, writePremise: premise,
    })),
    admission: 'derived', occurrences: [], savedAt: 1,
  });
}

/** A chain whose commit at `ownDepth` names this attempt; every other commit names another one. */
function chainNaming(length: number, ownDepth: number): CountedChain {
  return new CountedChain(length, (depth) => `g|alice|${depth === ownDepth ? ATTEMPT.value : 'f'.repeat(32)}`);
}

function probeOver(history: CountedChain): WritePublicationProbe {
  return new WritePublicationProbe({ graph: 'g', history, messages: NAMED_MESSAGES });
}

describe('WritePublicationProbe on a deep chain (#1075)', () => {
  it('reads a window of 4,096 commits, listing one more to see past it', () => {
    expect([probing.PUBLICATION_PROBE_WINDOW, probing.PUBLICATION_PROBE_READS]).toEqual([PUBLICATION_PROBE_WINDOW, PUBLICATION_PROBE_READS]);
  });

  it('reads a predecessor out of reach in a bounded number of Git reads, and says so', async () => {
    const chain = chainNaming(DEEP_CHAIN, DEEP_CHAIN - 2);

    const found = await probeOver(chain).locate(recordAfter(shaAt(DEEP_CHAIN - 1)));

    expect(found).toEqual({ kind: 'exhausted' });
    expect(chain.reads).toBeLessThanOrEqual(3);
  });

  it('finds a successor at the edge of its window, and calls one past it out of reach', async () => {
    const atEdge = chainNaming(DEEP_CHAIN, PUBLICATION_PROBE_WINDOW - 1);
    await expect(probeOver(atEdge).locate(recordAfter(shaAt(PUBLICATION_PROBE_WINDOW))))
      .resolves.toEqual({ kind: 'own', commit: shaAt(PUBLICATION_PROBE_WINDOW - 1) });
    expect(atEdge.reads).toBe(3);

    const pastEdge = chainNaming(DEEP_CHAIN, PUBLICATION_PROBE_WINDOW);
    await expect(probeOver(pastEdge).locate(recordAfter(shaAt(PUBLICATION_PROBE_WINDOW + 1)))).resolves.toEqual({ kind: 'exhausted' });
  });

  it('tells another patch in its place, and a first patch from the root', async () => {
    await expect(probeOver(chainNaming(10, -1)).locate(recordAfter(shaAt(5)))).resolves.toEqual({ kind: 'other' });
    await expect(probeOver(chainNaming(10, 9)).locate(recordAfter(null))).resolves.toEqual({ kind: 'own', commit: shaAt(9) });
  });

  it('finds nothing at the tip, without a tip, or on a chain that does not hold its predecessor', async () => {
    await expect(probeOver(chainNaming(10, 0)).locate(recordAfter(shaAt(0)))).resolves.toEqual({ kind: 'none' });
    await expect(probeOver(chainNaming(0, 0)).locate(recordAfter(null))).resolves.toEqual({ kind: 'none' });
    const elsewhere = 'e'.repeat(40);
    await expect(probeOver(chainNaming(10, 9)).locate(recordAfter(elsewhere))).resolves.toEqual({ kind: 'none' });
    const empty = new CountedChain(10, () => '');
    empty.firstParentsSince = () => Promise.resolve([]);
    await expect(probeOver(empty).locate(recordAfter(elsewhere))).resolves.toEqual({ kind: 'none' });
  });

  it('spends what it reads from the budget it was given, and nothing from any other', async () => {
    const budget = new WriteReadBudget(2 * PUBLICATION_PROBE_READS);
    const probe = probeOver(chainNaming(DEEP_CHAIN, 0));

    await probe.within(budget).locate(recordAfter(shaAt(1)));
    expect(budget.affords(2 * PUBLICATION_PROBE_READS - 1)).toBe(true);
    expect(budget.affords(2 * PUBLICATION_PROBE_READS)).toBe(false);

    await probe.locate(recordAfter(shaAt(DEEP_CHAIN - 1)));
    await probe.within(budget).locate(recordAfter(shaAt(DEEP_CHAIN - 1)));
    expect(budget.affords(PUBLICATION_PROBE_READS - 1)).toBe(true);
    expect(budget.affords(PUBLICATION_PROBE_READS)).toBe(false);
  });
});

describe('WriteReadBudget', () => {
  it('refuses a budget that is not a count, and never goes below nothing', () => {
    expect(() => new WriteReadBudget(-1)).toThrow('count');
    expect(() => new WriteReadBudget(1.5)).toThrow('count');
    const budget = new WriteReadBudget(1);
    budget.spend(5);
    expect(budget.affords(0)).toBe(true);
    expect(budget.affords(1)).toBe(false);
  });
});
