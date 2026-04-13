import { describe, it, expect } from 'vitest';
import { CheckpointArtifact } from '../../../../src/domain/artifacts/CheckpointArtifact.ts';
import { StateArtifact } from '../../../../src/domain/artifacts/StateArtifact.ts';
import { FrontierArtifact } from '../../../../src/domain/artifacts/FrontierArtifact.ts';
import { AppliedVVArtifact } from '../../../../src/domain/artifacts/AppliedVVArtifact.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import { createEmptyState } from '../../../../src/domain/services/JoinReducer.ts';

describe('CheckpointArtifact family', () => {
  describe('StateArtifact', () => {
    it('constructs with valid fields', () => {
      const a = new StateArtifact({ schemaVersion: 2, state: createEmptyState() });
      expect(a).toBeInstanceOf(StateArtifact);
      expect(a).toBeInstanceOf(CheckpointArtifact);
      expect(a.schemaVersion).toBe(2);
      expect(a.state).toBeDefined();
    });

    it('is frozen', () => {
      const a = new StateArtifact({ schemaVersion: 2, state: createEmptyState() });
      expect(Object.isFrozen(a)).toBe(true);
    });

    it('rejects null state', () => {
      expect(() => new StateArtifact({ schemaVersion: 2, state: (null) })).toThrow('requires a state');
    });

    it('rejects invalid schemaVersion', () => {
      expect(() => new StateArtifact({ schemaVersion: 0, state: createEmptyState() })).toThrow('positive integer');
    });
  });

  describe('FrontierArtifact', () => {
    it('constructs with a Map', () => {
      const a = new FrontierArtifact({ schemaVersion: 2, frontier: new Map([['w1', 'abc']]) });
      expect(a).toBeInstanceOf(FrontierArtifact);
      expect(a).toBeInstanceOf(CheckpointArtifact);
      expect(a.frontier.get('w1')).toBe('abc');
    });

    it('rejects non-Map frontier', () => {
      expect(() => new FrontierArtifact({ schemaVersion: 2, frontier: ({} as any) })).toThrow('requires a Map');
    });
  });

  describe('AppliedVVArtifact', () => {
    it('constructs with a VersionVector', () => {
      const vv = VersionVector.empty();
      vv.set('w1', 5);
      const a = new AppliedVVArtifact({ schemaVersion: 2, appliedVV: vv });
      expect(a).toBeInstanceOf(AppliedVVArtifact);
      expect(a).toBeInstanceOf(CheckpointArtifact);
      expect(a.appliedVV.get('w1')).toBe(5);
    });

    it('rejects null appliedVV', () => {
      expect(() => new AppliedVVArtifact({ schemaVersion: 2, appliedVV: (null) })).toThrow('requires an appliedVV');
    });
  });

  describe('instanceof dispatch', () => {
    it('dispatches correctly across all subtypes', () => {
      const state = new StateArtifact({ schemaVersion: 2, state: createEmptyState() });
      const frontier = new FrontierArtifact({ schemaVersion: 2, frontier: new Map() });
      const vv = new AppliedVVArtifact({ schemaVersion: 2, appliedVV: VersionVector.empty() });

      expect(state instanceof StateArtifact).toBe(true);
      expect(state instanceof FrontierArtifact).toBe(false);
      expect(frontier instanceof FrontierArtifact).toBe(true);
      expect(frontier instanceof StateArtifact).toBe(false);
      expect(vv instanceof AppliedVVArtifact).toBe(true);

      // All are CheckpointArtifact
      expect(state instanceof CheckpointArtifact).toBe(true);
      expect(frontier instanceof CheckpointArtifact).toBe(true);
      expect(vv instanceof CheckpointArtifact).toBe(true);
    });
  });
});
