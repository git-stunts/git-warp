import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  IndeterminateWriteReceipt, RetainedWriteReceipt, UnpublishedWriteReceipt, UnretainedWriteReceipt, WarpAccessDenied, WarpWriteGrant,
} from '../../../index.ts';
import MarginCorpus, { WRITERS } from '../../../benchmarks/cone-showcase/MarginCorpus.ts';
import { BULK_THREADS_PER_PATCH } from '../../../benchmarks/cone-showcase/WitnessWorkload.ts';
import WitnessAccess from '../../../benchmarks/cone-showcase/WitnessAccess.ts';
import { initRepository, openWarp } from '../../../benchmarks/cone-showcase/ScaleRun.ts';
import writeResult from '../../../benchmarks/cone-showcase/WriteResult.ts';
import WarpWriteRequest from '../../../src/domain/api/WarpWriteRequest.ts';

const WARP_TIMEOUT_MS = 60_000;

function request(writer: string): WarpWriteRequest {
  return new WarpWriteRequest({ graph: 'margins', writer, purpose: 'write', intents: new MarginCorpus(1).documentIntents() });
}

describe('cone-showcase witness access', () => {
  // Oracle: the WarpWriteGrant contract (specified): the port is asked again before
  // publication, so a grant must name one policy decision, equal on every ask.
  it('grants each witness writer the same policy decision on every ask', async () => {
    const access = new WitnessAccess(WRITERS);
    const grants = await Promise.all([...WRITERS, ...WRITERS].map(async (writer) => await access.authorizeWrite(request(writer))));
    for (const grant of grants) {
      expect(grant).toBeInstanceOf(WarpWriteGrant);
      expect(grant).toEqual(grants[0]);
    }
    expect(grants[0]).toEqual({ authority: 'cone-showcase-witness', budget: { records: 100_000, bytes: 64 * 1024 * 1024, work: 1_000_000 } });
  });

  it('denies a writer outside the witness, naming it', async () => {
    const denied = await new WitnessAccess(WRITERS).authorizeWrite(request('mallory'));
    expect(denied).toBeInstanceOf(WarpAccessDenied);
    expect(denied).toEqual({ cause: 'the witness has no writer named mallory' });
  });

  // Oracle: the WitnessAccess budget comment (specified): a 50-thread bulk patch is
  // within the grant. The receipt names come from the WriteReceipt classes.
  it('retains a full bulk patch, and names refused and other receipts by class', async () => {
    const scratch = mkdtempSync(join(tmpdir(), 'cone-access-'));
    try {
      const repository = join(scratch, 'repo');
      const corpus = new MarginCorpus(BULK_THREADS_PER_PATCH * WRITERS.length);
      initRepository(repository);
      const warp = await openWarp(repository);
      let retained: RetainedWriteReceipt | null = null;
      try {
        expect(writeResult(await warp.as('alice').execute(corpus.documentIntents()))).toBe('retained');
        const openings = corpus.openings(0);
        expect(openings).toHaveLength(BULK_THREADS_PER_PATCH);
        const receipt = await warp.as('alice').execute(openings.flatMap((action) => action.intents));
        expect(writeResult(receipt)).toBe('retained');
        retained = receipt instanceof RetainedWriteReceipt ? receipt : null;
        const refused = await warp.as('mallory').execute(corpus.openings(1).flatMap((action) => action.intents));
        expect(refused).toBeInstanceOf(UnpublishedWriteReceipt);
        expect(writeResult(refused)).toBe('unpublished: access-denied: the witness has no writer named mallory');
      } finally {
        await warp.close();
      }
      if (retained === null) throw new TypeError('expected a retained bulk write');
      const unretained = new UnretainedWriteReceipt({ ...retained, retention: 'retention-unavailable', attempt: null });
      expect(writeResult(unretained)).toBe('unretained');
      const indeterminate = new IndeterminateWriteReceipt({ graph: 'margins', writer: 'alice', attempt: 'attempt-1', requirement: 'publication-unresolved' });
      expect(writeResult(indeterminate)).toBe('indeterminate');
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }, WARP_TIMEOUT_MS);

  it('refuses a receipt it does not know', () => {
    // @ts-expect-error Exercise the JavaScript boundary with an unknown receipt.
    expect(() => writeResult({ operation: 'write' })).toThrow('Warp returned a write receipt this witness does not know');
  });
});
