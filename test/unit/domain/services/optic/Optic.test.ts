import { describe, expect, it } from 'vitest';
import ContinuumEvidencePosture from '../../../../../src/domain/continuum/ContinuumEvidencePosture.ts';
import QueryError from '../../../../../src/domain/errors/QueryError.ts';
import Optic, { type OpticPostureFields } from '../../../../../src/domain/services/optic/Optic.ts';
import OpticAperturePosture from '../../../../../src/domain/services/optic/OpticAperturePosture.ts';
import OpticBasisPosture from '../../../../../src/domain/services/optic/OpticBasisPosture.ts';
import OpticCoordinatePosture from '../../../../../src/domain/services/optic/OpticCoordinatePosture.ts';
import OpticReadTarget from '../../../../../src/domain/services/optic/OpticReadTarget.ts';
import OpticSupportRule from '../../../../../src/domain/services/optic/OpticSupportRule.ts';

describe('Optic', () => {
  it('constructs a frozen node optic with inspectable runtime posture', () => {
    const optic = Optic.node({
      ...capturedCoordinatePosture(),
      nodeId: 'node:alpha',
    });

    expect(Object.isFrozen(optic)).toBe(true);
    expect(optic.toContextValue()).toEqual({
      opticKind: 'node',
      target: { nodeId: 'node:alpha' },
      coordinatePosture: 'captured-coordinate',
      aperturePosture: 'default-full-read',
      basisPosture: 'checkpoint-tail-basis-verified',
      supportRule: 'exact-entity',
      evidencePosture: 'translated:witnessed:available:complete',
    });
  });

  it('derives property, neighborhood, and traversal optics from one read posture', () => {
    const node = Optic.node({
      ...capturedCoordinatePosture(),
      nodeId: 'node:alpha',
    });

    expect(node.nodeProperty('role').toContextValue()).toMatchObject({
      opticKind: 'node-property',
      target: { nodeId: 'node:alpha', propertyKey: 'role' },
      supportRule: 'exact-entity',
    });
    expect(node.neighborhood().toContextValue()).toMatchObject({
      opticKind: 'neighborhood',
      target: { nodeId: 'node:alpha' },
      supportRule: 'neighborhood',
    });
    expect(node.traversal(OpticSupportRule.traversalWindow()).toContextValue()).toMatchObject({
      opticKind: 'traversal',
      target: { nodeId: 'node:alpha' },
      supportRule: 'traversal-window',
    });
  });

  it('rejects missing basis posture at construction', () => {
    expect(() => {
      // @ts-expect-error runtime guard for JavaScript callers
      new Optic({
        target: OpticReadTarget.node('node:alpha'),
        coordinatePosture: OpticCoordinatePosture.liveOneOff(),
        aperturePosture: OpticAperturePosture.defaultFullRead(),
        supportRule: OpticSupportRule.exactEntity(),
        evidencePosture: ContinuumEvidencePosture.translatedGitWarpEvidence(),
      });
    }).toThrow(QueryError);
  });

  it('rejects support rules that do not match the target kind', () => {
    expect(() => new Optic({
      ...capturedCoordinatePosture(),
      target: OpticReadTarget.node('node:alpha'),
      supportRule: OpticSupportRule.neighborhood(),
    })).toThrow(QueryError);
  });
});

function capturedCoordinatePosture(): OpticPostureFields {
  return {
    coordinatePosture: OpticCoordinatePosture.capturedCoordinate(),
    aperturePosture: OpticAperturePosture.defaultFullRead(),
    basisPosture: OpticBasisPosture.checkpointTailBasisVerified(),
    evidencePosture: ContinuumEvidencePosture.translatedGitWarpEvidence(),
  };
}
