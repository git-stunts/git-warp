import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { intent } from '../../../advanced.ts';
import {
  Coordinate,
  GitStorage,
  UnretainedWriteReceipt,
  Warp,
  WarpAccessPort,
  WarpAddress,
  WarpWriteGrant,
} from '../../../index.ts';
import type { WarpCompositionOverrides } from '../../../src/application/WarpWriteComposition.ts';
import ObservationAttemptId from '../../../src/domain/services/custody/ObservationAttemptId.ts';
import CustodyIndeterminate from '../../../src/domain/services/custody/CustodyIndeterminate.ts';
import { buildWriterRef } from '../../../src/domain/utils/RefLayout.ts';
import { buildWriteAttemptsPrefix } from '../../../src/domain/utils/WriteAttemptRefLayout.ts';
import { CborPatchJournalAdapter } from '../../../src/infrastructure/adapters/CborPatchJournalAdapter.ts';
import type ObservationCustodyPort from '../../../src/ports/ObservationCustodyPort.ts';
import { getDefaultRuntimeHostNodePorts } from '../../../src/application/RuntimeHostNodeDefaults.ts';
import { resolveWarpStorage } from '../../../src/application/WarpStorageRegistry.ts';
import { openRuntimeHostProduct } from '../../../src/domain/warp/RuntimeHostProduct.ts';
import {
  GRAPH,
  TestAccess,
  attemptRefs,
  disposeWarpFixtures,
  git,
  indeterminate,
  materialized,
  open,
  repository,
  retained,
  tip,
  unpublished,
} from '../../helpers/WarpWriteFixture.ts';

afterEach(async () => {
  vi.restoreAllMocks();
  await disposeWarpFixtures();
});

describe('Warp.open and as(writer).execute', () => {
  it('publishes through custody on a fresh repository and returns a parsable Coordinate', async () => {
    const path = await repository();
    const warp = await open(path);

    const receipt = retained(await warp.as('alice').execute(intent.node.add({ subject: 'todo:one' })));

    expect(receipt.outcome.kind).toBe('derived');
    expect(receipt.writer).toBe('alice');
    expect(receipt.publication.toString()).toBe(tip(path, 'alice'));
    expect(Coordinate.parse(receipt.coordinate.toString()).toString()).toBe(receipt.coordinate.toString());
    expect(attemptRefs(path)).toEqual([]);
  });

  it('keeps edge.remove after edge.add derived, with no whole-state read', async () => {
    const path = await repository();
    const warp = await open(path);
    const writer = warp.as('alice');

    retained(await writer.execute([intent.node.add({ subject: 'a' }), intent.node.add({ subject: 'b' }), intent.edge.add({ from: 'a', to: 'b', label: 'links' })]));
    const removed = retained(await writer.execute(intent.edge.remove({ from: 'a', to: 'b', label: 'links' })));

    expect(removed.outcome.kind).toBe('derived');
    expect(await materialized(path)).toEqual({ nodes: ['a', 'b'], edges: [] });
  });

  it('converges three writers on one Warp, each on its own linear chain', async () => {
    const path = await repository();
    const warp = await open(path);
    for (const writer of ['alice', 'bob', 'carol']) {
      retained(await warp.as(writer).execute(intent.node.add({ subject: `node:${writer}` })));
      retained(await warp.as(writer).execute(intent.property.set({ subject: `node:${writer}`, key: 'title', value: writer })));
    }
    await Promise.all(['alice', 'bob', 'carol'].map(async (writer) => {
      retained(await warp.as(writer).execute(intent.edge.add({ from: `node:${writer}`, to: 'node:alice', label: 'knows' })));
    }));

    expect((await materialized(path)).nodes).toEqual(['node:alice', 'node:bob', 'node:carol']);
    expect((await materialized(path)).edges).toHaveLength(3);
    for (const writer of ['alice', 'bob', 'carol']) {
      expect(git(path, ['rev-list', '--count', buildWriterRef(GRAPH, writer)])).toBe('3');
      expect(git(path, ['rev-list', '--count', '--merges', buildWriterRef(GRAPH, writer)])).toBe('0');
    }
  });

  it('survives Git GC and a reopen with its writes and evidence intact', async () => {
    const path = await repository();
    const first = await open(path);
    const receipt = retained(await first.as('alice').execute(intent.node.add({ subject: 'kept' })));
    await first.close();
    git(path, ['gc', '--prune=now', '--quiet']);

    const second = await open(path);
    retained(await second.as('alice').execute(intent.node.add({ subject: 'next' })));

    expect(Coordinate.parse(receipt.coordinate.toString()).toString()).toBe(receipt.coordinate.toString());
    expect((await materialized(path)).nodes).toEqual(['kept', 'next']);
  });

  it('reports the entity an entity.add admitted', async () => {
    const path = await repository();
    const warp = await open(path);
    const receipt = retained(await warp.as('alice').execute(intent.entity.addAuto({ namespace: "todo", properties: { title: "one" } })));

    expect(receipt.occurrences).toHaveLength(1);
    expect(receipt.occurrences[0]?.intentIndex).toBe(0);
    expect((await materialized(path)).nodes).toEqual([receipt.occurrences[0]?.subject]);
  });

  it('reports a register race it never observed as plural', async () => {
    const path = await repository();
    const warp = await open(path);
    retained(await warp.as('alice').execute([intent.node.add({ subject: 'doc' }), intent.property.set({ subject: 'doc', key: 'title', value: 'one' })]));
    const storage = await GitStorage.open({ cwd: path });
    const ports = getDefaultRuntimeHostNodePorts();
    const binding = resolveWarpStorage(storage);
    const other = await openRuntimeHostProduct({
      persistence: binding.history, runtimeStorage: binding.runtimeStorage, graphName: GRAPH, writerId: 'bob',
      codec: ports.codec, crypto: ports.crypto, trustCrypto: ports.trustCrypto, commitMessageCodec: ports.commitMessageCodec,
    });
    await other.patch((patch) => { patch.setProperty('doc', 'title', 'unseen'); });
    await storage.close();

    const raced = retained(await warp.as('alice').execute(intent.property.set({ subject: 'doc', key: 'title', value: 'two' })));

    expect(raced.outcome.kind).toBe('plural');
    expect(raced.outcome.races).toHaveLength(1);
    expect(raced.outcome.races[0]).toMatchObject({ kind: 'register', subject: 'doc', key: 'title', writers: ['bob'], overflow: 0 });
  });
});

