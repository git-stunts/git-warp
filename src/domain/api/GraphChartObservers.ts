import type Observer from './Observer.ts';
import { createObserver } from './ObserverRuntime.ts';
import LegacyReading, { type NeighborhoodReadingFields, type ReadingDirection } from './Reading.ts';
import type { ReadingValue } from './ObservedReading.ts';
import WarpError from '../errors/WarpError.ts';
import GraphNeighborhoodChart from './GraphNeighborhoodChart.ts';
import GraphNeighborhoodEdge from './GraphNeighborhoodEdge.ts';

export type GraphNeighborhoodOptions = {
  readonly around: string;
  readonly direction?: ReadingDirection;
  readonly labels?: readonly string[];
  readonly limit?: number;
  readonly cursor?: string;
};

export type GraphChartObservers = Readonly<{
  neighborhood(options: GraphNeighborhoodOptions): Observer<GraphNeighborhoodChart>;
}>;

/** Bounded, graph-shaped derived observers. */
export const graph: GraphChartObservers = Object.freeze({
  neighborhood(options: GraphNeighborhoodOptions): Observer<GraphNeighborhoodChart> {
    return createObserver<GraphNeighborhoodChart>(
      'charts.graph.neighborhood',
      neighborhoodReading(options),
      decodeNeighborhoodChart
    );
  },
});

function neighborhoodReading(options: GraphNeighborhoodOptions): LegacyReading {
  if (options === null || options === undefined) {
    throw chartError('graph.neighborhood options are required', 'E_CHART_OPTIONS');
  }
  const { around: subject, ...settings } = options;
  const fields: NeighborhoodReadingFields = { subject, ...settings };
  return LegacyReading.neighborhood(fields);
}

function decodeNeighborhoodChart(value: ReadingValue): GraphNeighborhoodChart {
  const {
    subject: rawSubject,
    direction: rawDirection,
    edges: rawEdges,
    completeness: rawCompleteness,
    cursor: rawCursor,
  } = requireRecord(value, 'chart value');
  const subject = requireString(rawSubject, 'chart subject');
  const direction = requireReadingDirection(rawDirection);
  const edges = requireArray(rawEdges, 'chart edges').map(decodeNeighborhoodEdge);
  const completeness = requireCompleteness(rawCompleteness);
  const cursor = requireNullableString(rawCursor, 'chart cursor');
  return new GraphNeighborhoodChart({
    subject,
    direction,
    edges,
    completeness,
    cursor,
  });
}

function decodeNeighborhoodEdge(value: ReadingValue): GraphNeighborhoodEdge {
  const {
    direction: rawDirection,
    neighborId: rawNeighborId,
    label: rawLabel,
  } = requireRecord(value, 'chart edge');
  const direction = requireEdgeDirection(rawDirection);
  const neighborId = requireString(rawNeighborId, 'chart edge neighborId');
  const label = requireString(rawLabel, 'chart edge label');
  return new GraphNeighborhoodEdge({
    direction,
    neighborId,
    label,
  });
}

function requireRecord(
  value: ReadingValue | undefined,
  field: string
): Readonly<Record<string, ReadingValue>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw chartError(`graph.neighborhood received an invalid ${field}`, 'E_CHART_VALUE');
  }
  return value as Readonly<Record<string, ReadingValue>>;
}

function requireArray(value: ReadingValue | undefined, field: string): readonly ReadingValue[] {
  if (!Array.isArray(value)) {
    throw chartError(`graph.neighborhood received invalid ${field}`, 'E_CHART_VALUE');
  }
  return value as readonly ReadingValue[];
}

function requireString(value: ReadingValue | undefined, field: string): string {
  if (typeof value !== 'string') {
    throw chartError(`graph.neighborhood received invalid ${field}`, 'E_CHART_VALUE');
  }
  return value;
}

function requireNullableString(value: ReadingValue | undefined, field: string): string | null {
  if (value !== null && typeof value !== 'string') {
    throw chartError(`graph.neighborhood received invalid ${field}`, 'E_CHART_VALUE');
  }
  return value;
}

function requireReadingDirection(value: ReadingValue | undefined): ReadingDirection {
  if (value !== 'out' && value !== 'in' && value !== 'both') {
    throw chartError('graph.neighborhood received invalid chart direction', 'E_CHART_VALUE');
  }
  return value;
}

function requireEdgeDirection(value: ReadingValue | undefined): 'out' | 'in' {
  if (value !== 'out' && value !== 'in') {
    throw chartError('graph.neighborhood received an invalid chart edge', 'E_CHART_VALUE');
  }
  return value;
}

function requireCompleteness(value: ReadingValue | undefined): 'complete' | 'truncated' {
  if (value !== 'complete' && value !== 'truncated') {
    throw chartError('graph.neighborhood received invalid chart completeness', 'E_CHART_VALUE');
  }
  return value;
}

function chartError(message: string, code: string): WarpError {
  return new WarpError(message, code);
}
