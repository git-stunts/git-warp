// The annotations example: margin notes shared by two people through a Git hub.
//
// Usage: node examples/annotations/run.ts [<empty-work-directory>]
//
// This is the teaching example of the intended git-warp usage:
//
//   write intents, observe bounded readings, keep receipts.
//
// Application code imports only `Runtime` (and types) from the package root
// and the generated domain SDK in ./sdk. It never imports `advanced`, never
// materializes, never runs a repair step, and never touches refs other than
// the writer chains that sync.md says to move.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { Runtime } from '@git-stunts/git-warp';

import { publish, receive, type SyncTarget } from './HubSync.ts';
import MarginStore, { MarginsUnavailable, type Margins } from './MarginStore.ts';
import ReceiptLedger from './ReceiptLedger.ts';
import { annotations } from './sdk/annotations.generated.ts';

const LANE = 'margins';
const DOCUMENT = 'essay';

/** One person's clone of the shared repository, writing as one stable writer id. */
class Clone {
  readonly target: SyncTarget;
  readonly ledger = new ReceiptLedger();

  constructor(root: string, writer: string, hub: string) {
    const repository = join(root, writer);
    execFileSync('git', ['init', '--quiet', repository]);
    execFileSync('git', ['-C', repository, 'config', 'user.name', writer]);
    execFileSync('git', ['-C', repository, 'config', 'user.email', `${writer}@example.invalid`]);
    execFileSync('git', ['-C', repository, 'remote', 'add', 'origin', hub]);
    this.target = Object.freeze({ repository, lane: LANE, writer, remote: 'origin' });
  }

  /** Opens the Runtime, runs one session of work, and closes it again. */
  async session<TResult>(work: (store: MarginStore) => Promise<TResult>): Promise<TResult> {
    const runtime = await Runtime.open({ at: this.target.repository, writer: this.target.writer });
    try {
      return await work(new MarginStore(await runtime.lane(LANE), this.ledger));
    } finally {
      await runtime.close();
    }
  }
}

function describe(margins: Margins | MarginsUnavailable): string {
  if (margins instanceof MarginsUnavailable) {
    return `  unavailable: ${margins.observer} ${margins.status} (${margins.reason})`;
  }
  return margins.threads.map((thread) => [
    `  [${thread.status}${thread.resolvedBy === null ? '' : ` by ${thread.resolvedBy}`}] "${thread.quote}" @${thread.start}-${thread.end}`,
    ...thread.comments.map((comment) =>
      `    ${comment.author}: ${comment.body}${comment.inReplyTo === null ? '' : ` (re ${comment.inReplyTo})`}${comment.editedAt === null ? '' : ' (edited)'}`),
  ].join('\n')).join('\n');
}

const EXPECTED: Margins = {
  documentId: DOCUMENT,
  threads: [
    {
      id: 't1', document: DOCUMENT, quote: 'causal cones', start: 10, end: 22, status: 'resolved', resolvedBy: 'alice',
      comments: [
        { id: 'c1', author: 'alice', body: 'Is this read bounded by the cone?', createdAt: '2026-10-28T09:00:00Z', inReplyTo: null, editedAt: '2026-10-28T09:30:00Z' },
        { id: 'c2', author: 'bob', body: 'Yes: only the entities it names.', createdAt: '2026-10-28T09:10:00Z', inReplyTo: 'c1', editedAt: null },
      ],
    },
    {
      id: 't2', document: DOCUMENT, quote: 'receipts', start: 40, end: 48, status: 'open', resolvedBy: null,
      comments: [
        { id: 'c4', author: 'bob', body: 'Keep these.', createdAt: '2026-10-28T09:12:00Z', inReplyTo: null, editedAt: null },
      ],
    },
  ],
};

function sortThreads(margins: Margins | MarginsUnavailable): Margins | MarginsUnavailable {
  return margins instanceof MarginsUnavailable
    ? margins
    : { documentId: margins.documentId, threads: [...margins.threads].sort((left, right) => left.id.localeCompare(right.id)) };
}

