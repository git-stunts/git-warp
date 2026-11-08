import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  GitStorage,
  IndeterminateWriteReceipt,
  RetainedWriteReceipt,
  UnpublishedWriteReceipt,
  Warp,
  WarpAccessDenied,
  WarpAccessPort,
  WarpAddress,
  WarpWriteGrant,
} from '../../index.ts';
import type { AuthoredWriteReceipt, WarpWriteRequest } from '../../index.ts';
import { getDefaultRuntimeHostNodePorts } from '../../src/application/RuntimeHostNodeDefaults.ts';
import { resolveWarpStorage } from '../../src/application/WarpStorageRegistry.ts';
import { overrideWarpComposition, type WarpCompositionOverrides } from '../../src/application/WarpWriteComposition.ts';
import { buildWriterRef } from '../../src/domain/utils/RefLayout.ts';
import { buildWriteAttemptsPrefix } from '../../src/domain/utils/WriteAttemptRefLayout.ts';
import EdgeAdd from '../../src/domain/types/ops/EdgeAdd.ts';
import NodeAdd from '../../src/domain/types/ops/NodeAdd.ts';
import { openRuntimeHostProduct, type RuntimeHostProduct } from '../../src/domain/warp/RuntimeHostProduct.ts';
import CustodyIndeterminate from '../../src/domain/services/custody/CustodyIndeterminate.ts';
import type ObservationCustodyPort from '../../src/ports/ObservationCustodyPort.ts';

export const GRAPH = 'todos';
const BUDGET = { records: 1024, bytes: 1024 * 1024, work: 50_000 };

/** Grants every writer but those in `denied`, which a test may change between calls. */
export class TestAccess extends WarpAccessPort {
  readonly requests: WarpWriteRequest[] = [];
  readonly denied: Set<string>;

  constructor(denied: Iterable<string> = []) {
    super();
    this.denied = new Set(denied);
  }

  override authorizeWrite(request: WarpWriteRequest): Promise<WarpWriteGrant | WarpAccessDenied> {
    this.requests.push(request);
    return Promise.resolve(this.denied.has(request.writer)
      ? new WarpAccessDenied('this writer may not write')
      : new WarpWriteGrant({ authority: `test:${request.writer}`, budget: BUDGET }));
  }
}

const directories: string[] = [];
const opened: Warp[] = [];

/** Closes every Warp and removes every repository this fixture made. */
export async function disposeWarpFixtures(): Promise<void> {
  await Promise.all(opened.splice(0).map(async (warp) => await warp.close()));
  await Promise.all(directories.splice(0).map(async (path) => await rm(path, { recursive: true, force: true })));
}

export function git(path: string, args: readonly string[]): string {
  return execFileSync('git', [...args], { cwd: path, encoding: 'utf8' }).trim();
}

export async function repository(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'warp-writes-'));
  directories.push(path);
  git(path, ['init', '--quiet']);
  git(path, ['config', 'user.name', 'Warp test']);
  git(path, ['config', 'user.email', 'warp@example.invalid']);
  return path;
}

export async function open(
  path: string,
  overrides: WarpCompositionOverrides = {},
  access: WarpAccessPort = new TestAccess(),
): Promise<Warp> {
  overrideWarpComposition(access, overrides);
  const warp = await Warp.open(WarpAddress.of(GitStorage.at(path), GRAPH), access);
  opened.push(warp);
  return warp;
}

/** An attempt id no writer has used, so asking about it only opens the write path. */
const UNUSED_ATTEMPT = '0'.repeat(32);

/** Opens a Warp and makes its first granted operation, which opens custody and sweeps (#1078). */
export async function openSwept(path: string, overrides: WarpCompositionOverrides = {}): Promise<Warp> {
  const warp = await open(path, overrides);
  if (await warp.as('sweeper').reconcile(UNUSED_ATTEMPT) !== null) {
    throw new Error('An unused attempt had an answer');
  }
  return warp;
}

function narrowed<T extends object>(receipt: AuthoredWriteReceipt | null, type: new (...args: never[]) => T): T {
  if (!(receipt instanceof type)) {
    throw new Error(`Expected ${type.name}, got ${JSON.stringify(receipt)}`);
  }
  return receipt;
}

export function retained(receipt: AuthoredWriteReceipt | null): RetainedWriteReceipt {
  return narrowed(receipt, RetainedWriteReceipt);
}

export function unpublished(receipt: AuthoredWriteReceipt | null): UnpublishedWriteReceipt {
  return narrowed(receipt, UnpublishedWriteReceipt);
}

export function indeterminate(receipt: AuthoredWriteReceipt | null): IndeterminateWriteReceipt {
  return narrowed(receipt, IndeterminateWriteReceipt);
}

export function tip(path: string, writer: string): string | null {
  const listed = git(path, ['for-each-ref', '--format=%(objectname)', buildWriterRef(GRAPH, writer)]);
  return listed === '' ? null : listed;
}

/** Custody that answers one step as a crash would, leaving the attempt for a later sweep. */
export function crashingAt(step: string): (custody: ObservationCustodyPort) => ObservationCustodyPort {
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

export function attemptRefs(path: string): string[] {
  const listed = git(path, ['for-each-ref', '--format=%(refname)', buildWriteAttemptsPrefix(GRAPH)]);
  return listed === '' ? [] : listed.split('\n');
}

/** Reads the graph through the legacy whole-state path, which #1052 replaces. */
async function withReader<T>(path: string, read: (reader: RuntimeHostProduct) => Promise<T>): Promise<T> {
  const storage = await GitStorage.open({ cwd: path });
  try {
    const ports = getDefaultRuntimeHostNodePorts();
    const binding = resolveWarpStorage(storage);
    return await read(await openRuntimeHostProduct({
      persistence: binding.history, runtimeStorage: binding.runtimeStorage, graphName: GRAPH, writerId: 'test-reader',
      codec: ports.codec, crypto: ports.crypto, trustCrypto: ports.trustCrypto, commitMessageCodec: ports.commitMessageCodec,
    }));
  } finally {
    await storage.close();
  }
}

export async function materialized(path: string): Promise<{ nodes: string[]; edges: string[] }> {
  return await withReader(path, async (reader) => {
    await reader.materialize();
    return {
      nodes: (await reader.getNodes()).sort(),
      edges: (await reader.getEdges()).map(({ from, to, label }) => `${from}>${to}:${label}`).sort(),
    };
  });
}

export async function nodeProperties(path: string, nodeId: string): ReturnType<RuntimeHostProduct['getNodeProps']> {
  return await withReader(path, async (reader) => {
    await reader.materialize();
    return await reader.getNodeProps(nodeId);
  });
}

/** Every add dot each writer's chain issued, as `writer:counter`. */
export async function addDots(path: string, writers: readonly string[]): Promise<string[]> {
  return await withReader(path, async (reader) => {
    const dots: string[] = [];
    for (const writer of writers) {
      for (const { patch } of await reader.getWriterPatches(writer)) {
        for (const op of patch.ops) {
          if (op instanceof NodeAdd || op instanceof EdgeAdd) {
            dots.push(`${op.dot.writerId}:${op.dot.counter}`);
          }
        }
      }
    }
    return dots;
  });
}
