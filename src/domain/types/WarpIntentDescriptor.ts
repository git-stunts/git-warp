/**
 * Unmaterialized intent descriptor and admission outcome types.
 */

import type StorageRetentionWitness from '../storage/StorageRetentionWitness.ts';
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
    })
  | (PrecommitGuardBase & {
      readonly op: 'edgeExists';
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

export type WarpIntentOutcome = {
  readonly admitted: true;
  readonly sha: string;
  readonly intentId: string;
  readonly retention: StorageRetentionWitness;
} | {
  readonly admitted: false;
  readonly obstruction: {
    readonly tag: string;
    readonly nodeId: string;
    readonly actual: string;
  };
  readonly intentId: string;
};