describe('refusals before publication', () => {
  it('denies through the access boundary before reading or reserving anything', async () => {
    const path = await repository();
    const warp = await open(path, {}, new TestAccess(new Set(['mallory'])));

    const denied = unpublished(await warp.as('mallory').execute(intent.node.add({ subject: 'x' })));

    expect(denied.cause).toContain('access-denied');
    expect(tip(path, 'mallory')).toBeNull();
    expect(attemptRefs(path)).toEqual([]);
    expect(git(path, ['for-each-ref', '--format=%(refname)', `refs/warp/${GRAPH}/cone/`])).toBe('');
  });

  it('refuses an operation over the granted budget', async () => {
    const path = await repository();
    const tight = new (class extends WarpAccessPort {
      override authorizeWrite(): Promise<WarpWriteGrant> {
        return Promise.resolve(new WarpWriteGrant({ authority: 'tight', budget: { records: 1, bytes: 1024, work: 1 } }));
      }
    })();
    const warp = await open(path, {}, tight);

    expect(unpublished(await warp.as('alice').execute([intent.property.set({ subject: 'a', key: 'k', value: 1 }), intent.property.set({ subject: 'b', key: 'k', value: 2 })])).cause).toBe('budget-exhausted');
    expect(unpublished(await warp.as('alice').execute([intent.node.add({ subject: 'a' }), intent.node.add({ subject: 'b' })])).cause).toBe('budget-exhausted');
    expect(tip(path, 'alice')).toBeNull();
  });

  it('refuses a remove of what is absent', async () => {
    const path = await repository();
    const warp = await open(path);
    const writer = warp.as('alice');

    expect(unpublished(await writer.execute(intent.node.remove({ subject: 'ghost' }))).cause).toContain('not-found');
    expect(unpublished(await writer.execute(intent.edge.remove({ from: 'a', to: 'b', label: 'links' }))).cause).toContain('not-found');
    expect(tip(path, 'alice')).toBeNull();
    expect(attemptRefs(path)).toEqual([]);
  });

  it('refuses over a full retention capacity, leaving what was issued', async () => {
    const path = await repository();
    const warp = await open(path, { limit: 1 });

    const first = retained(await warp.as('alice').execute(intent.node.add({ subject: 'one' })));
    const refused = unpublished(await warp.as('alice').execute(intent.node.add({ subject: 'two' })));

    expect(refused.cause).toBe('retention-capacity-exhausted');
    expect(refused.repairHints[0]?.code).toBe('retention_capacity_exhausted');
    expect(tip(path, 'alice')).toBe(first.publication.toString());
    expect(attemptRefs(path)).toEqual([]);
  });

  it('requires an address and an explicit access boundary', async () => {
    const path = await repository();
    const address = WarpAddress.of(GitStorage.at(path), GRAPH);

    await expect(Warp.open(address, {} as WarpAccessPort)).rejects.toMatchObject({ code: 'E_WARP_OPEN_ACCESS' });
    await expect(Warp.open(GRAPH as unknown as WarpAddress, new TestAccess())).rejects.toMatchObject({ code: 'E_WARP_OPEN_ADDRESS' });
    expect(() => WarpAddress.of({} as GitStorage, GRAPH)).toThrow('GitStorage');
    expect(() => WarpAddress.of(GitStorage.root(), 'bad/../name')).toThrow();
    expect(() => GitStorage.at('')).toThrow('path');
  });

  it('stops admitting operations once closed', async () => {
    const path = await repository();
    const warp = await Warp.open(WarpAddress.of(GitStorage.at(path), GRAPH), new TestAccess());
    const writer = warp.as('alice');
    retained(await writer.execute(intent.node.add({ subject: 'a' })));

    await warp.close();

    await expect(writer.execute(intent.node.add({ subject: 'b' }))).rejects.toMatchObject({ code: 'E_WARP_CLOSED' });
  });
});

