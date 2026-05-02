import QueryError from '../../errors/QueryError.ts';
import type { VisibleStateScope } from '../../types/CoordinateComparison.ts';
import type {
  ComparisonCoordinateSideRead,
  ComparisonSideFinalizer,
} from './ComparisonCoordinateSideReadPort.ts';
import {
  finalizeSide,
  type ComparisonDigestHost,
  type ResolvedComparisonSide,
} from './ComparisonSelector.ts';

export default class HostBackedComparisonSideFinalizer implements ComparisonSideFinalizer {
  private readonly host: ComparisonDigestHost;

  constructor(host: ComparisonDigestHost) {
    if (host === null || host === undefined) {
      throw new QueryError('comparison side finalizer requires a host', {
        code: 'invalid_coordinate',
      });
    }
    this.host = host;
    Object.freeze(this);
  }

  async finalize(
    read: ComparisonCoordinateSideRead,
    scope: VisibleStateScope | null,
  ): Promise<ResolvedComparisonSide> {
    return await finalizeSide(this.host, read, scope);
  }
}
