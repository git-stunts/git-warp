import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { GitStorage, Runtime, Warp, WarpAddress, type Intent } from '../../index.ts';
import parseColdOpenResult, { COLD_RESULT_LIMIT } from './ColdOpenResultParser.ts';
import type GitProcessCounter from './GitProcessCounter.ts';
import MarginCorpus, { MARGINS_LANE, WRITERS } from './MarginCorpus.ts';
import matchesCorpus from './MarginMembership.ts';
import MarginReader from './MarginReader.ts';
import { Margins, type MarginsRead } from './Margins.ts';
import SampleRecorder from './SampleRecorder.ts';
import { ScaleResult } from './ScaleResult.ts';
import SeededRandom from './SeededRandom.ts';
import WitnessAccess from './WitnessAccess.ts';
import WitnessOutcome from './WitnessOutcome.ts';
import type WitnessReport from './WitnessReport.ts';
import { BULK_THREADS_PER_PATCH, CORPUS_SEED } from './WitnessWorkload.ts';
import type WorkloadPlan from './WorkloadPlan.ts';
import writeResult from './WriteResult.ts';

export { BULK_THREADS_PER_PATCH } from './WitnessWorkload.ts';

const COLD_OPEN_TIMEOUT_MS = 120_000;
const SETUP_TIMEOUT_MS = 15_000;
const COLD_OPEN_SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'ColdOpen.ts');

export function initRepository(path: string): void {
  const options = { timeout: SETUP_TIMEOUT_MS, maxBuffer: COLD_RESULT_LIMIT };
  execFileSync('git', ['init', '--quiet', path], options);
  execFileSync('git', ['-C', path, 'config', 'user.name', 'cone showcase'], options);
  execFileSync('git', ['-C', path, 'config', 'user.email', 'cone-showcase@example.invalid'], options);
}

export async function openWarp(repository: string): Promise<Warp> {
  return await Warp.open(WarpAddress.of(GitStorage.at(repository), MARGINS_LANE), new WitnessAccess(WRITERS));
}

function writer(index: number): string {
  const name = WRITERS[index];
  if (name === undefined) {
    throw new RangeError('no corpus writer at the requested index');
  }
  return name;
}

/** Classifies one read against the independent corpus; an unavailable read is never verified. */
export function readOutcome(read: MarginsRead, documentId: string, corpus: MarginCorpus): WitnessOutcome {
  if (read instanceof Margins) {
    const matches = matchesCorpus(read, documentId, corpus);
    return new WitnessOutcome(matches ? 'verified' : 'mismatch', matches ? '' : 'actual membership differs from corpus', read);
  }
  return new WitnessOutcome('incomplete', (read.status + ': ' + read.reason).slice(0, 2048), read);
}

async function write(warp: Warp, author: string, intents: readonly Intent[]): Promise<WitnessOutcome> {
  const receipt = writeResult(await warp.as(author).execute(intents));
  return new WitnessOutcome(receipt === 'retained' ? 'retained' : 'incomplete', receipt);
}

/** Independent planned batch count, without calling the mutating reply generator. */
export function expectedBulkPatches(corpus: MarginCorpus, threads: number): number {
  return 1 + [...WRITERS.keys()].reduce((total, index) => {
    const own = corpus.openings(index).length;
    return total + Math.ceil(own / BULK_THREADS_PER_PATCH) + Math.ceil((threads - own) / BULK_THREADS_PER_PATCH);
  }, 0);
}

async function bulkLoad(warp: Warp, corpus: MarginCorpus, recorder: SampleRecorder): Promise<void> {
  await recorder.measure({
    phase: 'bulk', operation: 'create-documents:' + writer(0),
    documentId: corpus.documents.join(','), subjectId: corpus.documents.join(','),
  }, async () => await write(warp, writer(0), corpus.documentIntents()));
  for (const round of ['openings', 'replies']) {
    for (const index of WRITERS.keys()) {
      const actions = round === 'openings' ? corpus.openings(index) : corpus.replies(index);
      for (let start = 0; start < actions.length; start += BULK_THREADS_PER_PATCH) {
        const batch = actions.slice(start, start + BULK_THREADS_PER_PATCH);
        await recorder.measure({
          phase: 'bulk', operation: round + ':' + writer(index),
          documentId: [...new Set(batch.map((action) => action.documentId))].join(','),
          subjectId: batch.map((action) => action.subjectId).join(','),
        }, async () => await write(warp, writer(index), batch.flatMap((action) => action.intents)));
      }
    }
  }
}

