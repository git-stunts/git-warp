import NeighborhoodOptic from './NeighborhoodOptic.ts';
import NodeOptic from './NodeOptic.ts';
import Optic, { type OpticPostureFields } from './Optic.ts';
import type OpticWitnessLocator from './OpticWitnessLocator.ts';
import OpticSupportRule from './OpticSupportRule.ts';
import TraversalOptic from './TraversalOptic.ts';

/**
 * The node, neighbourhood and traversal optics of one witness locator under
 * one posture. `WorldlineOptic` binds a cone basis for public reads;
 * `CheckpointTailOptic` binds a checkpoint tail for maintenance reads.
 */
export default abstract class LocatedOptic {
  readonly #locator: OpticWitnessLocator;
  readonly #posture: OpticPostureFields;

  protected constructor(locator: OpticWitnessLocator, posture: OpticPostureFields) {
    this.#locator = locator;
    this.#posture = Object.freeze({ ...posture });
  }

  node(nodeId: string): NodeOptic {
    return new NodeOptic({
      optic: Optic.node({ ...this.#posture, nodeId }),
      locator: this.#locator,
    });
  }

  neighborhood(nodeId: string): NeighborhoodOptic {
    return new NeighborhoodOptic({
      optic: Optic.neighborhood({ ...this.#posture, nodeId }),
      locator: this.#locator,
    });
  }

  traversal(startNodeId: string): TraversalOptic {
    return new TraversalOptic({
      optic: Optic.traversal({
        ...this.#posture,
        startNodeId,
        supportRule: OpticSupportRule.globalDiscoveryRefused(),
      }),
      locator: this.#locator,
    });
  }
}