describe('the write premise is never recaptured', () => {
  /** Runs `during` after a write's premises are bound and before it can arm. */
  function interposing(during: () => Promise<void>): WarpCompositionOverrides {
    return {
      attempts: { next: () => { pending = during(); return new ObservationAttemptId(globalThis.crypto.randomUUID().replaceAll('-', '')); } },
      wrapCustody: (custody) => new Proxy(custody, {
        get(target: ObservationCustodyPort, name: string | symbol) {
          const value = Reflect.get(target, name) as unknown;
          if (name !== 'reserve' || typeof value !== 'function') {
            return typeof value === 'function' ? value.bind(target) : value;
          }
          return async (...args: unknown[]) => {
            await pending;
            return await (value as (...inner: unknown[]) => Promise<unknown>).apply(target, args);
          };
        },
      }),
    };
  }
  let pending: Promise<void> = Promise.resolve();

  it('reports a lost race on its own writer as stale, and never retries it', async () => {
    const path = await repository();
    const rival = await open(path);
    let raced = false;
    let rivalCommit = '';
    const warp = await open(path, interposing(async () => {
      if (!raced) {
        raced = true;
        rivalCommit = retained(await rival.as('alice').execute(intent.node.add({ subject: 'rival' }))).publication.toString();
      }
    }));

    const receipt = unpublished(await warp.as('alice').execute(intent.node.add({ subject: 'mine' })));

    expect(receipt.cause).toBe('stale-predecessor');
    expect(tip(path, 'alice')).toBe(rivalCommit);
    expect(attemptRefs(path)).toEqual([]);
    expect((await materialized(path)).nodes).toEqual(['rival']);
  });

  it('publishes independently of an unrelated writer that advanced meanwhile', async () => {
    const path = await repository();
    const rival = await open(path);
    let raced = false;
    const warp = await open(path, interposing(async () => {
      if (!raced) {
        raced = true;
        retained(await rival.as('bob').execute(intent.node.add({ subject: 'bobs' })));
      }
    }));

    const receipt = retained(await warp.as('alice').execute(intent.node.add({ subject: 'alices' })));

    expect(git(path, ['log', '-1', '--format=%P', receipt.publication.toString()])).toBe('');
    expect((await materialized(path)).nodes).toEqual(['alices', 'bobs']);
  });
});

