import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { Runtime } from '../../../index.ts';
import parseColdOpenResult from '../../../benchmarks/cone-showcase/ColdOpenResultParser.ts';
import GitProcessCount from '../../../benchmarks/cone-showcase/GitProcessCount.ts';
import MarginCorpus, { MARGINS_LANE, WRITERS } from '../../../benchmarks/cone-showcase/MarginCorpus.ts';
import MarginReader from '../../../benchmarks/cone-showcase/MarginReader.ts';
import { Margins, MarginsUnavailable, type MarginsRead } from '../../../benchmarks/cone-showcase/Margins.ts';
import ReadCheck from '../../../benchmarks/cone-showcase/ReadCheck.ts';
import { initRepository, openWarp, readOutcome } from '../../../benchmarks/cone-showcase/ScaleRun.ts';
import WitnessSample from '../../../benchmarks/cone-showcase/WitnessSample.ts';
import { WITNESS_PLAN } from '../../../benchmarks/cone-showcase/WitnessWorkload.ts';
import writeResult from '../../../benchmarks/cone-showcase/WriteResult.ts';

const COLD_OPEN = fileURLToPath(new URL('../../../benchmarks/cone-showcase/ColdOpen.ts', import.meta.url));
const CHILD_TIMEOUT_MS = 60_000;
const OBSTRUCTED = new MarginsUnavailable('cone-showcase.document-threads', 'obstructed', 'missing_bounded_basis');

function readCheckLine(read: MarginsRead, corpus: MarginCorpus): string {
  const sample = new WitnessSample({
    sequence: 0, phase: 'margins', operation: 'read-margins', documentId: 'd0', subjectId: 'd0',
    count: new GitProcessCount([]), outcome: readOutcome(read, 'd0', corpus),
  });
  return new ReadCheck(200, [sample], WITNESS_PLAN).line();
}

describe('cone-showcase refused reads', () => {
  // Oracle: the README read contract (specified): an unavailable read is never verified.
  it('classifies a refused read as incomplete, and only a corpus match as verified', () => {
    const corpus = new MarginCorpus(1);
    expect(readOutcome(OBSTRUCTED, 'd0', corpus)).toEqual({ status: 'incomplete', detail: 'obstructed: missing_bounded_basis', membership: OBSTRUCTED });
    expect(readOutcome(new Margins('d0', new Map([['t0', ['c0']]])), 'd0', corpus).status).toBe('verified');
    expect(readOutcome(new Margins('d0', new Map()), 'd0', corpus).status).toBe('mismatch');
    expect(readCheckLine(OBSTRUCTED, corpus)).toBe('read-check\t200\tunchecked\t0/35\tobstructed%3A%20missing_bounded_basis=1,missing-sample=34');
  });

  // Oracle: current product behaviour, recorded on #1099 and #1052 (change detection).
  // #1052 lets a Warp-written lane be read; it must replace this case with a verified read.
  it('reads a Warp-written lane as obstructed, warm and cold, until #1052', async () => {
    const scratch = mkdtempSync(join(tmpdir(), 'cone-refused-read-'));
    try {
      const repository = join(scratch, 'repo');
      const corpus = new MarginCorpus(1);
      initRepository(repository);
      const warp = await openWarp(repository);
      try {
        const writer = WRITERS[0] ?? 'alice';
        expect(writeResult(await warp.as(writer).execute(corpus.documentIntents()))).toBe('retained');
        const intents = corpus.openings(0).flatMap((action) => action.intents);
        expect(writeResult(await warp.as(writer).execute(intents))).toBe('retained');
      } finally {
        await warp.close();
      }
      const runtime = await Runtime.open({ at: repository, writer: WRITERS[0] ?? 'alice' });
      let warm: MarginsRead;
      try {
        warm = await new MarginReader(await runtime.lane(MARGINS_LANE)).margins('d0');
      } finally {
        await runtime.close();
      }
      const cold = parseColdOpenResult(execFileSync(process.execPath, [COLD_OPEN, repository, WRITERS[0] ?? 'alice', 'd0'], {
        encoding: 'utf8', timeout: CHILD_TIMEOUT_MS,
      }), 'd0');
      expect(warm).toEqual(OBSTRUCTED);
      expect(cold).toEqual(OBSTRUCTED);
      expect(readCheckLine(warm, corpus)).toBe('read-check\t200\tunchecked\t0/35\tobstructed%3A%20missing_bounded_basis=1,missing-sample=34');
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }, CHILD_TIMEOUT_MS * 2);
});
