import type WorldlineOptic from './services/optic/WorldlineOptic.ts';

export type WarpStrandOpticBasis = Readonly<{
  readonly checkpointSha: string;
  readonly frontierEntries: readonly Readonly<{
    readonly patchSha: string;
    readonly writerId: string;
  }>[];
  readonly optic: WorldlineOptic;
}>;
