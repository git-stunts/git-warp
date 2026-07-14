import { describe, expect, it } from 'vitest';
import InMemoryGraphAdapter from '../../test/helpers/InMemoryGraphAdapter.ts';
import {
  openMemoryRuntimeHostProduct as openRuntimeHostProduct,
  openMemoryWarpWorldline as openWarpWorldline,
} from '../helpers/MemoryRuntimeHost.ts';
import type { PatchBuilder } from '../../src/domain/services/PatchBuilder.ts';

const NODE_ID = 'event-1';
const PROPERTY_KEY = 'status';
const MISSING_NODE_ID = 'event-missing';
const MISSING_PROPERTY_KEY = 'missing-status';

type SeedPatch = (patch: PatchBuilder) => void | Promise<void>;

async function openWorldlineWithOperatorBasis(options: {
  readonly worldlineName: string;
  readonly seed: SeedPatch;
  readonly onDeleteWithData?: 'reject' | 'cascade' | 'warn';
}) {
  const persistence = new InMemoryGraphAdapter();
  const runtime = await openRuntimeHostProduct({
    persistence,
    graphName: options.worldlineName,
    writerId: 'app',
    ...(options.onDeleteWithData === undefined
      ? {}
      : { onDeleteWithData: options.onDeleteWithData }),
  });
  await runtime.patch(options.seed);
  await runtime.materialize();
  await runtime.createCheckpoint();
  return await openWarpWorldline({
    persistence,
    worldlineName: options.worldlineName,
    writerId: 'app',
    ...(options.onDeleteWithData === undefined
      ? {}
      : { onDeleteWithData: options.onDeleteWithData }),
  });
}

