import type { RuntimeHostProduct } from './warp/RuntimeHostProduct.ts';
import WarpWorldlineCoordinate from './WarpWorldlineCoordinate.ts';
import WarpError from './errors/WarpError.ts';

type DraftStorageGraph = Pick<
  RuntimeHostProduct,
  'createStrand' | 'getStrand' | 'worldline' | 'writerId'
>;

export async function createWorldlineDraft(
  graph: DraftStorageGraph,
  name: string,
  coordinate: WarpWorldlineCoordinate | undefined,
): Promise<void> {
  await graph.createStrand({
    strandId: name,
    owner: graph.writerId,
    ...(coordinate === undefined
      ? {}
      : {
          baseCheckpointSha: coordinate.checkpointSha,
          baseFrontier: coordinate.frontier(),
        }),
  });
}

export async function openWorldlineDraftCoordinate(
  graph: DraftStorageGraph,
  name: string,
): Promise<WarpWorldlineCoordinate> {
  const descriptor = await graph.getStrand(name);
  if (descriptor === null) {
    throw new WarpError(
      `Strand '${name}' is unavailable`,
      'E_WARP_WORLDLINE_STRAND_UNAVAILABLE',
      { context: { name } },
    );
  }
  const { baseObservation } = descriptor;
  const { checkpointSha } = baseObservation;
  if (checkpointSha === null || checkpointSha === undefined) {
    throw new WarpError(
      `Strand '${name}' has no persisted Runtime coordinate`,
      'E_WARP_WORLDLINE_STRAND_COORDINATE_UNAVAILABLE',
      { context: { name } },
    );
  }
  return new WarpWorldlineCoordinate({
    worldlineName: descriptor.graphName,
    checkpointSha,
    frontier: new Map(Object.entries(baseObservation.frontier)),
    createWorldline: (options) => graph.worldline(options),
  });
}
