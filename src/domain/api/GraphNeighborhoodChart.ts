import WarpError from '../errors/WarpError.ts';
import type { ReadingDirection } from './Reading.ts';
import type { ReadingValue } from './ReadingValue.ts';
import { registerReadingDomainObject } from './ReadingValueRuntime.ts';
import GraphNeighborhoodEdge from './GraphNeighborhoodEdge.ts';

export type GraphNeighborhoodChartOptions = Readonly<{
  readonly subject: string;
  readonly direction: ReadingDirection;
  readonly edges: readonly GraphNeighborhoodEdge[];
  readonly completeness: 'complete' | 'truncated';
  readonly cursor: string | null;
}>;

export default class GraphNeighborhoodChart {
  readonly [key: string]: ReadingValue;
  readonly subject: string;
  readonly direction: ReadingDirection;
  readonly edges: readonly GraphNeighborhoodEdge[];
  readonly completeness: 'complete' | 'truncated';
  readonly cursor: string | null;

  constructor(options: GraphNeighborhoodChartOptions | null | undefined) {
    const fields = requireGraphNeighborhoodChartOptions(options);
    this.subject = requireChartSubject(fields.subject);
    this.direction = requireChartDirection(fields.direction);
    this.edges = requireChartEdges(fields.edges);
    this.completeness = requireChartCompleteness(fields.completeness);
    this.cursor = requireChartCursor(fields.cursor);
    Object.freeze(this);
    registerReadingDomainObject(this);
  }
}

function requireGraphNeighborhoodChartOptions(
  options: GraphNeighborhoodChartOptions | null | undefined
): GraphNeighborhoodChartOptions {
  if (options === null || options === undefined) {
    throw new WarpError('GraphNeighborhoodChart options are required', 'E_CHART_VALUE_OPTIONS');
  }
  return options;
}

function requireChartSubject(subject: string): string {
  if (typeof subject !== 'string') {
    throw new WarpError('GraphNeighborhoodChart subject is invalid', 'E_CHART_VALUE_SUBJECT');
  }
  return subject;
}

function requireChartDirection(direction: ReadingDirection): ReadingDirection {
  if (direction !== 'out' && direction !== 'in' && direction !== 'both') {
    throw new WarpError('GraphNeighborhoodChart direction is invalid', 'E_CHART_VALUE_DIRECTION');
  }
  return direction;
}

function requireChartEdges(
  edges: readonly GraphNeighborhoodEdge[]
): readonly GraphNeighborhoodEdge[] {
  if (!Array.isArray(edges) || !edges.every((edge) => edge instanceof GraphNeighborhoodEdge)) {
    throw new WarpError('GraphNeighborhoodChart edges are invalid', 'E_CHART_VALUE_EDGES');
  }
  return Object.freeze([...edges]);
}

function requireChartCompleteness(
  completeness: 'complete' | 'truncated'
): 'complete' | 'truncated' {
  if (completeness !== 'complete' && completeness !== 'truncated') {
    throw new WarpError(
      'GraphNeighborhoodChart completeness is invalid',
      'E_CHART_VALUE_COMPLETENESS'
    );
  }
  return completeness;
}

function requireChartCursor(cursor: string | null): string | null {
  if (cursor !== null && typeof cursor !== 'string') {
    throw new WarpError('GraphNeighborhoodChart cursor is invalid', 'E_CHART_VALUE_CURSOR');
  }
  return cursor;
}
