export const DEFAULT_SCALES: readonly number[] = Object.freeze([200, 2000]);

/** Only the two admitted witness scales, with an explicit 200-thread pilot. */
export default class WitnessArguments {
  readonly scales: readonly number[];

  private constructor(scales: readonly number[]) {
    if (scales.length === 0 || scales.some((scale) => !DEFAULT_SCALES.includes(scale))
      || new Set(scales).size !== scales.length) {
      throw new RangeError('witness scales must be unique members of 200 and 2000');
    }
    this.scales = Object.freeze([...scales]);
    Object.freeze(this);
  }

  static parse(arguments_: readonly string[]): WitnessArguments | null {
    if (arguments_.length === 0) {
      return new WitnessArguments(DEFAULT_SCALES);
    }
    if (arguments_.some((argument) => argument !== '200' && argument !== '2000')
      || new Set(arguments_).size !== arguments_.length) {
      return null;
    }
    return new WitnessArguments(arguments_.map(Number));
  }
}
