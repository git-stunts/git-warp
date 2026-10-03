import OwnershipPosition, { requireIdentity } from './OwnershipPosition.ts';
import type StructuralAttachmentState from './StructuralAttachmentState.ts';
import type { PositionTracking } from './StructuralAttachmentState.ts';

/** Ownership tracking projection of a skeleton candidate, not a DPOI matcher. */
export default class SkeletonRewrite {
  readonly id: string;
  readonly tracking: readonly PositionTracking[];

  constructor(id: string, tracking: readonly PositionTracking[]) {
    requireIdentity(id);
    for (const item of tracking) {
      if (!(item.source instanceof OwnershipPosition) || item.targets.some((target) => !(target instanceof OwnershipPosition))) throw new Error('Invalid tracking');
    }
    this.id = id;
    this.tracking = Object.freeze(tracking.map((item) => Object.freeze({
      source: item.source, targets: Object.freeze([...item.targets]),
    })));
    Object.freeze(this);
  }

  uses(): readonly string[] { return this.tracking.map((item) => item.source.key); }
  deletes(): readonly string[] { return this.tracking.filter((item) => item.targets.length === 0).map((item) => item.source.key); }
  writes(): readonly string[] { return this.tracking.flatMap((item) => [item.source.key, ...item.targets.map((target) => target.key)]); }
  apply(state: StructuralAttachmentState) { return state.transport(this.tracking); }
}
