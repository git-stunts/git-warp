import QueryError from '../../errors/QueryError.ts';

const EXACT_ENTITY_SUPPORT_RULE = 'exact-entity';
const NEIGHBORHOOD_SUPPORT_RULE = 'neighborhood';
const TRAVERSAL_WINDOW_SUPPORT_RULE = 'traversal-window';
const GLOBAL_DISCOVERY_REFUSED_SUPPORT_RULE = 'global-discovery-refused';

export type OpticSupportRuleValue =
  | typeof EXACT_ENTITY_SUPPORT_RULE
  | typeof NEIGHBORHOOD_SUPPORT_RULE
  | typeof TRAVERSAL_WINDOW_SUPPORT_RULE
  | typeof GLOBAL_DISCOVERY_REFUSED_SUPPORT_RULE;

export const OPTIC_SUPPORT_RULES: readonly OpticSupportRuleValue[] = Object.freeze([
  EXACT_ENTITY_SUPPORT_RULE,
  NEIGHBORHOOD_SUPPORT_RULE,
  TRAVERSAL_WINDOW_SUPPORT_RULE,
  GLOBAL_DISCOVERY_REFUSED_SUPPORT_RULE,
]);

export default class OpticSupportRule {
  readonly value: OpticSupportRuleValue;

  constructor(value: string) {
    this.value = requireOpticSupportRuleValue(value);
    Object.freeze(this);
  }

  static exactEntity(): OpticSupportRule {
    return new OpticSupportRule(EXACT_ENTITY_SUPPORT_RULE);
  }

  static neighborhood(): OpticSupportRule {
    return new OpticSupportRule(NEIGHBORHOOD_SUPPORT_RULE);
  }

  static traversalWindow(): OpticSupportRule {
    return new OpticSupportRule(TRAVERSAL_WINDOW_SUPPORT_RULE);
  }

  static globalDiscoveryRefused(): OpticSupportRule {
    return new OpticSupportRule(GLOBAL_DISCOVERY_REFUSED_SUPPORT_RULE);
  }

  isExactEntity(): boolean {
    return this.value === EXACT_ENTITY_SUPPORT_RULE;
  }

  isNeighborhood(): boolean {
    return this.value === NEIGHBORHOOD_SUPPORT_RULE;
  }

  isTraversalWindow(): boolean {
    return this.value === TRAVERSAL_WINDOW_SUPPORT_RULE;
  }

  refusesGlobalDiscovery(): boolean {
    return this.value === GLOBAL_DISCOVERY_REFUSED_SUPPORT_RULE;
  }

  equals(other: OpticSupportRule): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

export function requireOpticSupportRuleValue(value: string): OpticSupportRuleValue {
  if (typeof value !== 'string') {
    throwOpticSupportRuleError();
  }
  const valid = OPTIC_SUPPORT_RULES.find((candidate) => candidate === value);
  if (valid === undefined) {
    throwOpticSupportRuleError();
  }
  return valid;
}

function throwOpticSupportRuleError(): never {
  throw new QueryError('Optic support rule is invalid.', {
    code: 'E_OPTIC_SCHEMA',
    context: { field: 'supportRule' },
  });
}
