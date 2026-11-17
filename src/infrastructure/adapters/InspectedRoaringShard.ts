/** A serialized Roaring shard that passed boundary validation. */
export default class InspectedRoaringShard {
  readonly containerCount: number;
  readonly cardinality: number;
  /** The key of the first container, or null for an empty shard. */
  readonly firstKey: number | null;

  constructor(containerCount: number, cardinality: number, firstKey: number | null) {
    this.containerCount = containerCount;
    this.cardinality = cardinality;
    this.firstKey = firstKey;
    Object.freeze(this);
  }
}
