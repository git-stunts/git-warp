import WarpError from '../errors/WarpError.ts';

export type CheckpointPolicyConfig = {
  readonly every: number;
};

const DEFAULT_CHECKPOINT_INTERVAL = 64;

/** Immutable, validated cadence for automatic replay checkpoints. */
export default class CheckpointPolicy {
  readonly every: number;

  constructor(every: number) {
    if (!Number.isInteger(every) || every <= 0) {
      throw new WarpError(
        'checkpointPolicy.every must be a positive integer',
        'E_CHECKPOINT_POLICY_EVERY',
      );
    }
    this.every = every;
    Object.freeze(this);
  }

  static readonly DEFAULT: CheckpointPolicy = new CheckpointPolicy(
    DEFAULT_CHECKPOINT_INTERVAL,
  );

  static from(
    value: CheckpointPolicyConfig | CheckpointPolicy,
  ): CheckpointPolicy {
    if (value instanceof CheckpointPolicy) {
      return value;
    }
    if (typeof value !== 'object' || value === null) {
      throw new WarpError(
        'checkpointPolicy must be an object with { every: number }',
        'E_CHECKPOINT_POLICY_TYPE',
      );
    }
    return new CheckpointPolicy(value.every);
  }
}
