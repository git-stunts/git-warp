import LiveSelector from '../../types/LiveSelector.ts';
import CoordinateSelector from '../../types/CoordinateSelector.ts';
import StrandSelector from '../../types/StrandSelector.ts';
import WorldlineSelector from '../../types/WorldlineSelector.ts';
import QueryError from '../../errors/QueryError.ts';
import ObserverBasis from './ObserverBasis.ts';
import type { ObserverConfig, WorldlineSource } from '../../capabilities/QueryCapability.ts';

export type ObserverPlanFields = {
  readonly name: string;
  readonly match: string | readonly string[];
  readonly expose?: readonly string[];
  readonly redact?: readonly string[];
  readonly basis: ObserverBasis;
  readonly source: WorldlineSelector | WorldlineSource;
};

/** Runtime-backed source/config plan for an observer reading. */
export default class ObserverPlan {
  readonly #source: WorldlineSelector;
  readonly name: string;
  readonly match: string | readonly string[];
  readonly expose: readonly string[] | null;
  readonly redact: readonly string[] | null;
  readonly basis: ObserverBasis;
  readonly sourceKind: WorldlineSource['kind'];

  constructor(fields: ObserverPlanFields) {
    const checkedFields = requireFields(fields);
    const source = WorldlineSelector.from(checkedFields.source).clone();
    this.#source = source;
    this.name = requireNonEmptyString(checkedFields.name, 'name');
    this.match = normalizeMatch(checkedFields.match);
    this.expose = normalizeOptionalStringList(checkedFields.expose, 'expose');
    this.redact = normalizeOptionalStringList(checkedFields.redact, 'redact');
    this.basis = requireBasis(checkedFields.basis);
    this.sourceKind = selectorToSource(source).kind;
    Object.freeze(this);
  }

  get source(): WorldlineSource {
    return selectorToSource(this.#source);
  }

  toConfig(): ObserverConfig {
    return {
      match: matchToConfigValue(this.match),
      ...(this.expose !== null ? { expose: [...this.expose] } : {}),
      ...(this.redact !== null ? { redact: [...this.redact] } : {}),
      ...(!this.basis.isEmpty() ? { basis: this.basis.toConfigValue() } : {}),
    };
  }
}

function requireFields(fields: ObserverPlanFields | null | undefined): ObserverPlanFields {
  if (fields !== null && typeof fields === 'object') {
    return fields;
  }
  throw new QueryError('observer plan requires object fields', {
    code: 'E_OBSERVER_PLAN_FIELDS',
  });
}

function selectorToSource(source: WorldlineSelector): WorldlineSource {
  if (source instanceof LiveSelector) {
    return source.toDTO();
  }
  if (source instanceof CoordinateSelector) {
    return source.toDTO();
  }
  if (source instanceof StrandSelector) {
    return source.toDTO();
  }
  throw new QueryError(`unrecognized observer plan source kind: ${source.constructor.name}`, {
    code: 'E_OBSERVER_PLAN_SOURCE_UNKNOWN',
    context: { sourceKind: source.constructor.name },
  });
}

function normalizeMatch(match: string | readonly string[]): string | readonly string[] {
  if (typeof match === 'string') {
    return match;
  }
  if (!Array.isArray(match) || match.length === 0) {
    throw new QueryError('observer plan match must be a string or non-empty string array', {
      code: 'E_OBSERVER_PLAN_MATCH',
      context: { field: 'match' },
    });
  }
  return freezeStringList(match, 'match');
}

function matchToConfigValue(match: string | readonly string[]): string | string[] {
  if (typeof match === 'string') {
    return match;
  }
  return [...match];
}

function normalizeOptionalStringList(
  values: readonly string[] | undefined,
  field: string,
): readonly string[] | null {
  if (values === undefined) {
    return null;
  }
  return freezeStringList(values, field);
}

function freezeStringList(values: readonly string[], field: string): readonly string[] {
  if (!Array.isArray(values)) {
    throw new QueryError('observer plan field must be a string array', {
      code: 'E_OBSERVER_PLAN_FIELD',
      context: { field },
    });
  }
  const normalized: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string' || value.length === 0) {
      throw new QueryError('observer plan field entries must be non-empty strings', {
        code: 'E_OBSERVER_PLAN_FIELD',
        context: { field },
      });
    }
    normalized.push(value);
  }
  return Object.freeze(normalized);
}

function requireBasis(basis: ObserverBasis): ObserverBasis {
  if (basis instanceof ObserverBasis) {
    return basis;
  }
  throw new QueryError('observer plan requires an ObserverBasis', {
    code: 'E_OBSERVER_PLAN_BASIS',
  });
}

function requireNonEmptyString(value: string, field: string): string {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  throw new QueryError('observer plan field must be a non-empty string', {
    code: 'E_OBSERVER_PLAN_STRING',
    context: { field },
  });
}
