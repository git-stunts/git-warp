/** A serialized Roaring shard that passed boundary validation. */
export default class InspectedRoaringShard {
  readonly containerCount: number;
  readonly cardinality: number;

  constructor(containerCount: number, cardinality: number) {
    this.containerCount = containerCount;
    this.cardinality = cardinality;
    Object.freeze(this);
  }
}
