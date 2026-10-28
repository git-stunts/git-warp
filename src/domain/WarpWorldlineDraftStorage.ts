import type { RuntimeHostProduct } from './warp/RuntimeHostProduct.ts';
import type WarpWorldlineCoordinate from './WarpWorldlineCoordinate.ts';
import { coordinateConeBasis } from './WarpWorldlineConeOptics.ts';

type DraftStorageGraph = Pick<RuntimeHostProduct, 'createStrand' | 'writerId'>;

/**
 * Creates a strand forked at `coordinate` (#1039): its base frontier is the
 * coordinate's frontier, and the lane cone basis the coordinate captured is
 * pinned as the strand's base, so the strand reads its base without a
 * checkpoint or a materialization.
 */
export async function createWorldlineDraft(
  graph: DraftStorageGraph,
  name: string,
  coordinate: WarpWorldlineCoordinate,
): Promise<void> {
  await graph.createStrand({
    strandId: name,
    owner: graph.writerId,
    baseFrontier: coordinate.frontier(),
    baseBasis: coordinateConeBasis(coordinate),
  });
}
