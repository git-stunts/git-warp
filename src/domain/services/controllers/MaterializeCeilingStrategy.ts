import type {
  MaterializeCeilingOptions,
  MaterializeStrategyRuntime,
} from './MaterializeStrategyRuntime.ts';
import type { MaterializeResult } from './MaterializeController.ts';
import MaterializeCoordinateStrategy from './MaterializeCoordinateStrategy.ts';

export default class MaterializeCeilingStrategy {
  private readonly runtime: MaterializeStrategyRuntime;
  private readonly coordinateStrategy: MaterializeCoordinateStrategy;

  constructor(
    runtime: MaterializeStrategyRuntime,
    coordinateStrategy: MaterializeCoordinateStrategy,
  ) {
    this.runtime = runtime;
    this.coordinateStrategy = coordinateStrategy;
  }

  async materialize(opts: MaterializeCeilingOptions): Promise<MaterializeResult> {
    const frontier = await this.runtime.deps.patches.getFrontier();
    return await this.coordinateStrategy.materialize({
      frontier,
      ceiling: opts.ceiling,
      receipts: opts.receipts,
    });
  }
}
