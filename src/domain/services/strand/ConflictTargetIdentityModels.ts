/**
 * ConflictTargetIdentityModels — runtime-backed conflict target identities.
 *
 * @module domain/services/strand/ConflictTargetIdentityModels
 */

import WarpError from '../../errors/WarpError.ts';
import { decodeEdgeKey, encodeEdgeKey } from '../KeyCodec.ts';

type TargetIdentityKind = 'node' | 'edge' | 'node_property' | 'edge_property';

function requireNonEmpty(value: string, fieldName: string): string {
  if (value.length === 0) {
    throw new WarpError(`ConflictTargetIdentity: ${fieldName} must be non-empty`, 'E_VALIDATION');
  }
  return value;
}

function optionalNonEmpty(value: string | null): string | null {
  return value !== null && value.length > 0 ? value : null;
}

export class NodeConflictTargetIdentity {
  readonly targetKind: TargetIdentityKind = 'node';
  readonly entityId: string;

  constructor(entityId: string) {
    this.entityId = requireNonEmpty(entityId, 'entityId');
    Object.freeze(this);
  }
}

export class EdgeConflictTargetIdentity {
  readonly targetKind: TargetIdentityKind = 'edge';
  readonly from: string;
  readonly to: string;
  readonly label: string;
  readonly edgeKey: string;

  constructor({ from, to, label, edgeKey }: {
    readonly from: string;
    readonly to: string;
    readonly label: string;
    readonly edgeKey: string;
  }) {
    this.from = requireNonEmpty(from, 'from');
    this.to = requireNonEmpty(to, 'to');
    this.label = requireNonEmpty(label, 'label');
    this.edgeKey = requireNonEmpty(edgeKey, 'edgeKey');
    Object.freeze(this);
  }

  static fromParts(from: string, to: string, label: string): EdgeConflictTargetIdentity {
    return new EdgeConflictTargetIdentity({ from, to, label, edgeKey: encodeEdgeKey(from, to, label) });
  }

  static fromReceiptTarget(receiptTarget: string): EdgeConflictTargetIdentity | null {
    if (receiptTarget === '*') {
      return null;
    }
    const decoded = decodeEdgeKey(receiptTarget);
    return EdgeConflictTargetIdentity.fromOptionalParts({
      from: decoded.from,
      to: decoded.to,
      label: decoded.label,
      edgeKey: receiptTarget,
    });
  }

  static fromOptionalParts({ from, to, label, edgeKey }: {
    readonly from: string | null;
    readonly to: string | null;
    readonly label: string | null;
    readonly edgeKey: string;
  }): EdgeConflictTargetIdentity | null {
    const validFrom = optionalNonEmpty(from);
    const validTo = optionalNonEmpty(to);
    const validLabel = optionalNonEmpty(label);
    return validFrom !== null && validTo !== null && validLabel !== null
      ? new EdgeConflictTargetIdentity({ from: validFrom, to: validTo, label: validLabel, edgeKey })
      : null;
  }
}

export class NodePropertyConflictTargetIdentity {
  readonly targetKind: TargetIdentityKind = 'node_property';
  readonly entityId: string;
  readonly propertyKey: string;

  constructor(entityId: string, propertyKey: string) {
    this.entityId = requireNonEmpty(entityId, 'entityId');
    this.propertyKey = requireNonEmpty(propertyKey, 'propertyKey');
    Object.freeze(this);
  }
}

export class EdgePropertyConflictTargetIdentity {
  readonly targetKind: TargetIdentityKind = 'edge_property';
  readonly from: string;
  readonly to: string;
  readonly label: string;
  readonly edgeKey: string;
  readonly propertyKey: string;

  constructor(edgeIdentity: EdgeConflictTargetIdentity, propertyKey: string) {
    this.from = edgeIdentity.from;
    this.to = edgeIdentity.to;
    this.label = edgeIdentity.label;
    this.edgeKey = edgeIdentity.edgeKey;
    this.propertyKey = requireNonEmpty(propertyKey, 'propertyKey');
    Object.freeze(this);
  }
}

export type ConflictTargetIdentity =
  | NodeConflictTargetIdentity
  | EdgeConflictTargetIdentity
  | NodePropertyConflictTargetIdentity
  | EdgePropertyConflictTargetIdentity;
