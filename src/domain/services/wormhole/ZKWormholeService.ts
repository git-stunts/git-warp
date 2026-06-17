import ApertureOpeningProof from './ApertureOpeningProof.ts';
import ZKWormholeEdge from './ZKWormholeEdge.ts';
import WarpError from '../../errors/WarpError.ts';
import WormholeError from '../../errors/WormholeError.ts';
import type ZKWormholeProofVerifierPort from '../../../ports/ZKWormholeProofVerifierPort.ts';
import type {
  ApertureOpeningVerificationResult,
  ZKWormholeVerificationResult,
} from './ZKWormholeVerificationResult.ts';

export async function verifyZKWormhole(
  edge: ZKWormholeEdge,
  verifier: ZKWormholeProofVerifierPort,
): Promise<ZKWormholeVerificationResult> {
  return await requireVerifier(verifier).verifyTransition(requireEdge(edge));
}

export async function openAperture(
  edge: ZKWormholeEdge,
  opening: ApertureOpeningProof,
  verifier: ZKWormholeProofVerifierPort,
): Promise<ApertureOpeningVerificationResult> {
  const checkedEdge = requireEdge(edge);
  const checkedOpening = requireOpening(opening);
  requireTickInRange(checkedEdge, checkedOpening.evaluatedTick);
  return await requireVerifier(verifier).verifyOpening(checkedEdge, checkedOpening);
}

function requireEdge(value: ZKWormholeEdge): ZKWormholeEdge {
  if (!(value instanceof ZKWormholeEdge)) {
    throw new WarpError('edge must be a ZKWormholeEdge', 'E_VALIDATION');
  }
  return value;
}

function requireOpening(value: ApertureOpeningProof): ApertureOpeningProof {
  if (!(value instanceof ApertureOpeningProof)) {
    throw new WarpError('opening must be an ApertureOpeningProof', 'E_VALIDATION');
  }
  return value;
}

function requireVerifier(value: ZKWormholeProofVerifierPort): ZKWormholeProofVerifierPort {
  if (
    value === null
    || value === undefined
    || typeof value.verifyTransition !== 'function'
    || typeof value.verifyOpening !== 'function'
  ) {
    throw new WarpError('verifier must be a ZKWormholeProofVerifierPort', 'E_VALIDATION');
  }
  return value;
}

function requireTickInRange(edge: ZKWormholeEdge, tick: number): void {
  if (!edge.containsTick(tick)) {
    throw new WormholeError(`aperture tick ${String(tick)} is outside wormhole range`, {
      code: 'E_WORMHOLE_INVALID_RANGE',
      context: {
        tick,
        startTick: edge.startTick,
        endTick: edge.endTick,
      },
    });
  }
}