async function main(root: string): Promise<boolean> {
  const hub = join(root, 'hub.git');
  execFileSync('git', ['init', '--quiet', '--bare', hub]);
  const alice = new Clone(root, 'alice', hub);
  const bob = new Clone(root, 'bob', hub);

  // 1. Alice highlights a passage and comments, then publishes her writer chain.
  await alice.session(async (store) => {
    await store.save('openThread t1', annotations.intents.openThread({
      documentId: DOCUMENT, threadId: 't1', quote: 'causal cones', start: 10, end: 22,
      commentId: 'c1', author: 'alice', body: 'Is this read bounded?', createdAt: '2026-10-28T09:00:00Z',
    }));
  });
  publish(alice.target);

  // 2. Bob receives, replies to Alice, and opens a thread of his own.
  receive(bob.target);
  await bob.session(async (store) => {
    await store.save('reply c2', annotations.intents.reply({
      threadId: 't1', commentId: 'c2', inReplyTo: 'c1', author: 'bob',
      body: 'Yes: only the entities it names.', createdAt: '2026-10-28T09:10:00Z',
    }));
    await store.save('openThread t2', annotations.intents.openThread({
      documentId: DOCUMENT, threadId: 't2', quote: 'receipts', start: 40, end: 48,
      commentId: 'c4', author: 'bob', body: 'Keep these.', createdAt: '2026-10-28T09:12:00Z',
    }));
  });
  publish(bob.target);

  // 3. Alice writes concurrently, then receives Bob's work and keeps going.
  await alice.session(async (store) => {
    await store.save('reply c3', annotations.intents.reply({
      threadId: 't1', commentId: 'c3', author: 'alice', body: 'tpyo', createdAt: '2026-10-28T09:20:00Z',
    }));
  });
  receive(alice.target);
  await alice.session(async (store) => {
    await store.save('editComment c1', annotations.intents.editComment({
      commentId: 'c1', body: 'Is this read bounded by the cone?', editedAt: '2026-10-28T09:30:00Z',
    }));
    await store.save('deleteComment c3', annotations.intents.deleteComment({ threadId: 't1', commentId: 'c3' }));
    await store.save('resolveThread t1', annotations.intents.resolveThread({ threadId: 't1', resolvedBy: 'alice' }));
  });
  publish(alice.target);

  // 4. Both clones read the same document's margins and must agree.
  receive(bob.target);
  const seenByBob = sortThreads(await bob.session(async (store) => await store.margins(DOCUMENT)));
  const seenByAlice = sortThreads(await alice.session(async (store) => await store.margins(DOCUMENT)));
  console.log(`margins of ${DOCUMENT}, as alice reads them:\n${describe(seenByAlice)}`);
  console.log(`margins of ${DOCUMENT}, as bob reads them:\n${describe(seenByBob)}`);

  for (const clone of [alice, bob]) {
    console.log(`receipts kept by ${clone.target.writer}:`);
    for (const entry of clone.ledger.entries) {
      console.log(`  ${entry.kind} ${entry.operation}: ${entry.result}${entry.reason === null ? '' : ` (${entry.reason})`}`);
    }
  }
  const unsettled = [...alice.ledger.unsettled, ...bob.ledger.unsettled];
  const agreed = isDeepStrictEqual(seenByAlice, EXPECTED) && isDeepStrictEqual(seenByBob, EXPECTED);
  console.log(unsettled.length === 0 && agreed
    ? 'annotations example settled: both clones read the expected margins'
    : `annotations example did not settle: ${unsettled.length} unsettled receipts, margins ${agreed ? 'agree' : 'differ from the expected margins'}`);
  return unsettled.length === 0 && agreed;
}

const supplied = process.argv[2];
const root = supplied ?? mkdtempSync(join(tmpdir(), 'git-warp-annotations-'));
try {
  process.exitCode = await main(root) ? 0 : 1;
} finally {
  if (supplied === undefined) {
    rmSync(root, { recursive: true, force: true });
  }
}
