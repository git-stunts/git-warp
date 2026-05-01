import ImmutableBytes from '../snapshot/ImmutableBytes.ts';
import type { SnapshotPropValue } from '../snapshot/SnapshotPropValue.ts';
import type { AggregateSpec } from './QueryPlan.ts';
import type { QueryPropertyBag } from './QueryReadModelProvider.ts';

type PropsFetcher = (nodeId: string) => Promise<QueryPropertyBag>;
type SnapshotPropObject = { readonly [key: string]: SnapshotPropValue };
type NumericAggregateKey = 'sum' | 'avg' | 'min' | 'max';

type AggregateAccumulator = {
  segments: string[];
  values: number[];
};

export type AggregateResult = {
  stateHash: string;
  count?: number;
  sum?: number;
  avg?: number;
  min?: number;
  max?: number;
};

function isSnapshotPropObject(value: SnapshotPropValue | undefined): value is SnapshotPropObject {
  return value !== undefined &&
    value !== null &&
    typeof value === 'object' &&
    !(value instanceof ImmutableBytes) &&
    !Array.isArray(value);
}

function resolvePropertyPath(
  obj: QueryPropertyBag,
  segments: readonly string[],
): SnapshotPropValue | undefined {
  const first = segments[0];
  if (first === undefined) {
    return undefined;
  }

  let value = obj[first];
  for (let i = 1; i < segments.length; i++) {
    if (!isSnapshotPropObject(value)) {
      return undefined;
    }
    const segment = segments[i];
    if (segment === undefined) {
      return undefined;
    }
    value = value[segment];
  }
  return value;
}

function computeSingleAggregate(key: string, values: readonly number[]): number {
  if (values.length === 0) { return 0; }
  if (key === 'sum') { return values.reduce((a, b) => a + b, 0); }
  if (key === 'avg') { return values.reduce((a, b) => a + b, 0) / values.length; }
  if (key === 'min') { return Math.min(...values); }
  return Math.max(...values);
}

const NUMERIC_AGGREGATE_KEYS: readonly NumericAggregateKey[] = ['sum', 'avg', 'min', 'max'];

function activeAggregateKeys(spec: AggregateSpec): NumericAggregateKey[] {
  return NUMERIC_AGGREGATE_KEYS.filter((key) => spec[key] !== undefined && spec[key] !== null);
}

function buildAggMap(
  activeAggs: readonly NumericAggregateKey[],
  spec: AggregateSpec,
): Map<NumericAggregateKey, AggregateAccumulator> {
  const aggMap = new Map<NumericAggregateKey, AggregateAccumulator>();
  for (const key of activeAggs) {
    const path = spec[key];
    if (path === undefined) {
      continue;
    }
    aggMap.set(key, {
      segments: path.replace(/^props\./, '').split('.'),
      values: [],
    });
  }
  return aggMap;
}

function collectAggValues(
  propsList: readonly QueryPropertyBag[],
  aggMap: Map<NumericAggregateKey, AggregateAccumulator>,
): void {
  for (const propsRecord of propsList) {
    for (const { segments, values } of aggMap.values()) {
      const value = resolvePropertyPath(propsRecord, segments);
      if (typeof value === 'number' && !Number.isNaN(value)) {
        values.push(value);
      }
    }
  }
}

async function collectProps(
  strand: readonly string[],
  getProps: PropsFetcher,
): Promise<QueryPropertyBag[]> {
  const props: QueryPropertyBag[] = [];
  for (const nodeId of strand) {
    props.push(await getProps(nodeId));
  }
  return props;
}

async function computeNumericAggregates(params: {
  strand: readonly string[];
  getProps: PropsFetcher;
  activeAggs: readonly NumericAggregateKey[];
  spec: AggregateSpec;
  result: AggregateResult;
}): Promise<AggregateResult> {
  const aggMap = buildAggMap(params.activeAggs, params.spec);
  const propsList = await collectProps(params.strand, params.getProps);
  collectAggValues(propsList, aggMap);

  for (const [key, { values }] of aggMap) {
    params.result[key] = computeSingleAggregate(key, values);
  }
  return params.result;
}

export async function runAggregate(params: {
  strand: readonly string[];
  stateHash: string;
  getProps: PropsFetcher;
  spec: AggregateSpec;
}): Promise<AggregateResult> {
  const result: AggregateResult = { stateHash: params.stateHash };

  if (params.spec.count === true) {
    result.count = params.strand.length;
  }

  const activeAggs = activeAggregateKeys(params.spec);
  if (activeAggs.length === 0) {
    return result;
  }

  return await computeNumericAggregates({
    strand: params.strand,
    getProps: params.getProps,
    activeAggs,
    spec: params.spec,
    result,
  });
}
