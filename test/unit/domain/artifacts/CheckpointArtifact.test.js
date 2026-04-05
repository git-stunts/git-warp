import { describe, it, expect } from 'vitest';
import {
  CheckpointArtifact,
  StateArtifact,
  FrontierArtifact,
  AppliedVVArtifact,
} from '../../../../src/domain/artifacts/CheckpointArtifact.js';
import { createVersionVector } from '../../../../src/domain/crdt/VersionVector.js';
import { createEmptyStateV5 } from '../../../../src/domain/services/JoinReducer.js';

describe('CheckpointArtifact family', () => {
  describe('StateArtifact', () => {
    it('constructs with valid fields', () => {
      const a = new StateArtifact({ schemaVersion: 2, state: createEmptyStateV5() });
      expect(a).toBeInstanceOf(StateArtifact);
      expect(a).toBeInstanceOf(CheckpointArtifact);
      expect(a.schemaVersion).toBe(2);
      expect(a.state).toBeDefined();
    });

    it('is frozen', () => {
      const a = new StateArtifact({ schemaVersion: 2, state: createEmptyStateV5() });
      expect(Object.isFrozen(a)).toBe(true);
    });

    it('rejects null state', () => {
      expect(() => new StateArtifact({ schemaVersion: 2, state: /** @type {any} */ (null) })).toThrow('requires a state');
    });

    it('rejects invalid schemaVersion', () => {
      expect(() => new StateArtifact({ schemaVersion: 0, state: createEmptyStateV5() })).toThrow('positive integer');
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
      expect(() => new FrontierArtifact({ schemaVersion: 2, frontier: /** @type {any} */ ({}) })).toThrow('requires a Map');
    });
  });

  describe('AppliedVVArtifact', () => {
    it('constructs with a VersionVector', () => {
      const vv = createVersionVector();
      vv.set('w1', 5);
      const a = new AppliedVVArtifact({ schemaVersion: 2, appliedVV: vv });
      expect(a).toBeInstanceOf(AppliedVVArtifact);
      expect(a).toBeInstanceOf(CheckpointArtifact);
      expect(a.appliedVV.get('w1')).toBe(5);
    });

    it('rejects null appliedVV', () => {
      expect(() => new AppliedVVArtifact({ schemaVersion: 2, appliedVV: /** @type {any} */ (null) })).toThrow('requires an appliedVV');
    });
  });

  describe('instanceof dispatch', () => {
    it('dispatches correctly across all subtypes', () => {
      const state = new StateArtifact({ schemaVersion: 2, state: createEmptyStateV5() });
      const frontier = new FrontierArtifact({ schemaVersion: 2, frontier: new Map() });
      const vv = new AppliedVVArtifact({ schemaVersion: 2, appliedVV: createVersionVector() });

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
