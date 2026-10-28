// Cold open: a fresh Node process opens the Runtime and reads one document's margins.
// Usage: node ColdOpen.ts <repository> <writer> <document-id>
// Prints one JSON line. `firstMarginsMs` runs from process start, module loading included.
import process from 'node:process';

import counter from './GitProcessCounter.ts';
import { Runtime } from '@git-stunts/git-warp';
import MarginStore, { MarginsUnavailable } from '../../examples/annotations/MarginStore.ts';
import ReceiptLedger from '../../examples/annotations/ReceiptLedger.ts';

const [repository = '', writer = '', documentId = ''] = process.argv.slice(2);
const before = counter.snapshot();
const openStarted = performance.now();
const runtime = await Runtime.open({ at: repository, writer });
try {
  const store = new MarginStore(await runtime.lane('margins'), new ReceiptLedger());
  const openMs = performance.now() - openStarted;
  const margins = await store.margins(documentId);
  const firstMarginsMs = performance.now();
  const processes = counter.since(before);
  process.stdout.write(`${JSON.stringify({
    firstMarginsMs: Math.round(firstMarginsMs),
    openMs: Math.round(openMs),
    gitProcesses: processes.total,
    byCommand: processes.byCommand,
    result: margins instanceof MarginsUnavailable ? margins.status : 'completed',
    reason: margins instanceof MarginsUnavailable ? `${margins.observer}: ${margins.reason}` : null,
    threads: margins instanceof MarginsUnavailable ? null : margins.threads.length,
    maxRssMiB: Math.round(process.resourceUsage().maxRSS / 1024),
  })}\n`);
} finally {
  await runtime.close();
}
