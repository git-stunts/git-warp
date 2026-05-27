import WarpError from './errors/WarpError.ts';

export type WarpWorldlineOpticBasisOptions = {
  readonly worldlineName: string;
  readonly checkpointSha: string;
};

export default class WarpWorldlineOpticBasis {
  readonly kind: 'checkpoint-tail-optic-basis' = 'checkpoint-tail-optic-basis';
  readonly worldlineName: string;
  readonly checkpointSha: string;

  constructor(options: WarpWorldlineOpticBasisOptions) {
    assertNonEmpty(options.worldlineName, 'worldlineName');
    assertNonEmpty(options.checkpointSha, 'checkpointSha');
    this.worldlineName = options.worldlineName;
    this.checkpointSha = options.checkpointSha;
    Object.freeze(this);
  }
}

function assertNonEmpty(value: string, field: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WarpError(
      'WarpWorldline optic basis requires non-empty identity fields',
      'E_WARP_WORLDLINE_OPTIC_BASIS',
      { context: { field } },
    );
  }
}
