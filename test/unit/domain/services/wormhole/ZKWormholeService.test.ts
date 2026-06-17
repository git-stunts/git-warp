import { describe, expect, it } from 'vitest';

import WarpError from '../../../../../src/domain/errors/WarpError.ts';
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
    if (opening.evaluatedNodeId === 'node:reject') {
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
  readonly evaluatedNodeId?: string;
} = {}): ApertureOpeningProof {
  return new ApertureOpeningProof({
    evaluatedTick: fields.evaluatedTick ?? 12,
    evaluatedNodeId: fields.evaluatedNodeId ?? 'node:a',
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
      expect([...result.opening.verkleProofBytes()]).toEqual([9]);
    }
  });

  it('returns a rejected aperture-opening result from the verifier port', async () => {
    const edge = makeEdge();
    const opening = makeOpening({ evaluatedNodeId: 'node:reject' });
    const verifier = new DeterministicVerifier({
      expectedStartRoot: 'state:start',
      expectedEndRoot: 'state:end',
    });

    const result = await openAperture(edge, opening, verifier);

    expect(result).toBeInstanceOf(RejectedApertureOpening);
    if (result instanceof RejectedApertureOpening) {
      expect(result.reason).toBe('opening-proof-invalid');
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

  it('rejects invalid ZK wormhole edge fields', () => {
    const edge = makeEdge();

    expect(edge.containsTick(10)).toBe(true);
    expect(edge.containsTick(10.5)).toBe(false);
    expect([...edge.transitionProofBytes()]).toEqual([1, 2, 3]);

    expect(() => new ZKWormholeEdge(
      // @ts-expect-error runtime guard for JavaScript callers
      undefined,
    )).toThrow(WarpError);

    expect(() => new ZKWormholeEdge({
      fromSha: '',
      toSha: 'b'.repeat(40),
      writerId: 'writer-a',
      startTick: 10,
      endTick: 14,
      startStateRoot: 'state:start',
      endStateRoot: 'state:end',
      spaceTimeCommitment: 'R_ST:test',
      transitionProof: Uint8Array.of(1),
      patchCount: 1,
    })).toThrow(WarpError);

    expect(() => new ZKWormholeEdge({
      fromSha: 'a'.repeat(40),
      toSha: 'b'.repeat(40),
      writerId: 'writer-a',
      startTick: 10,
      endTick: 9,
      startStateRoot: 'state:start',
      endStateRoot: 'state:end',
      spaceTimeCommitment: 'R_ST:test',
      transitionProof: Uint8Array.of(1),
      patchCount: 1,
    })).toThrow(WarpError);

    expect(() => new ZKWormholeEdge({
      fromSha: 'a'.repeat(40),
      toSha: 'b'.repeat(40),
      writerId: 'writer-a',
      startTick: -1,
      endTick: 9,
      startStateRoot: 'state:start',
      endStateRoot: 'state:end',
      spaceTimeCommitment: 'R_ST:test',
      transitionProof: Uint8Array.of(1),
      patchCount: 1,
    })).toThrow(WarpError);

    expect(() => new ZKWormholeEdge({
      fromSha: 'a'.repeat(40),
      toSha: 'b'.repeat(40),
      writerId: 'writer-a',
      startTick: 10,
      endTick: 14,
      startStateRoot: 'state:start',
      endStateRoot: 'state:end',
      spaceTimeCommitment: 'R_ST:test',
      transitionProof: Uint8Array.of(),
      patchCount: 1,
    })).toThrow(WarpError);

    expect(() => new ZKWormholeEdge({
      fromSha: 'a'.repeat(40),
      toSha: 'b'.repeat(40),
      writerId: 'writer-a',
      startTick: 10,
      endTick: 14,
      startStateRoot: 'state:start',
      endStateRoot: 'state:end',
      spaceTimeCommitment: 'R_ST:test',
      transitionProof: Uint8Array.of(1),
      patchCount: 0,
    })).toThrow(WarpError);
  });

  it('rejects invalid aperture-opening and verifier boundary values', async () => {
    const edge = makeEdge();
    const opening = makeOpening();
    const verifier = new DeterministicVerifier({
      expectedStartRoot: 'state:start',
      expectedEndRoot: 'state:end',
    });

    expect(() => new ApertureOpeningProof(
      // @ts-expect-error runtime guard for JavaScript callers
      undefined,
    )).toThrow(WarpError);

    expect(() => new ApertureOpeningProof({
      evaluatedTick: -1,
      evaluatedNodeId: 'node:a',
      evaluatedValue: Uint8Array.of(1),
      verkleProof: Uint8Array.of(2),
    })).toThrow(WarpError);

    expect(() => new ApertureOpeningProof({
      evaluatedTick: 1,
      evaluatedNodeId: '',
      evaluatedValue: Uint8Array.of(1),
      verkleProof: Uint8Array.of(2),
    })).toThrow(WarpError);

    expect(() => new ApertureOpeningProof({
      evaluatedTick: 1,
      evaluatedNodeId: 'node:a',
      // @ts-expect-error runtime guard for JavaScript callers
      evaluatedValue: [1],
      verkleProof: Uint8Array.of(2),
    })).toThrow(WarpError);

    expect(() => new ApertureOpeningProof({
      evaluatedTick: 1,
      evaluatedNodeId: 'node:a',
      evaluatedValue: Uint8Array.of(1),
      verkleProof: Uint8Array.of(),
    })).toThrow(WarpError);

    await expect(verifyZKWormhole(
      // @ts-expect-error runtime guard for JavaScript callers
      opening,
      verifier,
    )).rejects.toThrow(WarpError);

    await expect(openAperture(
      edge,
      // @ts-expect-error runtime guard for JavaScript callers
      edge,
      verifier,
    )).rejects.toThrow(WarpError);

    await expect(openAperture(
      edge,
      opening,
      // @ts-expect-error runtime guard for JavaScript callers
      undefined,
    )).rejects.toThrow(WarpError);
  });

  it('rejects invalid verification result wrapper construction', () => {
    const edge = makeEdge();
    const opening = makeOpening();

    expect(() => new VerifiedZKWormhole(
      // @ts-expect-error runtime guard for JavaScript callers
      opening,
    )).toThrow(WarpError);

    expect(() => new RejectedZKWormhole(edge, '')).toThrow(WarpError);

    expect(() => new VerifiedApertureOpening(
      // @ts-expect-error runtime guard for JavaScript callers
      opening,
      opening,
    )).toThrow(WarpError);

    expect(() => new VerifiedApertureOpening(
      edge,
      // @ts-expect-error runtime guard for JavaScript callers
      edge,
    )).toThrow(WarpError);

    expect(() => new RejectedApertureOpening(
      // @ts-expect-error runtime guard for JavaScript callers
      opening,
      opening,
      'invalid-edge',
    )).toThrow(WarpError);

    expect(() => new RejectedApertureOpening(
      edge,
      // @ts-expect-error runtime guard for JavaScript callers
      edge,
      'invalid-opening',
    )).toThrow(WarpError);

    expect(() => new RejectedApertureOpening(edge, opening, '')).toThrow(WarpError);
  });
});
