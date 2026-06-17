import { describe, expect, it } from 'vitest';

import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import GitWarpBraidHologram from '../../../../src/domain/continuum/GitWarpBraidHologram.ts';
import GitWarpBraidHologramMember from '../../../../src/domain/continuum/GitWarpBraidHologramMember.ts';
import GitWarpSuffixTransformHologram from '../../../../src/domain/continuum/GitWarpSuffixTransformHologram.ts';
import GitWarpTickHologram from '../../../../src/domain/continuum/GitWarpTickHologram.ts';
import WarpError from '../../../../src/domain/errors/WarpError.ts';
import ProvenancePayload from '../../../../src/domain/services/provenance/ProvenancePayload.ts';
import Patch from '../../../../src/domain/types/Patch.ts';
import { TickReceipt } from '../../../../src/domain/types/TickReceipt.ts';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.ts';

function makePatch(fields: {
  readonly writer: string;
  readonly lamport: number;
  readonly nodeId: string;
}): Patch {
  return new Patch({
    schema: 3,
    writer: fields.writer,
    lamport: fields.lamport,
    context: VersionVector.empty(),
    ops: [new NodeAdd(fields.nodeId, new Dot(fields.writer, fields.lamport))],
    writes: [fields.nodeId],
  });
}

function makeReceipt(fields: {
  readonly patchSha: string;
  readonly writer: string;
  readonly lamport: number;
  readonly nodeId: string;
}): TickReceipt {
  return new TickReceipt({
    patchSha: fields.patchSha,
    writer: fields.writer,
    lamport: fields.lamport,
    ops: [{
      op: 'NodeAdd',
      target: fields.nodeId,
      result: 'applied',
    }],
  });
}

function makePayload(patch: Patch, sha: string): ProvenancePayload {
  return new ProvenancePayload([{ patch, sha }]);
}

describe('git-warp hologram replay semantics', () => {
  it('materializes a tick hologram as one deterministic successor state', () => {
    const patchSha = 'a'.repeat(40);
    const patch = makePatch({ writer: 'writer-a', lamport: 1, nodeId: 'node:a' });
    const hologram = new GitWarpTickHologram({
      patch,
      patchSha,
      receipt: makeReceipt({ patchSha, writer: 'writer-a', lamport: 1, nodeId: 'node:a' }),
    });

    const materialized = hologram.materializeFrom();

    expect(hologram.patchSha).toBe(patchSha);
    expect(hologram.writer).toBe('writer-a');
    expect(hologram.lamport).toBe(1);
    expect(materialized.nodeAlive.contains('node:a')).toBe(true);
  });

  it('materializes a braid hologram by joining deterministic strand replays', () => {
    const alphaPatch = makePatch({ writer: 'writer-alpha', lamport: 1, nodeId: 'node:alpha' });
    const betaPatch = makePatch({ writer: 'writer-beta', lamport: 1, nodeId: 'node:beta' });
    const hologram = new GitWarpBraidHologram({
      settlementId: 'settlement:alpha-beta',
      lawId: 'braid-law:independent-node-adds',
      projectionDigest: 'sha256:projection-alpha-beta',
      proofRef: 'proof:braid-alpha-beta',
      members: [
        new GitWarpBraidHologramMember({
          strandId: 'strand:beta',
          payload: makePayload(betaPatch, 'b'.repeat(40)),
        }),
        new GitWarpBraidHologramMember({
          strandId: 'strand:alpha',
          payload: makePayload(alphaPatch, 'a'.repeat(40)),
        }),
      ],
    });

    const materialized = hologram.materializeFrom();

    expect(hologram.members.map((member) => member.strandId)).toEqual(['strand:alpha', 'strand:beta']);
    expect(materialized.nodeAlive.contains('node:alpha')).toBe(true);
    expect(materialized.nodeAlive.contains('node:beta')).toBe(true);
  });

  it('materializes a suffix-transform hologram from a local basis', () => {
    const localTick = new GitWarpTickHologram({
      patch: makePatch({ writer: 'writer-local', lamport: 1, nodeId: 'node:local' }),
      patchSha: 'c'.repeat(40),
      receipt: makeReceipt({
        patchSha: 'c'.repeat(40),
        writer: 'writer-local',
        lamport: 1,
        nodeId: 'node:local',
      }),
    });
    const remotePatch = makePatch({ writer: 'writer-remote', lamport: 1, nodeId: 'node:remote' });
    const hologram = new GitWarpSuffixTransformHologram({
      sourceFrontierRef: 'frontier:remote',
      basisFrontierRef: 'frontier:local',
      targetFrontierRef: 'frontier:merged',
      transportLawId: 'transport-law:non-conflicting-suffix',
      proofRef: 'proof:suffix-transform',
      payload: makePayload(remotePatch, 'd'.repeat(40)),
    });

    const materialized = hologram.materializeFrom(localTick.materializeFrom());

    expect(hologram.patchCount).toBe(1);
    expect(materialized.nodeAlive.contains('node:local')).toBe(true);
    expect(materialized.nodeAlive.contains('node:remote')).toBe(true);
  });

  it('rejects non-materializable braid and suffix holograms', () => {
    const patch = makePatch({ writer: 'writer-a', lamport: 1, nodeId: 'node:a' });
    const member = new GitWarpBraidHologramMember({
      strandId: 'strand:a',
      payload: makePayload(patch, 'e'.repeat(40)),
    });

    expect(() => new GitWarpBraidHologram({
      settlementId: 'settlement:one',
      lawId: 'braid-law:requires-two',
      projectionDigest: 'sha256:one',
      proofRef: 'proof:one',
      members: [member],
    })).toThrow(WarpError);

    expect(() => new GitWarpSuffixTransformHologram({
      sourceFrontierRef: 'frontier:remote',
      basisFrontierRef: 'frontier:local',
      targetFrontierRef: 'frontier:merged',
      transportLawId: 'transport-law:empty',
      proofRef: 'proof:empty',
      payload: ProvenancePayload.identity(),
    })).toThrow(WarpError);
  });
});
