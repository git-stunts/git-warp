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
import { openRuntimeHostProduct } from '../../src/domain/warp/RuntimeHostProduct.ts';

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

export function attemptRefs(path: string): string[] {
  const listed = git(path, ['for-each-ref', '--format=%(refname)', buildWriteAttemptsPrefix(GRAPH)]);
  return listed === '' ? [] : listed.split('\n');
}

/** Reads what the graph converged to through the legacy whole-state path, which #1052 replaces. */
export async function materialized(path: string): Promise<{ nodes: string[]; edges: string[] }> {
  const storage = await GitStorage.open({ cwd: path });
  try {
    const ports = getDefaultRuntimeHostNodePorts();
    const binding = resolveWarpStorage(storage);
    const reader = await openRuntimeHostProduct({
      persistence: binding.history, runtimeStorage: binding.runtimeStorage, graphName: GRAPH, writerId: 'test-reader',
      codec: ports.codec, crypto: ports.crypto, trustCrypto: ports.trustCrypto, commitMessageCodec: ports.commitMessageCodec,
    });
    await reader.materialize();
    return {
      nodes: (await reader.getNodes()).sort(),
      edges: (await reader.getEdges()).map(({ from, to, label }) => `${from}>${to}:${label}`).sort(),
    };
  } finally {
    await storage.close();
  }
}
