// Summarize cone-showcase result files as one Markdown table.
// Usage: node WitnessReport.ts <results-directory> <label>
// Reads cone-showcase-<N>.json files and writes summary.json and summary.md beside them.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

type Distribution = { n: number; p50: number | null; p95: number | null };
type Phase = { samples: number; ms: Distribution; gitProcesses: Distribution; results: Record<string, number>; reasons: Record<string, number> };
type Result = {
  threads: number; status: string; elapsedMs: number; maxRssMiB: number; abort?: string;
  bulkLoad?: { patches: number; totalMs: number; perPatch: Phase; repoBytes: number };
  saves?: Phase; margins?: Phase & { mismatches: number };
  coldOpen?: { firstMarginsMs: Distribution; gitProcesses: Distribution; maxRssMiB: Distribution; runs: { result?: string; reason?: string | null }[] };
};

const [directory = '.', label = 'unlabelled'] = process.argv.slice(2);
const results: Result[] = readdirSync(directory)
  .filter((name) => /^cone-showcase-\d+\.json$/.test(name))
  .map((name) => JSON.parse(readFileSync(join(directory, name), 'utf8')))
  .sort((left: Result, right: Result) => left.threads - right.threads);

const pair = (value: Distribution | undefined): string =>
  value === undefined || value.p50 === null ? 'n/m' : `${value.p50} / ${value.p95}`;
const outcomes = (phase: Phase | undefined): string =>
  phase === undefined ? 'n/m' : Object.entries(phase.results).map(([kind, count]) => `${kind} ${count}`).join(', ');
const cold = (result: Result): string =>
  result.coldOpen === undefined ? 'n/m' : result.coldOpen.runs.map((run) => run.result ?? '?').join(', ');

const rows: [string, (result: Result) => string][] = [
  ['Run status', (result) => result.status + (result.abort === undefined ? '' : ` (${result.abort})`)],
  ['Bulk load, batched (patches; total ms)', (result) => result.bulkLoad === undefined ? 'n/m' : `${result.bulkLoad.patches}; ${result.bulkLoad.totalMs}`],
  ['Repo after load (MiB)', (result) => result.bulkLoad === undefined ? 'n/m' : String(Math.round(result.bulkLoad.repoBytes / 2 ** 20))],
  ['Save, one patch, ms (p50 / p95)', (result) => pair(result.saves?.ms)],
  ['Git processes per save (p50 / p95)', (result) => pair(result.saves?.gitProcesses)],
  ['Save outcomes', (result) => outcomes(result.saves)],
  ["One document's margins, ms (p50 / p95)", (result) => pair(result.margins?.ms)],
  ['Git processes per margins read (p50 / p95)', (result) => pair(result.margins?.gitProcesses)],
  ['Margins outcomes', (result) => outcomes(result.margins) + (result.margins === undefined ? '' : `; mismatches among completed ${result.margins.mismatches}`)],
  ['Cold open to first margins, ms (p50 / p95)', (result) => pair(result.coldOpen?.firstMarginsMs)],
  ['Git processes, cold open (p50 / p95)', (result) => pair(result.coldOpen?.gitProcesses)],
  ['Cold open outcomes', cold],
  ['Max RSS, witness process (MiB)', (result) => String(result.maxRssMiB)],
  ['Max RSS, cold open process (MiB, p50 / p95)', (result) => pair(result.coldOpen?.maxRssMiB)],
];

const reasons = results.flatMap((result) => [
  ...Object.entries(result.saves?.reasons ?? {}).map(([reason, count]) => `- ${result.threads} threads, saves: ${reason} (${count})`),
  ...Object.entries(result.margins?.reasons ?? {}).map(([reason, count]) => `- ${result.threads} threads, margins: ${reason} (${count})`),
  ...[...new Set((result.coldOpen?.runs ?? []).flatMap((run) => typeof run.reason === 'string' ? [run.reason] : []))]
    .map((reason) => `- ${result.threads} threads, cold open: ${reason}`),
]);

const table = [
  `| Metric | ${results.map((result) => `${result.threads.toLocaleString('en-US')} threads`).join(' | ')} |`,
  `| --- | ${results.map(() => '---').join(' | ')} |`,
  ...rows.map(([name, cell]) => `| ${name} | ${results.map((result) => cell(result).replace(/\|/g, '/')).join(' | ')} |`),
];
const markdown = [`# Cone showcase witness: ${label}`, '', ...table, '', '## Obstructions and errors', '',
  ...(reasons.length === 0 ? ['None.'] : reasons), ''].join('\n');
writeFileSync(join(directory, 'summary.md'), markdown);
writeFileSync(join(directory, 'summary.json'), `${JSON.stringify({ label, results }, null, 2)}\n`);
process.stdout.write(markdown);
