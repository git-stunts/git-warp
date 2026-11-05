/**
 * Newcomer witness (#1045): a small multi-writer todo app built only through the
 * public entry points, the way someone without the docs would build it.
 *
 * Working paths are asserted directly. Each known gap is pinned to today's exact
 * receipt, with its target behaviour and owning issue beside it. When a fix lands,
 * the pin fails; the fixing PR replaces the pin with the target assertion.
 *
 * The public surface is moving to optic-only (#1048); #1055 migrates this witness onto
 * `Warp.open` / `as(writer).execute` / `Optic` once #1051 and #1052 land.
 *
 * Rules: import only `index.ts` and `advanced.ts`. No CLI repair, no internal hooks,
 * and no `Runtime.fork` before a read (fork creates a read basis as a side effect).
 */
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Runtime } from '../../../index.ts';
import type { Lane, ReadingValue } from '../../../index.ts';
import {
  createEntityAdmissionInventoryObserver,
  createObserver,
  intent,
  reading,
} from '../../../advanced.ts';

const LANE = 'todos';
const TODO = 'todo';
const repositories: string[] = [];

async function freshRepository(): Promise<string> {
  const at = await mkdtemp(join(tmpdir(), 'warp-newcomer-todo-'));
  repositories.push(at);
  execFileSync('git', ['init', '-q', at]);
  return at;
}

async function asWriter<T>(at: string, writer: string, work: (runtime: Runtime, lane: Lane) => Promise<T>): Promise<T> {
  const runtime = await Runtime.open({ at, writer });
  try {
    return await work(runtime, await runtime.lane(LANE));
  } finally {
    await runtime.close();
  }
}

async function addTodo(lane: Lane, title: string): Promise<string> {
  const receipt = await lane.write(intent.entity.addAuto({ namespace: TODO, properties: { title, done: false } }));
  expect(receipt.outcome.kind).toBe('derived');
  const subject = receipt.occurrence?.subject;
  if (subject === undefined) {
    throw new Error('an admitted entity write names its subject');
  }
  return subject;
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
  it('admits todos from three writers and lists them all through the entity inventory', async () => {
    const at = await freshRepository();
    const added: string[] = [];
    for (const writer of ['alice', 'bob', 'carol']) {
      added.push(await asWriter(at, writer, async (_runtime, lane) => await addTodo(lane, `from ${writer}`)));
    }

    const listed = await asWriter(at, 'dana', async (_runtime, lane) => await listTodoSubjects(lane));

    expect(listed.status).toBe('completed');
    expect([...listed.subjects].sort()).toEqual([...added].sort());
  });

  it('drafts a todo on a strand, then previews and settles it into the lane', async () => {
    const at = await freshRepository();
    await asWriter(at, 'alice', async (_runtime, lane) => await addTodo(lane, 'on the lane'));

    const drafted = await asWriter(at, 'alice', async (runtime, lane) => {
      const strand = await runtime.fork(lane, { name: 'draft' });
      const subject = await addTodo(strand, 'on the strand');
      const preview = await runtime.previewSettlement({ source: strand, target: lane });
      expect(preview.outcome.kind).toBe('derived');
      expect((await runtime.settle(preview.plan)).outcome.kind).toBe('derived');
      return subject;
    });

    const listed = await asWriter(at, 'bob', async (_runtime, lane) => await listTodoSubjects(lane));
    expect(listed.status).toBe('completed');
    expect(listed.subjects).toContain(drafted);
  });
});

describe('newcomer todo app: known gaps, pinned to today', () => {
  it('a new repository cannot read a todo it just wrote (target: completed with the title; owners #1039 engine, #1052 Optic)', async () => {
    const at = await freshRepository();
    const read = await asWriter(at, 'alice', async (_runtime, lane) => await readTitle(lane, await addTodo(lane, 'buy milk')));

    expect(read).toEqual({ status: 'obstructed', reason: 'missing_bounded_basis', values: [] });
  });

  it('64 more writes still give no read basis through Runtime (target: completed; owners #1039 engine, #1052 Optic)', async () => {
    const at = await freshRepository();
    const read = await asWriter(at, 'alice', async (_runtime, lane) => {
      const first = await addTodo(lane, 'todo 0');
      for (let index = 1; index <= 64; index += 1) {
        await addTodo(lane, `todo ${index}`);
      }
      return await readTitle(lane, first);
    });

    expect(read).toEqual({ status: 'obstructed', reason: 'missing_bounded_basis', values: [] });
  });

  it('observing an empty lane is refused (target: completed with zero readings; owners #1039 engine, #1052 Optic)', async () => {
    const at = await freshRepository();
    const read = await asWriter(at, 'alice', async (_runtime, lane) => await readTitle(lane, 'todo:nothing-here'));

    expect(read).toEqual({ status: 'obstructed', reason: 'missing_bounded_basis', values: [] });
  });

  it('edge.remove after edge.add is refused (target: derived; owners #1037 via #1039, #1051 write boundary)', async () => {
    const at = await freshRepository();
    const receipt = await asWriter(at, 'alice', async (_runtime, lane) => {
      const list = await addTodo(lane, 'inbox');
      const item = await addTodo(lane, 'buy milk');
      expect((await lane.write(intent.edge.add({ from: list, to: item, label: 'contains' }))).outcome.kind).toBe('derived');
      return await lane.write(intent.edge.remove({ from: list, to: item, label: 'contains' }));
    });

    expect(receipt.outcome.kind).toBe('obstruction');
    expect(receipt.reason).toBe('git-warp.write.missing-bounded-basis');
  });

  it('a strand cannot list its own todos (target: completed with the drafted todo; owner #1052)', async () => {
    const at = await freshRepository();
    const listed = await asWriter(at, 'alice', async (runtime, lane) => {
      await addTodo(lane, 'on the lane');
      const strand = await runtime.fork(lane, { name: 'draft' });
      await addTodo(strand, 'on the strand');
      return await listTodoSubjects(strand);
    });

    expect(listed).toEqual({ status: 'obstructed', reason: 'entity_admission_inventory_strand_unavailable', subjects: [] });
  });
});
