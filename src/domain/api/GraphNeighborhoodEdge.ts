import WarpError from '../errors/WarpError.ts';
import type { ReadingValue } from './ReadingValue.ts';
import { registerReadingDomainObject } from './ReadingValueRuntime.ts';

export type GraphNeighborhoodEdgeOptions = Readonly<{
  readonly direction: 'out' | 'in';
  readonly neighborId: string;
  readonly label: string;
}>;

export default class GraphNeighborhoodEdge {
  readonly [key: string]: ReadingValue;
  readonly direction: 'out' | 'in';
  readonly neighborId: string;
  readonly label: string;

  constructor(options: GraphNeighborhoodEdgeOptions | null | undefined) {
    const fields = requireGraphNeighborhoodEdgeOptions(options);
    this.direction = requireEdgeDirection(fields.direction);
    this.neighborId = requireEdgeString(fields.neighborId, 'neighborId', 'E_CHART_EDGE_NEIGHBOR');
    this.label = requireEdgeString(fields.label, 'label', 'E_CHART_EDGE_LABEL');
    Object.freeze(this);
    registerReadingDomainObject(this);
  }
}

function requireGraphNeighborhoodEdgeOptions(
  options: GraphNeighborhoodEdgeOptions | null | undefined
): GraphNeighborhoodEdgeOptions {
  if (options === null || options === undefined) {
    throw new WarpError('GraphNeighborhoodEdge options are required', 'E_CHART_EDGE_OPTIONS');
  }
  return options;
}

function requireEdgeDirection(direction: 'out' | 'in'): 'out' | 'in' {
  if (direction !== 'out' && direction !== 'in') {
    throw new WarpError('GraphNeighborhoodEdge direction is invalid', 'E_CHART_EDGE_DIRECTION');
  }
  return direction;
}

function requireEdgeString(value: string, field: string, code: string): string {
  if (typeof value !== 'string') {
    throw new WarpError(`GraphNeighborhoodEdge ${field} is invalid`, code);
  }
  return value;
}
