// Cone-bounded Runtime cost witness, one scale per process.
// Usage: node ConeShowcaseWitness.ts --threads <N> --out <result.json> [--deadline-ms <ms>] [--budget-bytes <bytes>]
//
// Everything is measured through the public API the annotations example uses:
// Runtime.open, Lane.write of generated Intents, Lane.observe of generated
// Observers. The bulk load is batched (many threads per patch) and labelled as
// such; every measured save is one user action in one patch.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import counter from './GitProcessCounter.ts';
import { Runtime, type Lane } from '@git-stunts/git-warp';
import MarginStore, { MarginsUnavailable, type Margins } from '../../examples/annotations/MarginStore.ts';
import ReceiptLedger from '../../examples/annotations/ReceiptLedger.ts';
import AnnotationCorpus, { SeededRandom, WRITERS, type Action } from './AnnotationCorpus.ts';
import { distribution, failure, sample, summarize, type Sample } from './WitnessSamples.ts';

const BULK_THREADS_PER_PATCH = 50;
const MEASURED_SAVES = 60;
const MARGINS_READS = 30;
const COLD_OPENS = 5;
const SEED = 0x1039;

function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

const threads = Number(option('--threads', '200'));
const output = option('--out', `cone-showcase-${threads}.json`);
const started = performance.now();
const deadline = started + Number(option('--deadline-ms', String(25 * 60_000)));
const budgetBytes = Number(option('--budget-bytes', String(4 * 1024 ** 3)));
const work = mkdtempSync(join(tmpdir(), `cone-showcase-${threads}-`));
const repository = join(work, 'repo');
const result: Record<string, object | string | number | null> = { threads, writers: WRITERS.length, startedAt: new Date().toISOString() };

function flush(status: string): void {
  result.status = status;
  result.elapsedMs = Math.round(performance.now() - started);
  result.maxRssMiB = Math.round(process.resourceUsage().maxRSS / 1024);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
}

function workBytes(): number {
  return Number(execFileSync('du', ['-sk', work], { encoding: 'utf8' }).split('\t')[0]) * 1024;
}

class WitnessBudgetExceeded extends Error {
  constructor(bytes: number) {
    super(`generated data reached ${bytes} bytes, over the ${budgetBytes}-byte budget`);
    this.name = 'WitnessBudgetExceeded';
  }
}

class WitnessDeadlineReached extends Error {
  constructor(phase: string) {
    super(`the ${phase} did not finish before the deadline`);
    this.name = 'WitnessDeadlineReached';
  }
}

function requireBudget(): number {
  const bytes = workBytes();
  if (bytes > budgetBytes) {
    throw new WitnessBudgetExceeded(bytes);
  }
  return bytes;
}

async function timed(run: () => Promise<{ result: string; reason: string | null }>): Promise<Sample> {
  const before = counter.snapshot();
  const begin = performance.now();
  try {
    const outcome = await run();
    return sample({ ms: performance.now() - begin, processes: counter.since(before), ...outcome });
  } catch (error) {
    const reason = error instanceof Error ? failure(error) : 'non-Error thrown';
    return sample({ ms: performance.now() - begin, processes: counter.since(before), result: 'error', reason });
  }
}

/** Bulk load: BULK_THREADS_PER_PATCH actions per patch. Not a save measurement. */
async function bulkLoad(lanes: readonly Lane[], corpus: AnnotationCorpus): Promise<void> {
  const patches: Sample[] = [];
  const rounds: ((writer: number) => Action[])[] = [(writer) => corpus.openings(writer), (writer) => corpus.replies(writer)];
  for (const round of rounds) {
    for (const [writer, lane] of lanes.entries()) {
      const actions = round(writer);
      for (let index = 0; index < actions.length; index += BULK_THREADS_PER_PATCH) {
        const intents = actions.slice(index, index + BULK_THREADS_PER_PATCH).flatMap((action) => action.intents);
        patches.push(await timed(async () => {
          const receipt = await lane.write(intents);
          return { result: receipt.outcome.kind, reason: receipt.reason ?? null };
        }));
        if (patches.length % 25 === 0) {
          requireBudget();
          result.bulkLoadProgress = { patches: patches.length, elapsedMs: Math.round(performance.now() - started) };
          flush('loading');
        }
        if (performance.now() > deadline) {
          throw new WitnessDeadlineReached('bulk load');
        }
      }
    }
  }
  result.bulkLoad = { label: `batched: ${BULK_THREADS_PER_PATCH} actions per patch, not a save measurement`, patches: patches.length,
    totalMs: Math.round(patches.reduce((sum, each) => sum + each.ms, 0)), perPatch: summarize(patches), repoBytes: requireBudget() };
  flush('loaded');
}

