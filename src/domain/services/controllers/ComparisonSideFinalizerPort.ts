import type { VisibleStateScope } from '../../types/CoordinateComparison.ts';
import type {
  ComparisonCoordinateSideRead,
} from './ComparisonCoordinateSideReadPort.ts';
import type {
  ResolvedComparisonSide,
} from './ComparisonSelector.ts';

export default interface ComparisonSideFinalizer {
  finalize(
    read: ComparisonCoordinateSideRead,
    scope: VisibleStateScope | null,
  ): Promise<ResolvedComparisonSide>;
}
