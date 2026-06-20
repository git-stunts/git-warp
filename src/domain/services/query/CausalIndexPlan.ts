import QueryError from '../../errors/QueryError.ts';
import BoundedSupportRule from './BoundedSupportRule.ts';

export type CausalIndexFamily = 'entity-patch' | 'neighborhood-adjacency' | 'global-discovery';
export type CausalIndexPlanPosture = 'available' | 'composite' | 'unsupported';

export type CausalIndexPlanFields = {
  readonly supportRule: BoundedSupportRule;
  readonly posture: CausalIndexPlanPosture;
  readonly families: readonly CausalIndexFamily[];
  readonly reason: string;
  readonly requiredEntityIds?: readonly string[];
};

const INDEX_FAMILIES: readonly CausalIndexFamily[] = Object.freeze([
  'entity-patch',
  'neighborhood-adjacency',
  'global-discovery',
]);
const INDEX_POSTURES: readonly CausalIndexPlanPosture[] = Object.freeze([
  'available',
  'composite',
  'unsupported',
]);

/** Index-selection posture for a bounded public read support rule. */
export default class CausalIndexPlan {
  readonly supportRule: BoundedSupportRule;
  readonly posture: CausalIndexPlanPosture;
  readonly families: readonly CausalIndexFamily[];
  readonly reason: string;
  readonly requiredEntityIds: readonly string[];

  constructor(fields: CausalIndexPlanFields) {
    const checkedFields = requireFields(fields);
    this.supportRule = requireSupportRule(checkedFields.supportRule);
    this.posture = requirePosture(checkedFields.posture);
    this.families = freezeFamilies(checkedFields.families);
    this.reason = requireNonEmptyString(checkedFields.reason, 'reason');
    this.requiredEntityIds = freezeStringList(checkedFields.requiredEntityIds ?? [], 'requiredEntityIds');
    Object.freeze(this);
  }

  static fromSupportRule(rule: BoundedSupportRule): CausalIndexPlan {
    const supportRule = requireSupportRule(rule);
    if (supportRule.kind === 'entity') {
      return new CausalIndexPlan({
        supportRule,
        posture: 'available',
        families: ['entity-patch'],
        reason: 'entity support can be served by the provenance entity-to-patch index',
        requiredEntityIds: supportRule.rootNodeIds,
      });
    }
    if (supportRule.kind === 'neighborhood') {
      return new CausalIndexPlan({
        supportRule,
        posture: 'composite',
        families: ['entity-patch', 'neighborhood-adjacency'],
        reason: 'neighborhood support needs entity patch discovery plus adjacency expansion',
        requiredEntityIds: supportRule.rootNodeIds,
      });
    }
    return new CausalIndexPlan({
      supportRule,
      posture: 'unsupported',
      families: ['global-discovery'],
      reason: 'global discovery has no bounded causal index family',
    });
  }

  canUseCausalIndex(): boolean {
    return this.posture !== 'unsupported';
  }

  requiresGlobalScan(): boolean {
    return this.posture === 'unsupported';
  }
}

function requireFields(fields: CausalIndexPlanFields | null | undefined): CausalIndexPlanFields {
  if (fields === null || fields === undefined) {
    throw new QueryError('CausalIndexPlan fields must be provided', {
      code: 'E_QUERY_CAUSAL_INDEX_PLAN',
    });
  }
  return fields;
}

function requireSupportRule(value: BoundedSupportRule): BoundedSupportRule {
  if (!(value instanceof BoundedSupportRule)) {
    throw new QueryError('CausalIndexPlan requires a BoundedSupportRule', {
      code: 'E_QUERY_CAUSAL_INDEX_PLAN',
    });
  }
  return value;
}

function requirePosture(value: CausalIndexPlanPosture): CausalIndexPlanPosture {
  if (!INDEX_POSTURES.includes(value)) {
    throw new QueryError('CausalIndexPlan posture is unsupported', {
      code: 'E_QUERY_CAUSAL_INDEX_PLAN',
      context: { posture: value },
    });
  }
  return value;
}

function requireNonEmptyString(value: string, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new QueryError(`${field} must be a non-empty string`, {
      code: 'E_QUERY_CAUSAL_INDEX_PLAN',
      context: { field },
    });
  }
  return value.trim();
}

function freezeFamilies(values: readonly CausalIndexFamily[]): readonly CausalIndexFamily[] {
  if (!Array.isArray(values)) {
    throw new QueryError('families must be an array', {
      code: 'E_QUERY_CAUSAL_INDEX_PLAN',
    });
  }
  const normalized: CausalIndexFamily[] = [];
  for (const value of values) {
    if (!INDEX_FAMILIES.includes(value)) {
      throw new QueryError('families contains unsupported index family', {
        code: 'E_QUERY_CAUSAL_INDEX_PLAN',
        context: { family: value },
      });
    }
    normalized.push(value);
  }
  return Object.freeze([...new Set(normalized)].sort());
}

function freezeStringList(values: readonly string[], field: string): readonly string[] {
  if (!Array.isArray(values)) {
    throw new QueryError(`${field} must be an array`, {
      code: 'E_QUERY_CAUSAL_INDEX_PLAN',
      context: { field },
    });
  }
  const normalized: string[] = [];
  for (const value of values) {
    normalized.push(requireNonEmptyString(value, field));
  }
  return Object.freeze([...new Set(normalized)].sort());
}
