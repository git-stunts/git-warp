import QueryError from '../../errors/QueryError.ts';
import BoundedSupportRule from './BoundedSupportRule.ts';
import CausalIndexPlan from './CausalIndexPlan.ts';

export type SupportFragmentMaterializationPosture =
  | 'support-fragment'
  | 'support-fragment-with-index-fill'
  | 'global-fallback';

export type SupportFragmentPlanFields = {
  readonly supportRule: BoundedSupportRule;
  readonly causalIndexPlan: CausalIndexPlan;
  readonly posture: SupportFragmentMaterializationPosture;
  readonly scopeKey: string;
  readonly requiredEntityIds?: readonly string[];
};

const SUPPORT_FRAGMENT_POSTURES: readonly SupportFragmentMaterializationPosture[] = Object.freeze([
  'support-fragment',
  'support-fragment-with-index-fill',
  'global-fallback',
]);

/** Support-scoped fragment materialization contract for a bounded read plan. */
export default class SupportFragmentPlan {
  readonly supportRule: BoundedSupportRule;
  readonly causalIndexPlan: CausalIndexPlan;
  readonly posture: SupportFragmentMaterializationPosture;
  readonly scopeKey: string;
  readonly requiredEntityIds: readonly string[];

  constructor(fields: SupportFragmentPlanFields) {
    const checkedFields = requireFields(fields);
    this.supportRule = requireSupportRule(checkedFields.supportRule);
    this.causalIndexPlan = requireMatchingCausalIndexPlan(
      checkedFields.causalIndexPlan,
      this.supportRule,
    );
    this.posture = requirePosture(checkedFields.posture);
    this.scopeKey = requireNonEmptyString(checkedFields.scopeKey, 'scopeKey');
    this.requiredEntityIds = freezeStringList(checkedFields.requiredEntityIds ?? [], 'requiredEntityIds');
    Object.freeze(this);
  }

  static fromSupportRule(rule: BoundedSupportRule): SupportFragmentPlan {
    const supportRule = requireSupportRule(rule);
    return SupportFragmentPlan.fromSupportAndIndex({
      supportRule,
      causalIndexPlan: CausalIndexPlan.fromSupportRule(supportRule),
    });
  }

  static fromSupportAndIndex(fields: {
    readonly supportRule: BoundedSupportRule;
    readonly causalIndexPlan: CausalIndexPlan;
  }): SupportFragmentPlan {
    const supportRule = requireSupportRule(fields.supportRule);
    const causalIndexPlan = requireMatchingCausalIndexPlan(fields.causalIndexPlan, supportRule);
    return new SupportFragmentPlan({
      supportRule,
      causalIndexPlan,
      posture: postureFor(supportRule, causalIndexPlan),
      scopeKey: scopeKeyFor(supportRule, causalIndexPlan),
      requiredEntityIds: causalIndexPlan.requiredEntityIds,
    });
  }

  canMaterializeSupportFragment(): boolean {
    return this.posture !== 'global-fallback';
  }

  requiresFullGraphFallback(): boolean {
    return this.posture === 'global-fallback';
  }

  fragmentKeyForCoordinate(coordinateRef: string): string {
    if (this.requiresFullGraphFallback()) {
      throw new QueryError('global fallback plans do not have support-scoped fragment keys', {
        code: 'E_QUERY_SUPPORT_FRAGMENT_PLAN',
      });
    }
    return `${this.scopeKey}@${requireNonEmptyString(coordinateRef, 'coordinateRef')}`;
  }
}

function requireFields(fields: SupportFragmentPlanFields | null | undefined): SupportFragmentPlanFields {
  if (fields === null || fields === undefined) {
    throw new QueryError('SupportFragmentPlan fields must be provided', {
      code: 'E_QUERY_SUPPORT_FRAGMENT_PLAN',
    });
  }
  return fields;
}

function requireSupportRule(value: BoundedSupportRule): BoundedSupportRule {
  if (!(value instanceof BoundedSupportRule)) {
    throw new QueryError('SupportFragmentPlan requires a BoundedSupportRule', {
      code: 'E_QUERY_SUPPORT_FRAGMENT_PLAN',
    });
  }
  return value;
}

function requireMatchingCausalIndexPlan(
  value: CausalIndexPlan,
  supportRule: BoundedSupportRule,
): CausalIndexPlan {
  if (!(value instanceof CausalIndexPlan)) {
    throw new QueryError('SupportFragmentPlan requires a CausalIndexPlan', {
      code: 'E_QUERY_SUPPORT_FRAGMENT_PLAN',
    });
  }
  if (value.supportRule !== supportRule) {
    throw new QueryError('SupportFragmentPlan support rule and causal index plan must match', {
      code: 'E_QUERY_SUPPORT_FRAGMENT_PLAN',
    });
  }
  return value;
}

function requirePosture(
  value: SupportFragmentMaterializationPosture,
): SupportFragmentMaterializationPosture {
  if (!SUPPORT_FRAGMENT_POSTURES.includes(value)) {
    throw new QueryError('SupportFragmentPlan posture is unsupported', {
      code: 'E_QUERY_SUPPORT_FRAGMENT_PLAN',
      context: { posture: value },
    });
  }
  return value;
}

function postureFor(
  supportRule: BoundedSupportRule,
  causalIndexPlan: CausalIndexPlan,
): SupportFragmentMaterializationPosture {
  if (!supportRule.isBounded() || causalIndexPlan.requiresGlobalScan()) {
    return 'global-fallback';
  }
  if (causalIndexPlan.posture === 'composite') {
    return 'support-fragment-with-index-fill';
  }
  return 'support-fragment';
}

function scopeKeyFor(supportRule: BoundedSupportRule, causalIndexPlan: CausalIndexPlan): string {
  return [
    `surface:${supportRule.surface}`,
    `kind:${supportRule.kind}`,
    `roots:${joinOrNone(supportRule.rootNodeIds)}`,
    `depth:${supportRule.maxDepth ?? 'none'}`,
    `directions:${joinOrNone(supportRule.directions)}`,
    `indexes:${joinOrNone(causalIndexPlan.families)}`,
  ].join('/');
}

function joinOrNone(values: readonly string[]): string {
  if (values.length === 0) {
    return 'none';
  }
  return values.join('+');
}

function requireNonEmptyString(value: string, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new QueryError(`${field} must be a non-empty string`, {
      code: 'E_QUERY_SUPPORT_FRAGMENT_PLAN',
      context: { field },
    });
  }
  return value.trim();
}

function freezeStringList(values: readonly string[], field: string): readonly string[] {
  if (!Array.isArray(values)) {
    throw new QueryError(`${field} must be an array`, {
      code: 'E_QUERY_SUPPORT_FRAGMENT_PLAN',
      context: { field },
    });
  }
  const normalized: string[] = [];
  for (const value of values) {
    normalized.push(requireNonEmptyString(value, field));
  }
  return Object.freeze([...new Set(normalized)].sort());
}