describe('uncertainty after permission', () => {
  it('reports indeterminate when a publication fails with nothing landed, until the chain decides', async () => {
    const path = await repository();
    const warp = await open(path);
    const writer = warp.as('alice');
    retained(await writer.execute(intent.node.add({ subject: 'first' })));
    const append = vi.spyOn(CborPatchJournalAdapter.prototype, 'appendPatch').mockRejectedValueOnce(new Error('disk went away'));

    const receipt = indeterminate(await writer.execute(intent.node.add({ subject: 'second' })));

    expect(receipt.requirement).toBe('publication-unresolved');
    expect(attemptRefs(path)).toHaveLength(1);
    expect(indeterminate(await writer.reconcile(receipt.attempt)).requirement).toBe('publication-unresolved');
    append.mockRestore();

    retained(await writer.execute(intent.node.add({ subject: 'third' })));

    expect(unpublished(await writer.reconcile(receipt.attempt)).cause).toBe('stale-predecessor');
    expect(await writer.reconcile(receipt.attempt)).toBeNull();
    expect((await materialized(path)).nodes).toEqual(['first', 'third']);
  });

  it('recognises its own publication when the acknowledgement was lost', async () => {
    const path = await repository();
    const warp = await open(path);
    const original = CborPatchJournalAdapter.prototype.appendPatch;
    vi.spyOn(CborPatchJournalAdapter.prototype, 'appendPatch').mockImplementationOnce(async function lost(this: CborPatchJournalAdapter, request) {
      await original.call(this, request);
      throw new Error('acknowledgement lost');
    });

    const receipt = retained(await warp.as('alice').execute(intent.node.add({ subject: 'landed' })));

    expect(receipt.publication.toString()).toBe(tip(path, 'alice'));
    expect(attemptRefs(path)).toEqual([]);
  });

  it('reports unretained, not unapplied, when settlement fails, and a reopen finishes it', async () => {
    const path = await repository();
    let failing = true;
    const warp = await open(path, {
      wrapCustody: (custody) => new Proxy(custody, {
        get(target: ObservationCustodyPort, name: string | symbol) {
          const value = Reflect.get(target, name) as unknown;
          if (name === 'settle' && failing) {
            return () => Promise.resolve(new CustodyIndeterminate(new Error('store went away')));
          }
          return typeof value === 'function' ? value.bind(target) : value;
        },
      }),
    });

    const receipt = await warp.as('alice').execute(intent.node.add({ subject: 'landed' }));

    expect(receipt).toBeInstanceOf(UnretainedWriteReceipt);
    expect(attemptRefs(path)).toHaveLength(1);
    expect((await materialized(path)).nodes).toEqual(['landed']);
    failing = false;
    await warp.close();

    await open(path);

    expect(attemptRefs(path)).toEqual([]);
    expect((await materialized(path)).nodes).toEqual(['landed']);
  });
});

describe('recovery on open', () => {
  function crashingAt(step: string): (custody: ObservationCustodyPort) => ObservationCustodyPort {
    return (custody) => new Proxy(custody, {
      get(target: ObservationCustodyPort, name: string | symbol) {
        if (name === step) {
          return () => Promise.resolve(new CustodyIndeterminate(new Error('crash')));
        }
        const value = Reflect.get(target, name) as unknown;
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  }

  it('leaves a young unarmed attempt alone, then frees its slot once it is old', async () => {
    const path = await repository();
    let now = 1_000;
    const clock = () => now;
    const crashed = await open(path, { limit: 1, clock, wrapCustody: crashingAt('arm') });
    expect(unpublished(await crashed.as('alice').execute(intent.node.add({ subject: 'never' }))).cause).toBe('retention-unavailable');
    await crashed.close();

    const young = await open(path, { limit: 1, clock });
    expect(attemptRefs(path)).toHaveLength(1);
    await young.close();

    now += 2 * 60 * 60 * 1000;
    const old = await open(path, { limit: 1, clock });

    expect(attemptRefs(path)).toEqual([]);
    retained(await old.as('alice').execute(intent.node.add({ subject: 'fits' })));
  });

  it('skips a saved record it cannot decode, leaving it for an operator', async () => {
    const path = await repository();
    await (await open(path)).close();
    const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: path, encoding: 'utf8', input: 'not a record' }).trim();
    git(path, ['update-ref', `${buildWriteAttemptsPrefix(GRAPH)}${'a'.repeat(32)}`, blob]);

    const warp = await open(path);

    expect(attemptRefs(path)).toHaveLength(1);
    retained(await warp.as('alice').execute(intent.node.add({ subject: 'unaffected' })));
  });
});
