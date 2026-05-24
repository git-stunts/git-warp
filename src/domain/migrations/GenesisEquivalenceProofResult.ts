import type GenesisEquivalenceProofFailure from './GenesisEquivalenceProofFailure.ts';
import type GenesisEquivalenceProofSuccess from './GenesisEquivalenceProofSuccess.ts';

export type GenesisEquivalenceProofResult =
  | GenesisEquivalenceProofSuccess
  | GenesisEquivalenceProofFailure;
