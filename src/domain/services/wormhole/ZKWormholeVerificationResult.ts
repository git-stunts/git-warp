import type RejectedApertureOpening from './RejectedApertureOpening.ts';
import type RejectedZKWormhole from './RejectedZKWormhole.ts';
import type VerifiedApertureOpening from './VerifiedApertureOpening.ts';
import type VerifiedZKWormhole from './VerifiedZKWormhole.ts';

export type ZKWormholeVerificationResult = VerifiedZKWormhole | RejectedZKWormhole;

export type ApertureOpeningVerificationResult = VerifiedApertureOpening | RejectedApertureOpening;
