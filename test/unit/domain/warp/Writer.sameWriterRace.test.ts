import { describe, expect, it } from 'vitest';
import InMemoryGraphAdapter from '../../../../src/infrastructure/adapters/InMemoryGraphAdapter.ts';
import { openMemoryRuntimeHostProduct as openRuntimeHostProduct } from '../../../helpers/MemoryRuntimeHost.ts';
import { buildWriterRef } from '../../../../src/domain/utils/RefLayout.ts';

const GRAPH_NAME = 'same-writer-race';
const WRITER_ID = 'alice';
const WRITER_REF = buildWriterRef(GRAPH_NAME, WRITER_ID);
const FIRST_NODE = 'race:first';
const SECOND_NODE = 'race:second';

class CommitPrecheckGate {
  readonly #expectedArrivals: number;
  readonly #release: Promise<void>;
  #arrivals = 0;
  #releaseGate: () => void;

  constructor(expectedArrivals: number) {
    this.#expectedArrivals = expectedArrivals;
    let releaseGate = () => {};
    this.#release = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    this.#releaseGate = releaseGate;
  }

  async arrive(): Promise<void> {
    this.#arrivals += 1;
    if (this.#arrivals === this.#expectedArrivals) {
      this.#releaseGate();
    }
    await this.#release;
  }
}

class SameWriterRaceAdapter extends InMemoryGraphAdapter {
  #gate: CommitPrecheckGate | null = null;
  #gatedReadsRemaining = 0;

  constructor() {
    super({ clock: { now: () => 1 } });
  }

  armCommitPrecheckRace(readCount: number): void {
    this.#gate = new CommitPrecheckGate(readCount);
    this.#gatedReadsRemaining = readCount;
  }

  override async readRef(ref: string): Promise<string | null> {
    const gate = this.#gate;
    if (gate !== null && this.#gatedReadsRemaining > 0 && ref === WRITER_REF) {
      this.#gatedReadsRemaining -= 1;
      if (this.#gatedReadsRemaining === 0) {
        this.#gate = null;
      }
      await gate.arrive();
    }
    return await super.readRef(ref);
  }
}

function fulfilled(results: PromiseSettledResult<string>[]): PromiseFulfilledResult<string>[] {
  return results.filter((result): result is PromiseFulfilledResult<string> => result.status === 'fulfilled');
}

function rejected(results: PromiseSettledResult<string>[]): PromiseRejectedResult[] {
  return results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
}

describe('same-writer concurrent patch race witness', () => {
  it('admits exactly one canonical winner and reports the losing session as a retryable writer race', async () => {
    const persistence = new SameWriterRaceAdapter();
    const graph = await openRuntimeHostProduct({
      persistence,
      graphName: GRAPH_NAME,
      writerId: WRITER_ID,
    });
    const writer = await graph.writer(WRITER_ID);
    const firstPatch = await writer.beginPatch();
    const secondPatch = await writer.beginPatch();
    firstPatch.addNode(FIRST_NODE);
    secondPatch.addNode(SECOND_NODE);

    persistence.armCommitPrecheckRace(2);
    const results = await Promise.allSettled([
      firstPatch.commit(),
      secondPatch.commit(),
    ]);

    const winners = fulfilled(results);
    const losers = rejected(results);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    const loser = losers[0];
    const winner = winners[0];
    if (loser === undefined || winner === undefined) {
      expect.fail('race witness must produce one winner and one loser');
    }
    expect(loser.reason).toMatchObject({ code: 'WRITER_REF_ADVANCED' });

    const finalTip = await persistence.readRef(WRITER_REF);
    expect(finalTip).toBe(winner.value);

    const firstWon = results[0].status === 'fulfilled';
    const materialized = await openRuntimeHostProduct({
      persistence,
      graphName: GRAPH_NAME,
      writerId: WRITER_ID,
    });
    await materialized.materialize();

    expect(await materialized.hasNode(FIRST_NODE)).toBe(firstWon);
    expect(await materialized.hasNode(SECOND_NODE)).toBe(!firstWon);
  });

  it('preserves visible truth when isolated handles race the same writer ref', async () => {
    const persistence = new SameWriterRaceAdapter();
    const firstHandle = await openRuntimeHostProduct({
      persistence,
      graphName: GRAPH_NAME,
      writerId: WRITER_ID,
    });
    const secondHandle = await openRuntimeHostProduct({
      persistence,
      graphName: GRAPH_NAME,
      writerId: WRITER_ID,
    });
    const firstWriter = await firstHandle.writer(WRITER_ID);
    const secondWriter = await secondHandle.writer(WRITER_ID);
    const firstPatch = await firstWriter.beginPatch();
    const secondPatch = await secondWriter.beginPatch();
    firstPatch.addNode(FIRST_NODE);
    secondPatch.addNode(SECOND_NODE);

    persistence.armCommitPrecheckRace(2);
    const results = await Promise.allSettled([
      firstPatch.commit(),
      secondPatch.commit(),
    ]);

    const winners = fulfilled(results);
    const losers = rejected(results);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    const loser = losers[0];
    const winner = winners[0];
    if (loser === undefined || winner === undefined) {
      expect.fail('isolated-handle race witness must produce one winner and one loser');
    }
    expect(loser.reason).toMatchObject({ code: 'WRITER_REF_ADVANCED' });

    const finalTip = await persistence.readRef(WRITER_REF);
    expect(finalTip).toBe(winner.value);

    const firstWon = results[0].status === 'fulfilled';
    const materialized = await openRuntimeHostProduct({
      persistence,
      graphName: GRAPH_NAME,
      writerId: WRITER_ID,
    });
    await materialized.materialize();

    expect(await materialized.hasNode(FIRST_NODE)).toBe(firstWon);
    expect(await materialized.hasNode(SECOND_NODE)).toBe(!firstWon);
  });
});
