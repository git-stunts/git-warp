/**
 * V7 Contract Guards
 *
 * These tests enforce V7 invariants by failing if legacy engine
 * components are reintroduced. See docs/V7_CONTRACT.md.
 *
 * "Temporary things are forever. Delete, don't wrap."
 */

import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = join(__dirname, '..', '..', 'src');

// Task 0.5 (Schema:1 Extermination) is complete:
// - PatchBuilder.js, Reducer.js, StateSerializer.js have been deleted
// - No schema:1 artifacts are exported from index.js
const SCHEMA1_EXTERMINATION_COMPLETE = true;

// Task 4 (Delete split engine) is COMPLETE:
// - EmptyGraphWrapper.js, GraphService.js have been deleted
// - WarpGraph is the only supported API
const ENGINE_DELETION_COMPLETE = true;

describe('V7 Contract Guards', () => {
  describe('Schema:1 files must not exist', () => {
    const schema1Files = [
      {
        path: 'domain/services/PatchBuilder.js',
        reason: 'Schema:1 patch builder (no dots, no OR-Set)',
      },
      {
        path: 'domain/services/Reducer.js',
        reason: 'Schema:1 LWW reducer (tombstones, not OR-Set)',
      },
      {
        path: 'domain/services/StateSerializer.js',
        reason: 'Schema:1 state serialization',
      },
    ];

    const testFn = SCHEMA1_EXTERMINATION_COMPLETE ? it : it.skip;

    for (const { path, reason } of schema1Files) {
      testFn(`should not contain ${path}`, () => {
        const fullPath = join(srcDir, path);
        const exists = existsSync(fullPath);

        expect(exists, `\n\nV7 CONTRACT VIOLATION\n\nFile exists: ${fullPath}\nReason banned: ${reason}\n\nSee docs/V7_CONTRACT.md for V7 invariants.\n`).toBe(false);
      });
    }
  });

  describe('Legacy engine files must not exist', () => {
    const engineFiles = [
      {
        path: 'domain/EmptyGraphWrapper.js',
        reason: 'Legacy wrapper over commit-per-node engine',
      },
      {
        path: 'domain/services/GraphService.js',
        reason: 'Commit-per-node engine (nodes are commits)',
      },
      {
        path: 'legacy',
        reason: 'Legacy module directory',
      },
    ];

    const testFn = ENGINE_DELETION_COMPLETE ? it : it.skip;

    for (const { path, reason } of engineFiles) {
      testFn(`should not contain ${path}`, () => {
        const fullPath = join(srcDir, path);
        const exists = existsSync(fullPath);

        expect(exists, `\n\nV7 CONTRACT VIOLATION\n\nFile exists: ${fullPath}\nReason banned: ${reason}\n\nSee docs/V7_CONTRACT.md for V7 invariants.\n`).toBe(false);
      });
    }

  });

  describe('Schema:1 must not be exported', () => {
    const exportTestFn = SCHEMA1_EXTERMINATION_COMPLETE ? it : it.skip;

    exportTestFn('should not export PatchBuilder (schema:1)', async () => {
      const indexModule = /** @type {any} */ (await import('../../index.js'));
      expect(indexModule.PatchBuilder).toBeUndefined();
    });

    exportTestFn('should not export Reducer (schema:1)', async () => {
      const indexModule = /** @type {any} */ (await import('../../index.js'));
      expect(indexModule.Reducer).toBeUndefined();
    });

    exportTestFn('should not export createPatch with schema:1 support', async () => {
      const indexModule = /** @type {any} */ (await import('../../index.js'));
      // If createPatch exists, it should only support schema:2
      // This is tested elsewhere; here we just ensure no explicit schema:1 export
      expect(indexModule.createPatchV1).toBeUndefined();
    });

    exportTestFn('should not export StateSerializer (schema:1)', async () => {
      const indexModule = /** @type {any} */ (await import('../../index.js'));
      expect(indexModule.StateSerializer).toBeUndefined();
    });
  });

  describe('V7 required components must exist', () => {
    const requiredFiles = [
      {
        path: 'domain/services/PatchBuilderV2.js',
        reason: 'Schema:2 patch builder with dots and OR-Set',
      },
      {
        path: 'domain/services/JoinReducer.js',
        reason: 'Schema:2 OR-Set reducer',
      },
      {
        path: 'domain/WarpGraph.js',
        reason: 'Main WARP API',
      },
      {
        path: 'domain/crdt/ORSet.js',
        reason: 'OR-Set CRDT implementation',
      },
      {
        path: 'domain/crdt/VersionVector.js',
        reason: 'Version vector for causality',
      },
      {
        path: 'domain/crdt/Dot.js',
        reason: 'Dot notation for unique events',
      },
      {
        path: 'domain/services/WarpStateIndexBuilder.js',
        reason: 'Task 6: Index built from WarpStateV5, not commit DAG',
      },
    ];

    for (const { path, reason } of requiredFiles) {
      it(`should contain ${path}`, () => {
        const fullPath = join(srcDir, path);
        const exists = existsSync(fullPath);

        expect(exists, `\n\nV7 REQUIRED COMPONENT MISSING\n\nFile missing: ${fullPath}\nRequired for: ${reason}\n\nSee docs/V7_CONTRACT.md for V7 invariants.\n`).toBe(true);
      });
    }
  });
});
