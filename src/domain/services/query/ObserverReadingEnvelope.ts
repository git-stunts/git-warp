import QueryError from '../../errors/QueryError.ts';
import ObserverEmission from './ObserverEmission.ts';
import ObserverPlan from './ObserverPlan.ts';
import type { WorldlineSource } from '../../capabilities/QueryCapability.ts';

export type ObserverReadingEnvelopeBudget = {
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly propertyKeyCount: number;
  readonly matchedBasisCount: number;
};

export type ObserverReadingEnvelopeFields = {
  readonly plan: ObserverPlan;
  readonly payload: ObserverEmission;
  readonly stateHash?: string | null;
  readonly witnessRef?: string | null;
  readonly shellRef?: string | null;
  readonly pluralityRef?: string | null;
};

/** Observer reading envelope tying source plan, emitted payload, and witness refs. */
export default class ObserverReadingEnvelope {
  readonly plan: ObserverPlan;
  readonly payload: ObserverEmission;
  readonly stateHash: string | null;
  readonly witnessRef: string | null;
  readonly shellRef: string | null;
  readonly pluralityRef: string | null;
  readonly budget: ObserverReadingEnvelopeBudget;
  readonly residualBasis: readonly string[];

  constructor(fields: ObserverReadingEnvelopeFields) {
    const checkedFields = requireFields(fields);
    this.plan = requirePlan(checkedFields.plan);
    this.payload = requirePayload(checkedFields.payload);
    this.stateHash = requireOptionalRef(checkedFields.stateHash ?? null, 'stateHash');
    this.witnessRef = requireOptionalRef(checkedFields.witnessRef ?? null, 'witnessRef');
    this.shellRef = requireOptionalRef(checkedFields.shellRef ?? null, 'shellRef');
    this.pluralityRef = requireOptionalRef(checkedFields.pluralityRef ?? null, 'pluralityRef');
    this.budget = freezeBudget(this.payload);
    this.residualBasis = freezeResidualBasis(this.plan, this.payload);
    Object.freeze(this);
  }

  get source(): WorldlineSource {
    return this.plan.source;
  }

  hasResidual(): boolean {
    return this.residualBasis.length > 0;
  }

  hasPlurality(): boolean {
    return this.pluralityRef !== null;
  }
}

function requireFields(
  fields: ObserverReadingEnvelopeFields | null | undefined,
): ObserverReadingEnvelopeFields {
  if (fields !== null && typeof fields === 'object') {
    return fields;
  }
  throw new QueryError('observer reading envelope requires object fields', {
    code: 'E_OBSERVER_READING_ENVELOPE_FIELDS',
  });
}

function requirePlan(plan: ObserverPlan): ObserverPlan {
  if (plan instanceof ObserverPlan) {
    return plan;
  }
  throw new QueryError('observer reading envelope requires an ObserverPlan', {
    code: 'E_OBSERVER_READING_ENVELOPE_PLAN',
  });
}

function requirePayload(payload: ObserverEmission): ObserverEmission {
  if (payload instanceof ObserverEmission) {
    return payload;
  }
  throw new QueryError('observer reading envelope requires an ObserverEmission payload', {
    code: 'E_OBSERVER_READING_ENVELOPE_PAYLOAD',
  });
}

function requireOptionalRef(value: string | null, field: string): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  throw new QueryError('observer reading envelope refs must be non-empty when provided', {
    code: 'E_OBSERVER_READING_ENVELOPE_REF',
    context: { field },
  });
}

function freezeBudget(payload: ObserverEmission): ObserverReadingEnvelopeBudget {
  return Object.freeze({
    nodeCount: payload.nodeCount,
    edgeCount: payload.edgeCount,
    propertyKeyCount: payload.propertyKeys.length,
    matchedBasisCount: payload.matchedBasis.length,
  });
}

function freezeResidualBasis(
  plan: ObserverPlan,
  payload: ObserverEmission,
): readonly string[] {
  const matched = new Set(payload.matchedBasis);
  return Object.freeze(plan.basis.distinctions.filter((distinction) => !matched.has(distinction)));
}