describe('v18 coordinate optic public path', () => {
  it('reads node and property facts through a pinned public coordinate', async () => {
    const events = await openWorldlineWithOperatorBasis({
      worldlineName: 'events-coordinate-read',
      seed: (patch) => {
        patch.addNode(NODE_ID);
        patch.setProperty(NODE_ID, PROPERTY_KEY, 'open');
      },
    });
    const basis = await events.prepareOpticBasis();

    const coordinate = await events.coordinate();
    const node = await coordinate.optic().node(NODE_ID).read();
    const status = await coordinate.optic().node(NODE_ID).prop(PROPERTY_KEY).read();

    expect(basis.kind).toBe('checkpoint-tail-optic-basis');
    expect(coordinate.kind).toBe('worldline-coordinate');
    expect(coordinate.checkpointSha).toBe(basis.checkpointSha);
    expect(coordinate.frontierEntries).toHaveLength(1);
    expect(node).toMatchObject({ nodeId: NODE_ID, alive: true });
    expect(node.readIdentity).toMatchObject({
      kind: 'checkpoint-tail-read',
      checkpointSha: coordinate.checkpointSha,
    });
    expect(status).toMatchObject({
      nodeId: NODE_ID,
      key: PROPERTY_KEY,
      exists: true,
      value: 'open',
    });
    expect(status.readIdentity).toMatchObject({
      kind: 'checkpoint-tail-read',
      checkpointSha: coordinate.checkpointSha,
    });
  });

  it('folds coordinate tail evidence after the prepared basis', async () => {
    const events = await openWorldlineWithOperatorBasis({
      worldlineName: 'events-coordinate-tail',
      seed: (patch) => {
        patch.addNode(NODE_ID);
        patch.setProperty(NODE_ID, PROPERTY_KEY, 'open');
      },
    });
    const basis = await events.prepareOpticBasis();
    await events.commit((patch) => {
      patch.setProperty(NODE_ID, PROPERTY_KEY, 'review');
    });

    const coordinate = await events.coordinate();
    const status = await coordinate.optic().node(NODE_ID).prop(PROPERTY_KEY).read();

    expect(coordinate.checkpointSha).toBe(basis.checkpointSha);
    expect(status).toMatchObject({
      nodeId: NODE_ID,
      key: PROPERTY_KEY,
      exists: true,
      value: 'review',
    });
    expect(status.readIdentity.tailWitnesses).toHaveLength(1);
  });

  it('keeps reads from one coordinate stable when the live worldline advances', async () => {
    const events = await openWorldlineWithOperatorBasis({
      worldlineName: 'events-coordinate-stability',
      onDeleteWithData: 'cascade',
      seed: (patch) => {
        patch.addNode(NODE_ID);
        patch.setProperty(NODE_ID, PROPERTY_KEY, 'open');
      },
    });
    await events.prepareOpticBasis();
    const before = await events.coordinate();

    const beforeNode = await before.optic().node(NODE_ID).read();

    await events.commit((patch) => {
      patch.setProperty(NODE_ID, PROPERTY_KEY, 'closed');
    });

    const beforeStatus = await before.optic().node(NODE_ID).prop(PROPERTY_KEY).read();
    const after = await events.coordinate();
    const afterStatus = await after.optic().node(NODE_ID).prop(PROPERTY_KEY).read();

    expect(beforeNode).toMatchObject({ nodeId: NODE_ID, alive: true });
    expect(beforeStatus).toMatchObject({
      nodeId: NODE_ID,
      key: PROPERTY_KEY,
      exists: true,
      value: 'open',
    });
    expect(after.frontierEntries).not.toEqual(before.frontierEntries);
    expect(afterStatus).toMatchObject({
      nodeId: NODE_ID,
      key: PROPERTY_KEY,
      exists: true,
      value: 'closed',
    });
    expect(beforeNode.readIdentity.checkpointSha).toBe(before.checkpointSha);
    expect(beforeStatus.readIdentity.checkpointSha).toBe(before.checkpointSha);
    expect(afterStatus.readIdentity.checkpointSha).toBe(after.checkpointSha);
  });

  it('reports absence for missing nodes and missing properties', async () => {
    const events = await openWorldlineWithOperatorBasis({
      worldlineName: 'events-coordinate-absence',
      seed: (patch) => {
        patch.addNode(NODE_ID);
        patch.setProperty(NODE_ID, PROPERTY_KEY, 'open');
      },
    });
    await events.prepareOpticBasis();
    const coordinate = await events.coordinate();

    const missingNode = await coordinate.optic().node(MISSING_NODE_ID).read();
    const missingProperty = await coordinate
      .optic()
      .node(NODE_ID)
      .prop(MISSING_PROPERTY_KEY)
      .read();

    expect(missingNode).toMatchObject({
      nodeId: MISSING_NODE_ID,
      alive: false,
    });
    expect(missingProperty).toMatchObject({
      nodeId: NODE_ID,
      key: MISSING_PROPERTY_KEY,
      exists: false,
      value: undefined,
    });
  });

  it('rejects blank node ids and property keys as schema-invalid optic targets', async () => {
    const events = await openWorldlineWithOperatorBasis({
      worldlineName: 'events-coordinate-blank-targets',
      seed: (patch) => {
        patch.addNode(NODE_ID);
        patch.setProperty(NODE_ID, PROPERTY_KEY, 'open');
      },
    });
    await events.prepareOpticBasis();
    const coordinate = await events.coordinate();

    await expect(async () => coordinate.optic().node('').read()).rejects.toMatchObject({
      code: 'E_OPTIC_FAILURE_SCHEMA',
      context: {
        field: 'nodeId',
      },
    });
    await expect(async () =>
      coordinate.optic().node(NODE_ID).prop('').read()
    ).rejects.toMatchObject({
      code: 'E_OPTIC_FAILURE_SCHEMA',
      context: {
        field: 'propertyKey',
      },
    });
  });

  it('fails closed when basis verification has no checkpoint-tail evidence', async () => {
    const events = await openWarpWorldline({
      persistence: new InMemoryGraphAdapter(),
      worldlineName: 'events-coordinate-no-checkpoint',
      writerId: 'app',
    });
    await events.commit((patch) => {
      patch.addNode(NODE_ID);
    });

    await expect(events.prepareOpticBasis()).rejects.toMatchObject({
      code: 'E_OPTIC_NO_BOUNDED_BASIS',
      context: {
        graphName: 'events-coordinate-no-checkpoint',
        reason: 'missing-checkpoint',
      },
    });
  });

  it('requires a prepared basis before capturing a coordinate', async () => {
    const events = await openWarpWorldline({
      persistence: new InMemoryGraphAdapter(),
      worldlineName: 'events-coordinate-no-basis',
      writerId: 'app',
    });

    await expect(events.coordinate()).rejects.toMatchObject({
      code: 'E_OPTIC_NO_BOUNDED_BASIS',
      context: {
        graphName: 'events-coordinate-no-basis',
        reason: 'missing-prepared-worldline-coordinate-basis',
      },
    });
  });
});
