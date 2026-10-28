import type { Direction } from '../../../ports/NeighborProviderPort.ts';
import QueryError from '../../errors/QueryError.ts';
import type Optic from './Optic.ts';
import type { TraversalOpticReadOptions } from './TraversalOptic.ts';

/** Preconditions every optic locator applies before it reads. */

export function normalizeDirection(direction: Direction | undefined): Direction {
  if (direction === undefined) {
    return 'out';
  }
  if (direction === 'in' || direction === 'out' || direction === 'both') {
    return direction;
  }
  throw new QueryError('Neighborhood optic requires a valid direction.', {
    code: 'E_OPTIC_NEIGHBORHOOD_OPTIONS',
    context: { field: 'direction' },
  });
}

export function requireExecutableTraversalSupport(
  optic: Optic,
  options: TraversalOpticReadOptions,
): void {
  if (optic.supportRule.isTraversalWindow()) {
    return;
  }

  if (hasTraversalWindowOptions(options)) {
    throw new QueryError('Traversal optic support rule refuses bounded traversal execution.', {
      code: 'E_OPTIC_SCHEMA',
      context: {
        field: 'supportRule',
        supportRule: optic.supportRule.toString(),
        reason: 'requires-global-scan',
      },
    });
  }

  throw new QueryError('Traversal optic requires explicit bounded traversal limits.', {
    code: 'E_OPTIC_TRAVERSAL_UNBOUNDED',
    context: { field: 'supportRule', reason: 'requires-global-scan' },
  });
}

function hasTraversalWindowOptions(options: TraversalOpticReadOptions): boolean {
  return (
    options.maxDepth !== undefined
    && options.maxNodes !== undefined
    && options.maxEdges !== undefined
  );
}

export function normalizeLabels(labels: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(labels)].sort());
}
