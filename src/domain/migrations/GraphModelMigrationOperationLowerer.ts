import DryRunGraphModelMigrationPlan from './DryRunGraphModelMigrationPlan.ts';
import GraphModelMigrationLoweredOperation from './GraphModelMigrationLoweredOperation.ts';
import GraphModelMigrationLoweredPatchPlan from './GraphModelMigrationLoweredPatchPlan.ts';
import GraphModelMigrationOperationLoweringResult from './GraphModelMigrationOperationLoweringResult.ts';
import WarpError from '../errors/WarpError.ts';

/** Pure lowering service from dry-run facts to scratch-writer input values. */
export default class GraphModelMigrationOperationLowerer {
  /** Lowers a dry-run migration plan without reading or writing graph history. */
  lower(plan: DryRunGraphModelMigrationPlan): GraphModelMigrationOperationLoweringResult {
    const checkedPlan = requirePlan(plan);
    if (checkedPlan.hasFatalErrors()) {
      return new GraphModelMigrationOperationLoweringResult({
        patchPlan: null,
        warnings: checkedPlan.warnings,
        fatalErrors: checkedPlan.fatalErrors,
      });
    }
    const { manifest } = checkedPlan;
    if (manifest === null) {
      throw new WarpError('successful dry-run plan must contain a manifest', 'E_VALIDATION');
    }
    return new GraphModelMigrationOperationLoweringResult({
      patchPlan: new GraphModelMigrationLoweredPatchPlan({
        sourceBasis: manifest.sourceBasis,
        targetBasis: manifest.targetBasis,
        operations: checkedPlan.plannedOperations
          .map((operation) => GraphModelMigrationLoweredOperation.fromPlanned(operation)),
      }),
      warnings: checkedPlan.warnings,
      fatalErrors: [],
    });
  }
}

function requirePlan(plan: DryRunGraphModelMigrationPlan): DryRunGraphModelMigrationPlan {
  if (!(plan instanceof DryRunGraphModelMigrationPlan)) {
    throw new WarpError('plan must be a DryRunGraphModelMigrationPlan', 'E_VALIDATION');
  }
  return plan;
}
