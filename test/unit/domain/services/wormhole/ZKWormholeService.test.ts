import { describe, expect, it } from 'vitest';

import WormholeError from '../../../../../src/domain/errors/WormholeError.ts';
import ApertureOpeningProof from '../../../../../src/domain/services/wormhole/ApertureOpeningProof.ts';
import RejectedApertureOpening from '../../../../../src/domain/services/wormhole/RejectedApertureOpening.ts';
import RejectedZKWormhole from '../../../../../src/domain/services/wormhole/RejectedZKWormhole.ts';
import VerifiedApertureOpening from '../../../../../src/domain/services/wormhole/VerifiedApertureOpening.ts';
import VerifiedZKWormhole from '../../../../../src/domain/services/wormhole/VerifiedZKWormhole.ts';
import ZKWormholeEdge from '../../../../../src/domain/services/wormhole/ZKWormholeEdge.ts';
import { openAperture, verifyZKWormhole } from '../../../../../src/domain/services/wormhole/ZKWormholeService.ts';
import ZKWormholeProofVerifierPort from '../../../../../src/ports/ZKWormholeProofVerifierPort.ts';
import type {
  ApertureOpeningVerificationResult,
  ZKWormholeVerificationResult,
} from '../../../../../src/domain/services/wormhole/ZKWormholeVerificationResult.ts';

class DeterministicVerifier extends ZKWormholeProofVerifierPort {
  readonly expectedStartRoot: string;
  readonly expectedEndRoot: string;

  constructor(fields: {
    readonly expectedStartRoot: string;
    readonly expectedEndRoot: string;
  }) {
    super();
    this.expectedStartRoot = fields.expectedStartRoot;
    this.expectedEndRoot = fields.expectedEndRoot;
    Object.freeze(this);
  }

  verifyTransition(edge: ZKWormholeEdge): Promise<ZKWormholeVerificationResult> {
    if (edge.startStateRoot !== this.expectedStartRoot || edge.endStateRoot !== this.expectedEndRoot) {
      return Promise.resolve(new RejectedZKWormhole(edge, 'state-root-mismatch'));
    }
    return Promise.resolve(new VerifiedZKWormhole(edge));
  }

  verifyOpening(
    edge: ZKWormholeEdge,
    opening: ApertureOpeningProof,
  ): Promise<ApertureOpeningVerificationResult> {
    if (opening.verkleProof.length === 0 || edge.spaceTimeCommitment.length === 0) {
      return Promise.resolve(new RejectedApertureOpening(edge, opening, 'opening-proof-invalid'));
    }
    return Promise.resolve(new VerifiedApertureOpening(edge, opening));
  }
}

function makeEdge(fields: {
  readonly startStateRoot?: string;
  readonly endStateRoot?: string;
} = {}): ZKWormholeEdge {
  return new ZKWormholeEdge({
    fromSha: 'a'.repeat(40),
    toSha: 'b'.repeat(40),
    writerId: 'writer-a',
    startTick: 10,
    endTick: 14,
    startStateRoot: fields.startStateRoot ?? 'state:start',
    endStateRoot: fields.endStateRoot ?? 'state:end',
    spaceTimeCommitment: 'R_ST:test',
    transitionProof: Uint8Array.of(1, 2, 3),
    patchCount: 4,
  });
}

function makeOpening(fields: {
  readonly evaluatedTick?: number;
} = {}): ApertureOpeningProof {
  return new ApertureOpeningProof({
    evaluatedTick: fields.evaluatedTick ?? 12,
    evaluatedNodeId: 'node:a',
    evaluatedValue: Uint8Array.of(7, 8),
    verkleProof: Uint8Array.of(9),
  });
}

describe('ZK wormhole service', () => {
  it('verifies a cold wormhole transition through the verifier port', async () => {
    const edge = makeEdge();
    const verifier = new DeterministicVerifier({
      expectedStartRoot: 'state:start',
      expectedEndRoot: 'state:end',
    });

    const result = await verifyZKWormhole(edge, verifier);

    expect(result).toBeInstanceOf(VerifiedZKWormhole);
  });

  it('returns a rejected transition result for mismatched state roots', async () => {
    const edge = makeEdge({ startStateRoot: 'state:wrong' });
    const verifier = new DeterministicVerifier({
      expectedStartRoot: 'state:start',
      expectedEndRoot: 'state:end',
    });

    const result = await verifyZKWormhole(edge, verifier);

    expect(result).toBeInstanceOf(RejectedZKWormhole);
    if (result instanceof RejectedZKWormhole) {
      expect(result.reason).toBe('state-root-mismatch');
    }
  });

  it('verifies an aperture opening inside the wormhole tick range', async () => {
    const edge = makeEdge();
    const opening = makeOpening();
    const verifier = new DeterministicVerifier({
      expectedStartRoot: 'state:start',
      expectedEndRoot: 'state:end',
    });

    const result = await openAperture(edge, opening, verifier);

    expect(result).toBeInstanceOf(VerifiedApertureOpening);
    if (result instanceof VerifiedApertureOpening) {
      expect([...result.evaluatedValueBytes()]).toEqual([7, 8]);
    }
  });

  it('rejects aperture openings outside the wormhole tick range', async () => {
    const edge = makeEdge();
    const opening = makeOpening({ evaluatedTick: 15 });
    const verifier = new DeterministicVerifier({
      expectedStartRoot: 'state:start',
      expectedEndRoot: 'state:end',
    });

    await expect(openAperture(edge, opening, verifier)).rejects.toThrow(WormholeError);
  });
});
