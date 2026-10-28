import WarpError from './errors/WarpError.ts';
import type { openRuntimeHostProduct } from './warp/RuntimeHostProduct.ts';
import WorldlineOptic from './services/optic/WorldlineOptic.ts';
import CoordinateCheckpointTailOpticSource from './services/optic/CoordinateCheckpointTailOpticSource.ts';
import type { WarpStrandOpticBasis } from './WarpStrandOpticBasis.ts';

type RuntimeGraph = Awaited<ReturnType<typeof openRuntimeHostProduct>>;

/** Prepares the bounded checkpoint-tail optic a strand Lane reads through. */
export default async function prepareStrandOpticBasis(
  graph: RuntimeGraph,
  name: string,
  checkpointSha: string,
): Promise<WarpStrandOpticBasis> {
  const descriptor = await graph.getStrand(name);
  if (descriptor === null) {
    throw new WarpError(
      `Strand '${name}' is unavailable`,
      'E_WARP_WORLDLINE_STRAND_UNAVAILABLE',
      { context: { name } },
    );
  }
  // A strand overlay already has its own writer identity. Adding its pinned
  // head to the captured parent frontier lets the checkpoint-tail optic scan
  // it as one more bounded writer tail, without materializing the graph.
  const frontier = strandFrontier(descriptor);
  return Object.freeze({
    checkpointSha,
    frontierEntries: freezeFrontierEntries(frontier),
    optic: new WorldlineOptic({
      source: new CoordinateCheckpointTailOpticSource({
        source: graph,
        checkpointSha,
        frontier,
      }),
    }),
  });
}

function strandFrontier(
  descriptor: NonNullable<Awaited<ReturnType<RuntimeGraph['getStrand']>>>,
): Map<string, string> {
  const frontier = new Map(Object.entries(descriptor.baseObservation.frontier));
  for (const chain of descriptor.writers) {
    addOverlayHead(frontier, chain);
  }
  for (const overlay of descriptor.braid.readOverlays) {
    addOverlayHead(frontier, overlay);
  }
  return frontier;
}

function addOverlayHead(
  frontier: Map<string, string>,
  overlay: { readonly overlayId: string; readonly headPatchSha: string | null },
): void {
  if (overlay.headPatchSha !== null) {
    frontier.set(overlay.overlayId, overlay.headPatchSha);
  }
}

function freezeFrontierEntries(frontier: Map<string, string>) {
  return Object.freeze(
    [...frontier.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([writerId, patchSha]) => Object.freeze({ writerId, patchSha })),
  );
}
