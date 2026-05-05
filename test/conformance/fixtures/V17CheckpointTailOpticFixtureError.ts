export default class V17CheckpointTailOpticFixtureError extends Error {
  static readonly CODE = 'E_V17_CHECKPOINT_TAIL_OPTIC_FIXTURE';

  readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = 'V17CheckpointTailOpticFixtureError';
    this.code = V17CheckpointTailOpticFixtureError.CODE;
    Object.freeze(this);
  }
}
