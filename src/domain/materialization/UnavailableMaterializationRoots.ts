import MaterializationRoot from './MaterializationRoot.ts';
import MaterializationRoots from './MaterializationRoots.ts';

/** Whole materialization descriptor with no derived roots retained yet. */
export function unavailableMaterializationRoots(): MaterializationRoots {
  const unavailable = () => MaterializationRoot.unavailable();
  return new MaterializationRoots({
    adjacency: unavailable(),
    edgeAlive: unavailable(),
    edgeBirths: unavailable(),
    frontier: unavailable(),
    nodeAlive: unavailable(),
    properties: unavailable(),
    provenanceSupport: unavailable(),
    replayBasis: unavailable(),
    roaringIndexes: unavailable(),
  });
}
