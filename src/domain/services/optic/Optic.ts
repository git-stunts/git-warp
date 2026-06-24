import ContinuumEvidencePosture from '../../continuum/ContinuumEvidencePosture.ts';
import QueryError from '../../errors/QueryError.ts';
import OpticAperturePosture, {
  type OpticAperturePostureValue,
} from './OpticAperturePosture.ts';
import OpticBasisPosture, {
  type OpticBasisPostureValue,
} from './OpticBasisPosture.ts';
import OpticCoordinatePosture, {
  type OpticCoordinatePostureValue,
} from './OpticCoordinatePosture.ts';
import OpticReadTarget, {
  type OpticKindValue,
  type OpticReadTargetInstance,
  type OpticTargetContext,
} from './OpticReadTarget.ts';
import OpticSupportRule, {
  type OpticSupportRuleValue,
} from './OpticSupportRule.ts';

const NODE_OPTIC_KIND: OpticKindValue = 'node';
const NODE_PROPERTY_OPTIC_KIND: OpticKindValue = 'node-property';
const NEIGHBORHOOD_OPTIC_KIND: OpticKindValue = 'neighborhood';
const TRAVERSAL_OPTIC_KIND: OpticKindValue = 'traversal';

export type OpticPostureFields = {
  readonly coordinatePosture: OpticCoordinatePosture | OpticCoordinatePostureValue;
  readonly aperturePosture: OpticAperturePosture | OpticAperturePostureValue;
  readonly basisPosture: OpticBasisPosture | OpticBasisPostureValue;
  readonly evidencePosture: ContinuumEvidencePosture;
};

export type OpticFields = OpticPostureFields & {
  readonly target: OpticReadTargetInstance;
  readonly supportRule: OpticSupportRule | OpticSupportRuleValue;
};

export type OpticContextValue = {
  readonly opticKind: OpticKindValue;
  readonly target: OpticTargetContext;
  readonly coordinatePosture: string;
  readonly aperturePosture: string;
  readonly basisPosture: string;
  readonly supportRule: string;
  readonly evidencePosture: string;
};

export default class Optic {
  readonly target: OpticReadTargetInstance;
  readonly coordinatePosture: OpticCoordinatePosture;
  readonly aperturePosture: OpticAperturePosture;
  readonly basisPosture: OpticBasisPosture;
  readonly supportRule: OpticSupportRule;
  readonly evidencePosture: ContinuumEvidencePosture;

  constructor(fields: OpticFields) {
    this.target = requireTarget(fields.target);
    this.coordinatePosture = normalizeCoordinatePosture(fields.coordinatePosture);
    this.aperturePosture = normalizeAperturePosture(fields.aperturePosture);
    this.basisPosture = normalizeBasisPosture(fields.basisPosture);
    this.supportRule = normalizeSupportRule(fields.supportRule);
    this.evidencePosture = requireEvidencePosture(fields.evidencePosture);
    requireSupportMatchesTarget(this.target.opticKind, this.supportRule);
    Object.freeze(this);
  }

  static node(fields: OpticPostureFields & { readonly nodeId: string }): Optic {
    return new Optic({
      ...fields,
      target: OpticReadTarget.node(fields.nodeId),
      supportRule: OpticSupportRule.exactEntity(),
    });
  }

  static nodeProperty(fields: OpticPostureFields & {
    readonly nodeId: string;
    readonly propertyKey: string;
  }): Optic {
    return new Optic({
      ...fields,
      target: OpticReadTarget.nodeProperty(fields.nodeId, fields.propertyKey),
      supportRule: OpticSupportRule.exactEntity(),
    });
  }

  static neighborhood(fields: OpticPostureFields & { readonly nodeId: string }): Optic {
    return new Optic({
      ...fields,
      target: OpticReadTarget.neighborhood(fields.nodeId),
      supportRule: OpticSupportRule.neighborhood(),
    });
  }

  static traversal(fields: OpticPostureFields & {
    readonly startNodeId: string;
    readonly supportRule: OpticSupportRule | OpticSupportRuleValue;
  }): Optic {
    return new Optic({
      ...fields,
      target: OpticReadTarget.traversal(fields.startNodeId),
    });
  }

  nodeProperty(propertyKey: string): Optic {
    return this.withTarget(
      OpticReadTarget.nodeProperty(this.nodeId(), propertyKey),
      OpticSupportRule.exactEntity(),
    );
  }

  neighborhood(): Optic {
    return this.withTarget(
      OpticReadTarget.neighborhood(this.nodeId()),
      OpticSupportRule.neighborhood(),
    );
  }

  traversal(supportRule: OpticSupportRule | OpticSupportRuleValue): Optic {
    return this.withTarget(OpticReadTarget.traversal(this.nodeId()), supportRule);
  }

