import type ApertureOpeningProof from '../domain/services/wormhole/ApertureOpeningProof.ts';
import type ZKWormholeEdge from '../domain/services/wormhole/ZKWormholeEdge.ts';
import type {
  ApertureOpeningVerificationResult,
  ZKWormholeVerificationResult,
} from '../domain/services/wormhole/ZKWormholeVerificationResult.ts';

/** Port for cold-tier ZK wormhole transition and opening proof verification. */
export default abstract class ZKWormholeProofVerifierPort {
  abstract verifyTransition(edge: ZKWormholeEdge): Promise<ZKWormholeVerificationResult>;

  abstract verifyOpening(
    edge: ZKWormholeEdge,
    opening: ApertureOpeningProof,
  ): Promise<ApertureOpeningVerificationResult>;
}
