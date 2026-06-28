/**
 * Unmaterialized intent descriptor and admission outcome types.
 */

export type PrecommitGuard = {
  readonly op: 'nodeStatus' | 'nodeUnassignedOrSelf' | 'edgeExists';
  readonly nodeId: string;
  readonly expected?: string;
  readonly agentId?: string;
  readonly failureTag: string;
};

export type SuffixTransform = {
  readonly op: string;
  readonly payload: Record<string, unknown>;
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
} | {
  readonly admitted: false;
  readonly obstruction: {
    readonly tag: string;
    readonly nodeId: string;
    readonly actual: string;
  };
  readonly intentId: string;
};
