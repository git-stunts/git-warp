import type NeighborhoodOpticReadResult from './NeighborhoodOpticReadResult.ts';
import type { NeighborhoodOpticReadOptions } from './NeighborhoodOptic.ts';
import type NodeOpticReadResult from './NodeOpticReadResult.ts';
import type NodePropertyOpticReadResult from './NodePropertyOpticReadResult.ts';
import type Optic from './Optic.ts';
import type TraversalOpticReadResult from './TraversalOpticReadResult.ts';
import type { TraversalOpticReadOptions } from './TraversalOptic.ts';

/**
 * Answers the four reads an executable optic makes, with the witnesses that
 * support each answer. The checkpoint-tail locator serves the compatibility
 * graph handles; the cone locator serves public Lane reads (#1039).
 */
export default abstract class OpticWitnessLocator {
  abstract readNode(_optic: Optic): Promise<NodeOpticReadResult>;

  abstract readNodeProperty(_optic: Optic): Promise<NodePropertyOpticReadResult>;

  abstract readNeighborhood(
    _optic: Optic,
    _options: NeighborhoodOpticReadOptions,
  ): Promise<NeighborhoodOpticReadResult>;

  abstract readTraversal(
    _optic: Optic,
    _options: TraversalOpticReadOptions,
  ): Promise<TraversalOpticReadResult>;
}
