/**
 * ConflictTargetResolver — runtime-backed target identity for conflict hashing.
 *
 * @module domain/services/strand/ConflictTargetResolver
 */

import { encodeEdgeKey } from '../KeyCodec.ts';
import EdgeAdd from '../../types/ops/EdgeAdd.ts';
import EdgePropSet from '../../types/ops/EdgePropSet.ts';
import EdgeRemove from '../../types/ops/EdgeRemove.ts';
import NodeAdd from '../../types/ops/NodeAdd.ts';
import NodePropSet from '../../types/ops/NodePropSet.ts';
import NodeRemove from '../../types/ops/NodeRemove.ts';
import type { CanonicalOpBlob } from './CanonicalConflictOp.ts';
import ConflictOpAnchor from './ConflictOpAnchor.ts';
import {
  EdgeConflictTargetIdentity,
  EdgePropertyConflictTargetIdentity,
  NodeConflictTargetIdentity,
  NodePropertyConflictTargetIdentity,
  type ConflictTargetIdentity,
} from './ConflictTargetIdentityModels.ts';

type NodeTargetOp = NodeAdd | NodeRemove;
type EdgeTargetOp = EdgeAdd | EdgeRemove;

export default class ConflictTargetResolver {
  static nodeFrom(canonOp: NodeTargetOp): NodeConflictTargetIdentity {
    return new NodeConflictTargetIdentity(canonOp.node);
  }

  static edgeFrom(canonOp: EdgeTargetOp): EdgeConflictTargetIdentity {
    return EdgeConflictTargetIdentity.fromParts(canonOp.from, canonOp.to, canonOp.label);
  }

  static nodePropertyFrom(canonOp: NodePropSet): NodePropertyConflictTargetIdentity {
    return new NodePropertyConflictTargetIdentity(canonOp.node, canonOp.key);
  }

  static edgePropertyFrom(canonOp: EdgePropSet): EdgePropertyConflictTargetIdentity {
    return new EdgePropertyConflictTargetIdentity(
      EdgeConflictTargetIdentity.fromParts(canonOp.from, canonOp.to, canonOp.label),
      canonOp.key,
    );
  }

  static resolve(canonOp: CanonicalOpBlob, receiptTarget: string): ConflictTargetIdentity | null {
    if (canonOp instanceof ConflictOpAnchor) {
      return ConflictTargetResolver.anchor(canonOp, receiptTarget);
    }
    return ConflictTargetResolver.runtimeStructural(canonOp)
      ?? ConflictTargetResolver.runtimeProperty(canonOp);
  }

  private static runtimeStructural(canonOp: CanonicalOpBlob): ConflictTargetIdentity | null {
    if (canonOp instanceof NodeAdd || canonOp instanceof NodeRemove) {
      return ConflictTargetResolver.nodeFrom(canonOp);
    }
    if (canonOp instanceof EdgeAdd || canonOp instanceof EdgeRemove) {
      return ConflictTargetResolver.edgeFrom(canonOp);
    }
    return null;
  }

  private static runtimeProperty(canonOp: CanonicalOpBlob): ConflictTargetIdentity | null {
    if (canonOp instanceof NodePropSet) {
      return ConflictTargetResolver.nodePropertyFrom(canonOp);
    }
    if (canonOp instanceof EdgePropSet) {
      return ConflictTargetResolver.edgePropertyFrom(canonOp);
    }
    return null;
  }

  private static anchor(anchor: ConflictOpAnchor, receiptTarget: string): ConflictTargetIdentity | null {
    if (anchor.type === 'NodeAdd' || anchor.type === 'NodeRemove') {
      return ConflictTargetResolver.nodeAnchor(anchor, receiptTarget);
    }
    if (anchor.type === 'EdgeAdd' || anchor.type === 'EdgeRemove') {
      return ConflictTargetResolver.edgeAnchor(anchor, receiptTarget);
    }
    return ConflictTargetResolver.propertyAnchor(anchor);
  }

  private static nodeAnchor(anchor: ConflictOpAnchor, receiptTarget: string): NodeConflictTargetIdentity | null {
    const entityId = anchor.node ?? (receiptTarget !== '*' ? receiptTarget : null);
    return entityId !== null ? new NodeConflictTargetIdentity(entityId) : null;
  }

  private static edgeAnchor(anchor: ConflictOpAnchor, receiptTarget: string): EdgeConflictTargetIdentity | null {
    return EdgeConflictTargetIdentity.fromOptionalParts({
      from: anchor.from,
      to: anchor.to,
      label: anchor.label,
      edgeKey: encodeEdgeKey(anchor.from ?? '', anchor.to ?? '', anchor.label ?? ''),
    }) ?? EdgeConflictTargetIdentity.fromReceiptTarget(receiptTarget);
  }

  private static propertyAnchor(anchor: ConflictOpAnchor): ConflictTargetIdentity | null {
    return ConflictTargetResolver.nodePropertyAnchor(anchor)
      ?? ConflictTargetResolver.edgePropertyAnchor(anchor);
  }

  private static nodePropertyAnchor(anchor: ConflictOpAnchor): NodePropertyConflictTargetIdentity | null {
    return anchor.type === 'NodePropSet' && anchor.node !== null && anchor.key !== null
      ? new NodePropertyConflictTargetIdentity(anchor.node, anchor.key)
      : null;
  }

  private static edgePropertyKey(anchor: ConflictOpAnchor): string | null {
    return anchor.type === 'EdgePropSet' ? anchor.key : null;
  }

  private static edgePropertyBase(anchor: ConflictOpAnchor): EdgeConflictTargetIdentity | null {
    return EdgeConflictTargetIdentity.fromOptionalParts({
      from: anchor.from,
      to: anchor.to,
      label: anchor.label,
      edgeKey: encodeEdgeKey(anchor.from ?? '', anchor.to ?? '', anchor.label ?? ''),
    });
  }

  private static edgePropertyAnchor(anchor: ConflictOpAnchor): EdgePropertyConflictTargetIdentity | null {
    const propertyKey = ConflictTargetResolver.edgePropertyKey(anchor);
    if (propertyKey === null) {
      return null;
    }
    const edgeIdentity = ConflictTargetResolver.edgePropertyBase(anchor);
    return edgeIdentity !== null ? new EdgePropertyConflictTargetIdentity(edgeIdentity, propertyKey) : null;
  }
}