/** Count exact operation intervals of the planned workload; close handles before trace lifecycle cleanup. */
export async function runScale(
  repository: string, threads: number, counter: GitProcessCounter, report: WitnessReport, workload: WorkloadPlan,
): Promise<ScaleResult> {
  const corpus = new MarginCorpus(threads);
  const expectedBulk = expectedBulkPatches(corpus, threads);
  const random = new SeededRandom(CORPUS_SEED);
  const recorder = new SampleRecorder(counter, report);
  const setup = await recorder.measure({ phase: 'setup', operation: 'init-repository', documentId: '', subjectId: '' }, () => {
    initRepository(repository);
    return new WitnessOutcome('completed', '');
  });
  if (!setup.isComplete()) {
    throw new TypeError('repository setup did not complete');
  }
  if (report.samples[0]?.count?.total !== 3) {
    throw new TypeError('trace calibration did not observe the three real Git setup invocations');
  }
  const warp = await openWarp(repository);
  let warpClose: WitnessOutcome;
  try {
    await recorder.measure({ phase: 'setup', operation: 'warp-open', documentId: '', subjectId: '' },
      () => new WitnessOutcome('completed', ''));
    await bulkLoad(warp, corpus, recorder);
    for (let index = 0; index < workload.measuredSaves; index += 1) {
      const author = writer(index % WRITERS.length);
      const action = corpus.nextSave(random, index % WRITERS.length);
      await recorder.measure({
        phase: 'save', operation: action.operation + ':' + author,
        documentId: action.documentId, subjectId: action.subjectId,
      }, async () => await write(warp, author, action.intents));
    }
  } finally {
    warpClose = await recorder.measure({ phase: 'close', operation: 'warp-close', documentId: '', subjectId: '' }, async () => {
      await warp.close();
      return new WitnessOutcome('completed', '');
    });
  }
  if (!warpClose.isComplete()) {
    throw new TypeError('Warp close failed; trace files remain owned by the stopped-run boundary');
  }
  counter.cleanupAfterWritersClosed();

  const runtime = await Runtime.open({ at: repository, writer: writer(0) });
  let runtimeClose: WitnessOutcome;
  try {
    await recorder.measure({ phase: 'setup', operation: 'runtime-open', documentId: '', subjectId: '' },
      () => new WitnessOutcome('completed', ''));
    const lane = await runtime.lane(MARGINS_LANE);
    await recorder.measure({ phase: 'setup', operation: 'lane-open', documentId: '', subjectId: MARGINS_LANE },
      () => new WitnessOutcome('completed', ''));
    const reader = new MarginReader(lane);
    for (let index = 0; index < workload.marginsReads; index += 1) {
      const documentId = random.pick(corpus.documents);
      await recorder.measure({ phase: 'margins', operation: 'read-margins', documentId, subjectId: documentId },
        async () => readOutcome(await reader.margins(documentId), documentId, corpus));
    }
  } finally {
    runtimeClose = await recorder.measure({ phase: 'close', operation: 'runtime-close', documentId: '', subjectId: '' }, async () => {
      await runtime.close();
      return new WitnessOutcome('completed', '');
    });
  }
  if (!runtimeClose.isComplete()) {
    throw new TypeError('Runtime close failed; trace cleanup is not authorized');
  }
  counter.cleanupAfterWritersClosed();

  for (let index = 0; index < workload.coldOpens; index += 1) {
    const documentId = random.pick(corpus.documents);
    const outcome = await recorder.measure({ phase: 'cold', operation: 'cold-open-read-close', documentId, subjectId: documentId }, () => {
      const output = execFileSync(process.execPath, [COLD_OPEN_SCRIPT, repository, writer(0), documentId], {
        encoding: 'utf8', timeout: COLD_OPEN_TIMEOUT_MS, maxBuffer: COLD_RESULT_LIMIT,
      });
      return readOutcome(parseColdOpenResult(output, documentId), documentId, corpus);
    });
    if (outcome.status === 'error') {
      throw new TypeError('cold child or transport failed; do not infer successful child cleanup');
    }
    counter.cleanupAfterWritersClosed();
  }
  return new ScaleResult(threads, corpus.documents.length, report.samples, expectedBulk, workload);
}
