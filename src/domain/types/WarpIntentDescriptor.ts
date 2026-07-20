/**
 * Unmaterialized intent descriptor types.
 */

import type CodecValue from './codec/CodecValue.ts';

type PrecommitGuardBase = {
  readonly nodeId: string;
  readonly failureTag: string;
};

export type PrecommitGuard =
  | (PrecommitGuardBase & {
      readonly op: 'nodeStatus';
      readonly expected: string;
    })
  | (PrecommitGuardBase & {
      readonly op: 'nodeUnassignedOrSelf';
      readonly agentId: string;
    });

export type SuffixTransform = {
  readonly op: string;
  readonly payload: Readonly<{ readonly [key: string]: CodecValue }>;
};

export type IntentNutritionLabel = {
  readonly bundleHash: string;
  readonly coreHash: string;
  readonly profile: string;
  readonly budget: string;
};

export type WarpIntentDescriptor = {
  readonly intentId: string;
  readonly nutritionLabel: IntentNutritionLabel;
  readonly precommitGuards: readonly PrecommitGuard[];
  readonly suffixTransform: SuffixTransform;
};