function verify(margins: Margins, corpus: AnnotationCorpus): boolean {
  const expected = corpus.threadsByDocument.get(margins.documentId) ?? [];
  const sameIds = (left: readonly string[], right: readonly string[]): boolean =>
    left.length === right.length && [...left].sort().join() === [...right].sort().join();
  return sameIds(margins.threads.map((thread) => thread.id), expected)
    && margins.threads.every((thread) => sameIds(thread.comments.map((comment) => comment.id), corpus.commentsByThread.get(thread.id) ?? []));
}

async function measure(lanes: readonly Lane[], corpus: AnnotationCorpus): Promise<void> {
  const random = new SeededRandom(SEED);
  const ledger = new ReceiptLedger();
  const stores = lanes.map((lane) => new MarginStore(lane, ledger));
  const saves: Sample[] = [];
  for (let index = 0; index < MEASURED_SAVES && performance.now() < deadline; index += 1) {
    const writer = index % stores.length;
    const action = corpus.nextSave(random, writer);
    saves.push(await timed(async () => {
      const receipt = await stores[writer]?.save(action.operation, action.intents);
      return { result: receipt?.outcome.kind ?? 'error', reason: receipt?.reason ?? null };
    }));
  }
  result.saves = { label: 'one user action per patch', ...summarize(saves), deadlineReached: saves.length < MEASURED_SAVES };
  flush('saved');
  const reads: Sample[] = [];
  let mismatches = 0;
  for (let index = 0; index < MARGINS_READS && performance.now() < deadline; index += 1) {
    const documentId = random.pick(corpus.documents);
    reads.push(await timed(async () => {
      const margins = await stores[0]?.margins(documentId);
      if (margins === undefined || margins instanceof MarginsUnavailable) {
        return { result: margins?.status ?? 'error', reason: margins === undefined ? null : `${margins.observer}: ${margins.reason}` };
      }
      mismatches += verify(margins, corpus) ? 0 : 1;
      return { result: 'completed', reason: null };
    }));
    flush('reading');
  }
  result.margins = { label: "one document's threads and comments, four generated Observers", ...summarize(reads),
    mismatches, deadlineReached: reads.length < MARGINS_READS, rssAfterReadsMiB: Math.round(process.memoryUsage().rss / 2 ** 20) };
  flush('read');
}

function coldOpens(corpus: AnnotationCorpus): void {
  const script = join(dirname(fileURLToPath(import.meta.url)), 'ColdOpen.ts');
  const random = new SeededRandom(SEED + 1);
  const runs: Record<string, number | string | null>[] = [];
  for (let index = 0; index < COLD_OPENS && performance.now() < deadline; index += 1) {
    const documentId = random.pick(corpus.documents);
    try {
      const line = execFileSync(process.execPath, [script, repository, WRITERS[0] ?? 'alice', documentId],
        { encoding: 'utf8', timeout: Math.max(1000, Math.floor(deadline - performance.now())), maxBuffer: 1 << 20 });
      runs.push(JSON.parse(line));
    } catch (error) {
      runs.push({ result: 'error', reason: error instanceof Error ? failure(error) : 'non-Error thrown' });
    }
  }
  const numbers = (key: string): number[] => runs.flatMap((run) => typeof run[key] === 'number' ? [run[key]] : []);
  result.coldOpen = { label: 'fresh process: Runtime.open to first margins, module loading included',
    firstMarginsMs: distribution(numbers('firstMarginsMs')), gitProcesses: distribution(numbers('gitProcesses')),
    maxRssMiB: distribution(numbers('maxRssMiB')), runs };
  flush('cold-opened');
}

async function main(): Promise<void> {
  execFileSync('git', ['init', '--quiet', repository]);
  execFileSync('git', ['-C', repository, 'config', 'user.name', 'cone showcase']);
  execFileSync('git', ['-C', repository, 'config', 'user.email', 'cone-showcase@example.invalid']);
  const corpus = new AnnotationCorpus(threads);
  result.shape = { documents: corpus.documents.length, threadsPerDocument: threads / corpus.documents.length, repliesPerThread: WRITERS.length - 1 };
  const runtimes = await Promise.all(WRITERS.map(async (writer) => await Runtime.open({ at: repository, writer })));
  try {
    const lanes = await Promise.all(runtimes.map(async (runtime) => await runtime.lane('margins')));
    await bulkLoad(lanes, corpus);
    await measure(lanes, corpus);
  } finally {
    await Promise.all(runtimes.map(async (runtime) => { await runtime.close(); }));
  }
  coldOpens(corpus);
  result.repoBytesAtEnd = requireBudget();
}

process.once('SIGTERM', () => {
  flush('killed');
  rmSync(work, { recursive: true, force: true });
  process.exit(143);
});

try {
  await main();
  flush(performance.now() < deadline ? 'complete' : 'deadline-reached');
} catch (error) {
  result.abort = error instanceof Error ? failure(error) : 'non-Error thrown';
  flush('aborted');
  process.exitCode = 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}
