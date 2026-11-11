import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ContentAddressableStore from '@git-stunts/git-cas';
import Plumbing from '@git-stunts/plumbing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import MaterializationCoordinate from '../../../../src/domain/materialization/MaterializationCoordinate.ts';
import MaterializationRoot from '../../../../src/domain/materialization/MaterializationRoot.ts';
import MaterializationRoots from '../../../../src/domain/materialization/MaterializationRoots.ts';
import { createEmptyState } from '../../../../src/domain/services/JoinReducer.ts';
import { computeStateHash } from '../../../../src/domain/services/state/StateSerializer.ts';
import GitCasMaterializationCacheKey from '../../../../src/infrastructure/adapters/GitCasMaterializationCacheKey.ts';
import GitCasRepositoryAdapter from '../../../../src/infrastructure/adapters/GitCasRepositoryAdapter.ts';
import GitTimelineHistoryAdapter from '../../../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import type { RuntimeStorageServices } from '../../../../src/ports/RuntimeStorageProviderPort.ts';
import ManualClock, { MANUAL_CLOCK_EPOCH_MS } from '../../../helpers/ManualClock.ts';

// Oracle (#1179): every git-cas time stamp and every expiry the repository
// adapter computes comes from the ClockPort the composition injects. The host
// `Date` is pinned one year before the injected clock, so a stamp or expiry that
// still reads the host time is visibly wrong, or git-cas rejects it.
const HOST_EPOCH_MS = MANUAL_CLOCK_EPOCH_MS;
const INJECTED_EPOCH_MS = MANUAL_CLOCK_EPOCH_MS + 365 * 24 * 60 * 60 * 1000;
const LANE = 'events';
const MATERIALIZATION_NAMESPACE = 'git-warp/materializations';
const MINUTE_MS = 60 * 1000;

type PlumbingInstance = Awaited<ReturnType<typeof Plumbing.createDefault>>;

type Fixture = Readonly<{
  clock: ManualClock;
  history: GitTimelineHistoryAdapter;
  plumbing: PlumbingInstance;
  repository: GitCasRepositoryAdapter;
  services: RuntimeStorageServices;
}>;

const directories: string[] = [];
const cleanups: Array<() => Promise<void>> = [];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(HOST_EPOCH_MS);
});

afterEach(async () => {
  const pending = cleanups.splice(0).reverse();
  for (const cleanup of pending) {
    await cleanup();
  }
  await Promise.all(directories.splice(0).map(async (directory) => {
    await rm(directory, { recursive: true, force: true });
  }));
  vi.useRealTimers();
});

describe('GitCasRepositoryAdapter clock', () => {
  it('stamps materialization cache entries with the injected clock', async () => {
    const fixture = await openFixture();
    await retain(fixture, coordinate('a'));
    fixture.clock.advance(MINUTE_MS);
    await retain(fixture, coordinate('b'));

    const inspection = await requireDiagnostics(fixture.services).inspectCache();

    expect(inspection.entries.map((entry) => entry.createdAt).sort()).toEqual([
      iso(INJECTED_EPOCH_MS),
      iso(INJECTED_EPOCH_MS + MINUTE_MS),
    ]);
  });

  it('reports cache entry expiry against the injected clock', async () => {
    const fixture = await openFixture();
    const cas = openFixtureCas(fixture);
    const page = await cas.pages.put({ source: new Uint8Array([1]) });
    const bundle = await cas.bundles.put({ members: { root: page.handle } });
    const keys = new GitCasMaterializationCacheKey({
      codec: defaultCodec,
      crypto: new NodeCryptoAdapter(),
      laneName: LANE,
    });
    const cache = await cas.caches.open({ namespace: MATERIALIZATION_NAMESPACE });
    await cache.put(`${await keys.currentPrefix()}expiring`, bundle.handle, {
      expiresAt: iso(INJECTED_EPOCH_MS + MINUTE_MS),
    });
    fixture.clock.advance(2 * MINUTE_MS);

    const inspection = await requireDiagnostics(fixture.services).inspectCache();

    expect(inspection.entries.map((entry) => entry.status)).toEqual(['expired']);
  });

  it('dates sync replay markers with the injected clock', async () => {
    const fixture = await openFixture();
    const replay = fixture.services.syncReplayProtection;
    if (replay === undefined) {
      throw new Error('Git runtime storage must provide sync replay protection');
    }

    const reservation = await replay.reserve({ keyId: 'default', nonce: 'clock', ttlMs: MINUTE_MS });

    expect(reservation).toMatchObject({
      admitted: true,
      expiresAt: iso(INJECTED_EPOCH_MS + MINUTE_MS),
      reservedAtMs: INJECTED_EPOCH_MS,
    });
  });

  it('keeps an active seek cursor alive on the injected clock', async () => {
    const fixture = await openFixture();
    const cursors = await fixture.repository.createSeekCursorStore(LANE);
    const active = { tick: 3, mode: 'all', nodes: 2, edges: 1, frontierHash: 'frontier' };

    await cursors.writeActive(active);

    await expect(cursors.readActive()).resolves.toEqual(active);
  });
});

