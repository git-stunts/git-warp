import QueryError from '../../errors/QueryError.ts';
import type { Direction } from '../../../ports/NeighborProviderPort.ts';
import type { NeighborhoodOpticReadDirection } from './NeighborhoodOpticReadResult.ts';

const CURSOR_PREFIX = 'git-warp:cone-neighborhood-cursor:1:';
const CURSOR_PART_COUNT = 6;

/** What a cone neighbourhood cursor is scoped to: one node, direction and label filter. */
export type ConeNeighborhoodCursorScope = {
  readonly nodeId: string;
  readonly direction: Direction;
  readonly labels: readonly string[];
};

/**
 * A position in a cone neighbourhood's canonical edge order (direction, then
 * neighbour id, then label). The order does not depend on the basis, so a
 * cursor stays meaningful while the lane advances: it resumes after the last
 * edge it returned, among the edges visible at the next read's basis.
 */
export default class ConeNeighborhoodCursor {
  readonly direction: NeighborhoodOpticReadDirection;
  readonly neighborId: string;
  readonly label: string;

  constructor(position: { readonly direction: NeighborhoodOpticReadDirection; readonly neighborId: string; readonly label: string }) {
    this.direction = position.direction;
    this.neighborId = position.neighborId;
    this.label = position.label;
    Object.freeze(this);
  }

  /** The cursor encoded in `raw`, or null for a first page; refuses another reading's cursor. */
  static parse(raw: string | undefined, scope: ConeNeighborhoodCursorScope): ConeNeighborhoodCursor | null {
    if (raw === undefined || raw.length === 0) {
      return null;
    }
    const parts = cursorParts(raw);
    if (!sameScope(parts, scope)) {
      throw invalidCursorError();
    }
    return new ConeNeighborhoodCursor({
      direction: concreteDirection(parts[3]),
      neighborId: decodePart(parts[4]),
      label: decodePart(parts[5]),
    });
  }

  encode(scope: ConeNeighborhoodCursorScope): string {
    return CURSOR_PREFIX + [
      encodeURIComponent(scope.nodeId),
      scope.direction,
      scope.labels.map((label) => encodeURIComponent(label)).join(','),
      this.direction,
      encodeURIComponent(this.neighborId),
      encodeURIComponent(this.label),
    ].join('|');
  }
}

function cursorParts(raw: string): readonly string[] {
  const parts = raw.startsWith(CURSOR_PREFIX) ? raw.slice(CURSOR_PREFIX.length).split('|') : [];
  if (parts.length !== CURSOR_PART_COUNT) {
    throw invalidCursorError();
  }
  return parts;
}

function sameScope(parts: readonly string[], scope: ConeNeighborhoodCursorScope): boolean {
  return parts[0] === encodeURIComponent(scope.nodeId)
    && parts[1] === scope.direction
    && parts[2] === scope.labels.map((label) => encodeURIComponent(label)).join(',');
}

/** Decodes one validated cursor part; `cursorParts` has already checked the part count. */
function decodePart(value: string | undefined): string {
  try {
    return decodeURIComponent(String(value));
  } catch {
    throw invalidCursorError();
  }
}

function concreteDirection(value: string | undefined): NeighborhoodOpticReadDirection {
  if (value === 'in' || value === 'out') {
    return value;
  }
  throw invalidCursorError();
}

function invalidCursorError(): QueryError {
  return new QueryError('Neighborhood optic cursor is invalid or belongs to another reading.', {
    code: 'E_OPTIC_NEIGHBORHOOD_OPTIONS',
    context: { field: 'cursor' },
  });
}
