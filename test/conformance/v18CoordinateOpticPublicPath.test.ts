import { describe, expect, it } from 'vitest';
import InMemoryGraphAdapter from '../../test/helpers/InMemoryGraphAdapter.ts';
import { openMemoryWarpWorldline as openWarpWorldline } from '../helpers/MemoryRuntimeHost.ts';
import type { PatchBuilder } from '../../src/domain/services/PatchBuilder.ts';
import WarpWorldline from '../../src/domain/WarpWorldline.ts';
import ConeReadIdentity from '../../src/domain/services/optic/ConeReadIdentity.ts';
import type { OpticReadIdentity } from '../../src/domain/services/optic/OpticReadIdentity.ts';

const NODE_ID = 'event-1';
const PROPERTY_KEY = 'status';
const MISSING_NODE_ID = 'event-missing';
const MISSING_PROPERTY_KEY = 'missing-status';

type SeedPatch = (patch: PatchBuilder) => void | Promise<void>;

/** A worldline with one seeded patch and no checkpoint: its coordinates are cone coordinates (#1039). */
async function openSeededWorldline(options: {
  readonly worldlineName: string;
  readonly seed: SeedPatch;
}) {
  const events = await openWarpWorldline({
    persistence: new InMemoryGraphAdapter(),
    worldlineName: options.worldlineName,
    writerId: 'app',
  });
  await events.commit(options.seed);
  return events;
}

function coneIdentity(identity: OpticReadIdentity): ConeReadIdentity {
  if (!(identity instanceof ConeReadIdentity)) {
    throw new Error('expected a cone read identity');
  }
  return identity;
}

const SEED: SeedPatch = (patch) => {
  patch.addNode(NODE_ID);
  patch.setProperty(NODE_ID, PROPERTY_KEY, 'open');
};

describe('v18 coordinate optic public path over cone records', () => {
  it('reads node and property facts through a pinned public coordinate without a checkpoint', async () => {
    const events = await openSeededWorldline({ worldlineName: 'events-coordinate-read', seed: SEED });

    const coordinate = await events.captureCoordinate();
    const node = await coordinate.optic().node(NODE_ID).read();
    const status = await coordinate.optic().node(NODE_ID).prop(PROPERTY_KEY).read();

    expect(coordinate.kind).toBe('worldline-coordinate');
    expect(coordinate.frontierEntries).toHaveLength(1);
    expect(node).toMatchObject({ nodeId: NODE_ID, alive: true });
    expect(coneIdentity(node.readIdentity).coneRoot).toBe(coordinate.coneRoot);
    expect(status).toMatchObject({ nodeId: NODE_ID, key: PROPERTY_KEY, exists: true, value: 'open' });
    expect(coneIdentity(status.readIdentity).coneRoot).toBe(coordinate.coneRoot);
  });

  it('keeps reads from one coordinate stable when the live worldline advances', async () => {
    const events = await openSeededWorldline({ worldlineName: 'events-coordinate-stability', seed: SEED });
    const before = await events.captureCoordinate();
    const beforeNode = await before.optic().node(NODE_ID).read();

    await events.commit((patch) => {
      patch.setProperty(NODE_ID, PROPERTY_KEY, 'closed');
    });

    const beforeStatus = await before.optic().node(NODE_ID).prop(PROPERTY_KEY).read();
    const after = await events.captureCoordinate();
    const afterStatus = await after.optic().node(NODE_ID).prop(PROPERTY_KEY).read();

    expect(beforeNode).toMatchObject({ nodeId: NODE_ID, alive: true });
    expect(beforeStatus).toMatchObject({ value: 'open' });
    expect(after.frontierEntries).not.toEqual(before.frontierEntries);
    expect(afterStatus).toMatchObject({ value: 'closed' });
    expect(coneIdentity(beforeStatus.readIdentity).coneRoot).toBe(before.coneRoot);
    expect(coneIdentity(afterStatus.readIdentity).coneRoot).toBe(after.coneRoot);
    expect(after.coneRoot).not.toBe(before.coneRoot);
  });

  it('reports absence for missing nodes and missing properties', async () => {
    const events = await openSeededWorldline({ worldlineName: 'events-coordinate-absence', seed: SEED });
    const coordinate = await events.captureCoordinate();

    const missingNode = await coordinate.optic().node(MISSING_NODE_ID).read();
    const missingProperty = await coordinate.optic().node(NODE_ID).prop(MISSING_PROPERTY_KEY).read();

    expect(missingNode).toMatchObject({ nodeId: MISSING_NODE_ID, alive: false });
    expect(missingProperty).toMatchObject({ nodeId: NODE_ID, key: MISSING_PROPERTY_KEY, exists: false, value: undefined });
  });

  it('rejects blank node ids and property keys as schema-invalid optic targets', async () => {
    const events = await openSeededWorldline({ worldlineName: 'events-coordinate-blank-targets', seed: SEED });
    const coordinate = await events.captureCoordinate();

    await expect(async () => coordinate.optic().node('').read()).rejects.toMatchObject({
      code: 'E_OPTIC_FAILURE_SCHEMA',
      context: { field: 'nodeId' },
    });
    await expect(async () => coordinate.optic().node(NODE_ID).prop('').read()).rejects.toMatchObject({
      code: 'E_OPTIC_FAILURE_SCHEMA',
      context: { field: 'propertyKey' },
    });
  });

  it('refuses public coordinates over storage that keeps no cone records', async () => {
    const events = new WarpWorldline({
      worldlineName: 'events-coordinate-no-cone',
      writerId: 'app',
      commitPatch: async () => 'unused',
      createWorldline: () => { throw new Error('unused compatibility projection'); },
      admitIntent: async () => { throw new Error('unused admission'); },
    });

    await expect(events.captureCoordinate()).rejects.toMatchObject({ code: 'E_WARP_WORLDLINE_CONE_UNAVAILABLE' });
    expect(() => events.optic()).toThrow(expect.objectContaining({ code: 'E_WARP_WORLDLINE_CONE_UNAVAILABLE' }));
  });
});