async function openFixture(): Promise<Fixture> {
  const directory = await mkdtemp(join(tmpdir(), 'git-warp-cas-clock-'));
  directories.push(directory);
  const plumbing = await Plumbing.createDefault({ cwd: directory });
  await plumbing.execute({ args: ['init', '-q'] });
  await plumbing.execute({ args: ['config', 'user.email', 'test@test.com'] });
  await plumbing.execute({ args: ['config', 'user.name', 'Test'] });
  const history = new GitTimelineHistoryAdapter({ plumbing });
  const clock = new ManualClock(INJECTED_EPOCH_MS);
  const repository = new GitCasRepositoryAdapter({ plumbing, history, clock });
  cleanups.push(async () => {
    await repository.close();
    await history.close();
  });
  const services = await repository.createRuntimeStorageServices({
    timelineName: LANE,
    codec: defaultCodec,
    crypto: new NodeCryptoAdapter(),
    commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
  });
  return Object.freeze({ clock, history, plumbing, repository, services });
}

/** A second store on the same repository, on the same injected time, for fixture writes. */
function openFixtureCas(fixture: Fixture): ContentAddressableStore {
  const cas = ContentAddressableStore.createCbor({
    plumbing: fixture.plumbing,
    chunking: { strategy: 'cdc' },
    clock: { now: () => new Date(fixture.clock.nowMs()) },
  });
  cleanups.push(async () => await cas.close());
  return cas;
}

async function retain(fixture: Fixture, target: MaterializationCoordinate): Promise<void> {
  const replayBasis = createEmptyState();
  await fixture.services.materializations.retain({
    coordinate: target,
    roots: emptyRoots(),
    replayBasis,
    stateHash: await computeStateHash(replayBasis, {
      codec: defaultCodec,
      crypto: new NodeCryptoAdapter(),
    }),
  });
}

function requireDiagnostics(
  services: RuntimeStorageServices,
): NonNullable<RuntimeStorageServices['materializationCacheDiagnostics']> {
  const diagnostics = services.materializationCacheDiagnostics;
  if (diagnostics === undefined) {
    throw new Error('Git runtime storage must provide materialization cache diagnostics');
  }
  return diagnostics;
}

function coordinate(sha: string): MaterializationCoordinate {
  return new MaterializationCoordinate({
    frontier: new Map([['writer-a', sha.repeat(40)]]),
    ceiling: null,
  });
}

function emptyRoots(): MaterializationRoots {
  return new MaterializationRoots({
    adjacency: MaterializationRoot.empty(),
    edgeAlive: MaterializationRoot.empty(),
    edgeBirths: MaterializationRoot.empty(),
    frontier: MaterializationRoot.empty(),
    nodeAlive: MaterializationRoot.empty(),
    properties: MaterializationRoot.empty(),
    provenanceSupport: MaterializationRoot.empty(),
    replayBasis: MaterializationRoot.unavailable(),
    roaringIndexes: MaterializationRoot.empty(),
  });
}

function iso(epochMs: number): string {
  return new Date(epochMs).toISOString();
}
