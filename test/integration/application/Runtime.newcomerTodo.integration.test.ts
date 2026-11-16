/**
 * Newcomer witness (#1045): a small multi-writer todo app built only through the
 * public entry points, the way someone without the docs would build it.
 *
 * Working paths are asserted directly. Each known gap is pinned to today's exact
 * receipt, with its target behaviour and owning issue beside it. When a fix lands,
 * the pin fails; the fixing PR replaces the pin with the target assertion.
 *
 * Writes go through `Warp.open` / `as(writer).execute` (#1051). Reads still go
 * through the legacy `Runtime` read path, which #1052 replaces with `Optic`. #1054
 * removed `Lane.write`, `Runtime.fork` and settlement; #1053 brings strands back
 * as Coordinate-derived handles.
 *
 * Rules: import only `index.ts` and `advanced.ts`. No CLI repair and no internal hooks.
 */
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  GitStorage,
  RetainedWriteReceipt,
  Runtime,
  Warp,
  WarpAccessPort,
  WarpAddress,
  WarpWriteGrant,
} from '../../../index.ts';
import type { Intent, Lane, ReadingValue, WarpWriteRequest, WriteReceipt } from '../../../index.ts';
import {
  createEntityAdmissionInventoryObserver,
  createObserver,
  intent,
  reading,
} from '../../../advanced.ts';

const LANE = 'todos';
const TODO = 'todo';
const repositories: string[] = [];

/** Lets every writer write; a newcomer's single-principal app. */
class AllowEveryWriter extends WarpAccessPort {
  override authorizeWrite(request: WarpWriteRequest): Promise<WarpWriteGrant> {
    return Promise.resolve(new WarpWriteGrant({
      authority: `newcomer:${request.writer}`,
      budget: { records: 1024, bytes: 1024 * 1024, work: 50_000 },
    }));
  }
}

async function freshRepository(): Promise<string> {
  const at = await mkdtemp(join(tmpdir(), 'warp-newcomer-todo-'));
  repositories.push(at);
  execFileSync('git', ['init', '-q', at]);
  return at;
}

async function execute(at: string, writer: string, write: Intent | readonly Intent[]): Promise<WriteReceipt> {
  const warp = await Warp.open(WarpAddress.of(GitStorage.at(at), LANE), new AllowEveryWriter());
  try {
    return await warp.as(writer).execute(write);
  } finally {
    await warp.close();
  }
}

async function addTodo(at: string, writer: string, title: string): Promise<string> {
  const receipt = await execute(at, writer, intent.entity.addAuto({ namespace: TODO, properties: { title, done: false } }));
  if (!(receipt instanceof RetainedWriteReceipt)) {
    throw new Error(`an admitted entity write is retained, got ${receipt.constructor.name}`);
  }
  expect(receipt.outcome.kind).toBe('derived');
  const subject = receipt.occurrences[0]?.subject;
  if (subject === undefined) {
    throw new Error('an admitted entity write names its subject');
  }
  return subject;
}

async function asReader<T>(at: string, work: (lane: Lane) => Promise<T>): Promise<T> {
  const runtime = await Runtime.open({ at, writer: 'reader' });
  try {
    return await work(await runtime.lane(LANE));
  } finally {
    await runtime.close();
  }
}

async function listTodoSubjects(lane: Lane) {
  const observation = lane.observe(createEntityAdmissionInventoryObserver('newcomer-todo-inventory'));
  const subjects: string[] = [];
  for await (const entry of observation) {
    if (entry.value.origin.namespace === TODO) {
      subjects.push(entry.value.representation.subject);
    }
  }
  const receipt = await observation.receipt;
  return { status: receipt.status, reason: receipt.reason, subjects };
}

async function readTitle(lane: Lane, subject: string) {
  const observation = lane.observe(createObserver('newcomer-todo-title', reading.property({ subject, key: 'title' }), (value) => value));
  const values: ReadingValue[] = [];
  for await (const entry of observation) {
    values.push(entry.value);
  }
  const receipt = await observation.receipt;
  return { status: receipt.status, reason: receipt.reason, values };
}

afterEach(async () => {
  await Promise.all(repositories.splice(0).map(async (at) => await rm(at, { recursive: true, force: true })));
});

describe('newcomer todo app: paths that work today', () => {
  it('admits todos from three writers through Warp and lists them all through the entity inventory', async () => {
    const at = await freshRepository();
    const added: string[] = [];
    for (const writer of ['alice', 'bob', 'carol']) {
      added.push(await addTodo(at, writer, `from ${writer}`));
    }

    const listed = await asReader(at, listTodoSubjects);

    expect(listed.status).toBe('completed');
    expect([...listed.subjects].sort()).toEqual([...added].sort());
  });

  it('adds and then removes an edge through Warp', async () => {
    const at = await freshRepository();
    const list = await addTodo(at, 'alice', 'inbox');
    const item = await addTodo(at, 'alice', 'buy milk');
    const added = await execute(at, 'alice', intent.edge.add({ from: list, to: item, label: 'contains' }));
    const removed = await execute(at, 'alice', intent.edge.remove({ from: list, to: item, label: 'contains' }));

    expect(added).toBeInstanceOf(RetainedWriteReceipt);
    expect(removed).toBeInstanceOf(RetainedWriteReceipt);
  });
});

describe('newcomer todo app: known gaps, pinned to today', () => {
  it('a new repository cannot read a todo it just wrote (target: completed with the title; owner #1052 Optic)', async () => {
    const at = await freshRepository();
    const subject = await addTodo(at, 'alice', 'buy milk');
    const read = await asReader(at, async (lane) => await readTitle(lane, subject));

    expect(read).toEqual({ status: 'obstructed', reason: 'missing_bounded_basis', values: [] });
  });

  it('observing an empty lane is refused (target: completed with zero readings; owner #1052 Optic)', async () => {
    const at = await freshRepository();
    const read = await asReader(at, async (lane) => await readTitle(lane, 'todo:nothing-here'));

    expect(read).toEqual({ status: 'obstructed', reason: 'missing_bounded_basis', values: [] });
  });
});
