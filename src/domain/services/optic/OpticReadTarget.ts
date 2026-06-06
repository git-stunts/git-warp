import OpticReadFailureSchemaError from './OpticReadFailureSchemaError.ts';

export type OpticKindValue = 'node' | 'node-property' | 'neighborhood';

export type NodeOpticTargetContext = {
  readonly nodeId: string;
};

export type NodePropertyOpticTargetContext = {
  readonly nodeId: string;
  readonly propertyKey: string;
};

export type OpticTargetContext = NodeOpticTargetContext | NodePropertyOpticTargetContext;

export default class OpticReadTarget {
  readonly opticKind: OpticKindValue;
  private readonly nodeId: string;
  private readonly propertyKey: string | null;

  private constructor(options: {
    readonly opticKind: OpticKindValue;
    readonly nodeId: string;
    readonly propertyKey?: string;
  }) {
    assertNonEmpty(options.nodeId, 'nodeId');
    if (options.opticKind === 'node-property') {
      assertNonEmpty(options.propertyKey ?? '', 'propertyKey');
    }

    this.opticKind = options.opticKind;
    this.nodeId = options.nodeId;
    this.propertyKey = options.propertyKey ?? null;
    Object.freeze(this);
  }

  static node(nodeId: string): OpticReadTarget {
    return new OpticReadTarget({ opticKind: 'node', nodeId });
  }

  static nodeProperty(nodeId: string, propertyKey: string): OpticReadTarget {
    return new OpticReadTarget({ opticKind: 'node-property', nodeId, propertyKey });
  }

  static neighborhood(nodeId: string): OpticReadTarget {
    return new OpticReadTarget({ opticKind: 'neighborhood', nodeId });
  }

  toContextValue(): OpticTargetContext {
    if (this.propertyKey === null) {
      return Object.freeze({ nodeId: this.nodeId });
    }
    return Object.freeze({ nodeId: this.nodeId, propertyKey: this.propertyKey });
  }
}

export type OpticReadTargetInstance = OpticReadTarget;

function assertNonEmpty(value: string, field: string): void {
  if (value.length === 0) {
    throw new OpticReadFailureSchemaError('optic read target requires non-empty fields', { field });
  }
}
