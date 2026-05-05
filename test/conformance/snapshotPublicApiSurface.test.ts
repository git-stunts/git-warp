import { describe, expect, it } from 'vitest';
import {
  WarpCore,
  ImmutableBytes,
  SnapshotORSet,
  SnapshotVersionVector,
  SnapshotWarpState,
  type SnapshotPropValue,
} from '../../index.ts';

type PublicPropBag = Readonly<{ [key: string]: SnapshotPropValue }>;
type PublicVisibleEdge = {
  from: string;
  to: string;
  label: string;
  props: PublicPropBag;
};

async function assertSnapshotPublicApiSurface(graph: WarpCore): Promise<void> {
  const materialized: SnapshotWarpState = await graph.materialize();
  const withReceipts: { state: SnapshotWarpState } = await graph.materialize({ receipts: true });
  const stateSnapshot: SnapshotWarpState | null = await graph.getStateSnapshot();
  const nodeProps: PublicPropBag | null = await graph.getNodeProps('node-a');
  const edgeProps: PublicPropBag | null = await graph.getEdgeProps('node-a', 'node-b', 'knows');
  const edges: PublicVisibleEdge[] = await graph.getEdges();
  const nodeAlive: SnapshotORSet = materialized.nodeAlive;
  const frontier: SnapshotVersionVector = materialized.observedFrontier;
  const snapshotValue: SnapshotPropValue = new ImmutableBytes(new Uint8Array([1, 2, 3]));

  void withReceipts;
  void stateSnapshot;
  void nodeProps;
  void edgeProps;
  void edges;
  void nodeAlive;
  void frontier;
  void snapshotValue;
}

describe('snapshot public API surface', () => {
  it('exports runtime snapshot classes from the package root', () => {
    expect(ImmutableBytes).toBeTypeOf('function');
    expect(SnapshotORSet).toBeTypeOf('function');
    expect(SnapshotVersionVector).toBeTypeOf('function');
    expect(SnapshotWarpState).toBeTypeOf('function');
  });

  it('keeps public snapshot return types nameable from the package root', () => {
    void assertSnapshotPublicApiSurface;
  });
});
