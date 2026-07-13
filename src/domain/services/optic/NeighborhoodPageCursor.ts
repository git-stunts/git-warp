import QueryError from '../../errors/QueryError.ts';
import type { Direction } from '../../../ports/NeighborProviderPort.ts';

export const DEFAULT_NEIGHBORHOOD_PAGE_SIZE = 100;
export const MAX_NEIGHBORHOOD_PAGE_SIZE = 1_000;

const CURSOR_PREFIX = 'warp-neighborhood-v1:';

export type NeighborhoodCursorScope = {
  readonly checkpointSha: string;
  readonly nodeId: string;
  readonly direction: Direction;
  readonly labels: readonly string[];
};

export type NeighborhoodCandidatePosition = {
  readonly direction: 'in' | 'out';
  readonly globalId: number;
  readonly label: string;
};

export function neighborhoodCursorScope(
  checkpointSha: string,
  options: {
    readonly nodeId: string;
    readonly direction: Direction;
    readonly labels: readonly string[];
  },
): NeighborhoodCursorScope {
  return Object.freeze({
    checkpointSha,
    nodeId: options.nodeId,
    direction: options.direction,
    labels: Object.freeze([...options.labels]),
  });
}

export function encodeNeighborhoodCursor(
  scope: NeighborhoodCursorScope,
  after: NeighborhoodCandidatePosition,
): string {
  return CURSOR_PREFIX + [
    encodeURIComponent(scope.checkpointSha),
    encodeURIComponent(scope.nodeId),
    scope.direction,
    scope.labels.map((label) => encodeURIComponent(label)).join(','),
    after.direction,
    String(after.globalId),
    encodeURIComponent(after.label),
  ].join('|');
}

export function parseNeighborhoodCursor(
  raw: string | null,
  scope: NeighborhoodCursorScope,
): NeighborhoodCandidatePosition | null {
  if (raw === null || raw.length === 0) {
    return null;
  }
  try {
    return decodeCursorParts(requireCursorParts(raw), scope);
  } catch (error) {
    if (error instanceof QueryError) {
      throw error;
    }
    throw invalidCursorError();
  }
}

export function parseNeighborhoodLimit(limit: number | null): number {
  const resolved = limit ?? DEFAULT_NEIGHBORHOOD_PAGE_SIZE;
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > MAX_NEIGHBORHOOD_PAGE_SIZE) {
    throw new QueryError(`Neighborhood optic limit must be between 1 and ${MAX_NEIGHBORHOOD_PAGE_SIZE}.`, {
      code: 'E_OPTIC_NEIGHBORHOOD_OPTIONS',
      context: { field: 'limit', max: MAX_NEIGHBORHOOD_PAGE_SIZE },
    });
  }
  return resolved;
}

function requireCursorParts(raw: string): readonly string[] {
  if (!raw.startsWith(CURSOR_PREFIX)) {
    throw invalidCursorError();
  }
  const parts = raw.slice(CURSOR_PREFIX.length).split('|');
  if (parts.length !== 7) {
    throw invalidCursorError();
  }
  return parts;
}

function decodeCursorParts(
  parts: readonly string[],
  scope: NeighborhoodCursorScope,
): NeighborhoodCandidatePosition {
  const decodedScope = decodeCursorScope(parts);
  if (!cursorScopeMatches(decodedScope, scope)) {
    throw invalidCursorError();
  }
  return decodeCursorPosition(parts);
}

function decodeCursorScope(parts: readonly string[]): Omit<NeighborhoodCursorScope, 'labels'> & {
  readonly labels: readonly string[];
} {
  return {
    checkpointSha: decodeURIComponent(parts[0]!),
    nodeId: decodeURIComponent(parts[1]!),
    direction: parseDirection(parts[2]!),
    labels: decodeLabels(parts[3]!),
  };
}

function cursorScopeMatches(
  decoded: NeighborhoodCursorScope,
  expected: NeighborhoodCursorScope,
): boolean {
  return decoded.checkpointSha === expected.checkpointSha
    && decoded.nodeId === expected.nodeId
    && decoded.direction === expected.direction
    && sameLabels(decoded.labels, expected.labels);
}

function decodeCursorPosition(parts: readonly string[]): NeighborhoodCandidatePosition {
  return Object.freeze({
    direction: parseConcreteDirection(parts[4]!),
    globalId: parseGlobalId(parts[5]!),
    label: decodeURIComponent(parts[6]!),
  });
}

function decodeLabels(value: string): readonly string[] {
  return value.length === 0
    ? Object.freeze([])
    : Object.freeze(value.split(',').map((label) => decodeURIComponent(label)));
}

function sameLabels(value: readonly string[], expected: readonly string[]): boolean {
  return value.length === expected.length
    && value.every((label, index) => label === expected[index]);
}

function parseDirection(value: string): Direction {
  if (value === 'in' || value === 'out' || value === 'both') {
    return value;
  }
  throw invalidCursorError();
}

function parseConcreteDirection(value: string): 'in' | 'out' {
  if (value === 'in' || value === 'out') {
    return value;
  }
  throw invalidCursorError();
}

function parseGlobalId(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 0xffff_ffff || String(parsed) !== value) {
    throw invalidCursorError();
  }
  return parsed;
}

function invalidCursorError(): QueryError {
  return new QueryError('Neighborhood optic cursor is invalid, stale, or belongs to another reading.', {
    code: 'E_OPTIC_NEIGHBORHOOD_OPTIONS',
    context: { field: 'cursor' },
  });
}