  withSupportRule(supportRule: OpticSupportRule | OpticSupportRuleValue): Optic {
    return this.withTarget(this.target, supportRule);
  }

  withTarget(
    target: OpticReadTargetInstance,
    supportRule: OpticSupportRule | OpticSupportRuleValue,
  ): Optic {
    return new Optic({
      target,
      coordinatePosture: this.coordinatePosture,
      aperturePosture: this.aperturePosture,
      basisPosture: this.basisPosture,
      supportRule,
      evidencePosture: this.evidencePosture,
    });
  }

  nodeId(): string {
    return this.target.toContextValue().nodeId;
  }

  propertyKey(): string {
    const targetContext = this.target.toContextValue();
    if ('propertyKey' in targetContext) {
      return targetContext.propertyKey;
    }
    throw new QueryError('Optic target does not include a property key.', {
      code: 'E_OPTIC_SCHEMA',
      context: { opticKind: this.target.opticKind, field: 'propertyKey' },
    });
  }

  toContextValue(): OpticContextValue {
    return Object.freeze({
      opticKind: this.target.opticKind,
      target: this.target.toContextValue(),
      coordinatePosture: this.coordinatePosture.toString(),
      aperturePosture: this.aperturePosture.toString(),
      basisPosture: this.basisPosture.toString(),
      supportRule: this.supportRule.toString(),
      evidencePosture: this.evidencePosture.toString(),
    });
  }
}

function requireTarget(target: OpticReadTargetInstance): OpticReadTargetInstance {
  if (!(target instanceof OpticReadTarget)) {
    throw new QueryError('Optic requires a runtime-backed read target.', {
      code: 'E_OPTIC_SCHEMA',
      context: { field: 'target' },
    });
  }
  return target;
}

function requireEvidencePosture(posture: ContinuumEvidencePosture): ContinuumEvidencePosture {
  if (!(posture instanceof ContinuumEvidencePosture)) {
    throw new QueryError('Optic requires a Continuum evidence posture.', {
      code: 'E_OPTIC_SCHEMA',
      context: { field: 'evidencePosture' },
    });
  }
  return posture;
}

function normalizeCoordinatePosture(
  value: OpticCoordinatePosture | OpticCoordinatePostureValue,
): OpticCoordinatePosture {
  if (value instanceof OpticCoordinatePosture) {
    return value;
  }
  return new OpticCoordinatePosture(value);
}

function normalizeAperturePosture(
  value: OpticAperturePosture | OpticAperturePostureValue,
): OpticAperturePosture {
  if (value instanceof OpticAperturePosture) {
    return value;
  }
  return new OpticAperturePosture(value);
}

function normalizeBasisPosture(
  value: OpticBasisPosture | OpticBasisPostureValue | undefined,
): OpticBasisPosture {
  if (value === undefined) {
    throw new QueryError('Optic requires a basis posture.', {
      code: 'E_OPTIC_SCHEMA',
      context: { field: 'basisPosture' },
    });
  }
  if (value instanceof OpticBasisPosture) {
    return value;
  }
  return new OpticBasisPosture(value);
}

function normalizeSupportRule(
  value: OpticSupportRule | OpticSupportRuleValue,
): OpticSupportRule {
  if (value instanceof OpticSupportRule) {
    return value;
  }
  return new OpticSupportRule(value);
}

function requireSupportMatchesTarget(
  opticKind: OpticKindValue,
  supportRule: OpticSupportRule,
): void {
  if (supportRuleMatchesTarget(opticKind, supportRule)) {
    return;
  }
  throwSupportMismatch(opticKind, supportRule);
}

function supportRuleMatchesTarget(
  opticKind: OpticKindValue,
  supportRule: OpticSupportRule,
): boolean {
  if (isExactEntityOpticKind(opticKind)) {
    return supportRule.isExactEntity();
  }
  if (opticKind === NEIGHBORHOOD_OPTIC_KIND) {
    return supportRule.isNeighborhood();
  }
  if (opticKind === TRAVERSAL_OPTIC_KIND) {
    return isTraversalSupportRule(supportRule);
  }
  return false;
}

function isExactEntityOpticKind(opticKind: OpticKindValue): boolean {
  return opticKind === NODE_OPTIC_KIND || opticKind === NODE_PROPERTY_OPTIC_KIND;
}

function isTraversalSupportRule(supportRule: OpticSupportRule): boolean {
  if (supportRule.isTraversalWindow()) {
    return true;
  }
  return supportRule.refusesGlobalDiscovery();
}

function throwSupportMismatch(
  opticKind: OpticKindValue,
  supportRule: OpticSupportRule,
): never {
  throw new QueryError('Optic support rule does not match target kind.', {
    code: 'E_OPTIC_SCHEMA',
    context: { opticKind, supportRule: supportRule.toString() },
  });
}
