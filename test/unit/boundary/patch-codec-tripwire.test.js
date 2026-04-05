/**
 * Hex Tripwire Test — Patch Serialization Boundary
 *
 * This test enforces P5: "Serialization Is the Codec's Problem."
 * Domain services must not import defaultCodec, call codec.encode(),
 * or call codec.decode() for patch persistence.
 *
 * When this test fails, it means a domain file is speaking bytes
 * instead of domain objects. Fix the file, not the test.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..', '..');

/**
 * Files that must be codec-free after the P5 dissolution.
 * Add files here as each artifact family is migrated.
 */
const PATCH_FILES = [
  'src/domain/services/PatchBuilderV2.js',
  'src/domain/services/sync/SyncProtocol.js',
  'src/domain/warp/Writer.js',
];

// Checkpoint files that are already codec-free (CheckpointService routes
// through CheckpointStorePort when available). The serializer files
// (CheckpointSerializerV5, StateSerializerV5, Frontier) are NOT yet in
// the tripwire — they still export legacy serialize/deserialize functions
// used by callers that haven't been migrated (MaterializeController,
// BoundaryTransitionRecord, etc.). Add them when ALL callers are migrated.
const CHECKPOINT_FILES = [
  'src/domain/services/state/CheckpointService.js',
];

/**
 * Forbidden patterns in domain files that handle patch persistence.
 * Each pattern indicates bytes leaking into the domain layer.
 */
const FORBIDDEN_PATTERNS = [
  { pattern: /import\s+.*defaultCodec/, label: 'imports defaultCodec' },
  { pattern: /from\s+['"].*defaultCodec/, label: 'imports from defaultCodec module' },
  { pattern: /['"]cbor-x['"]/, label: 'imports cbor-x directly' },
  { pattern: /this\._codec\.encode\(/, label: 'calls this._codec.encode()' },
  { pattern: /this\._codec\.decode\(/, label: 'calls this._codec.decode()' },
  { pattern: /codec\.encode\(/, label: 'calls codec.encode()' },
  { pattern: /codec\.decode\(/, label: 'calls codec.decode()' },
  { pattern: /codecOpt\.encode\(/, label: 'calls codecOpt.encode()' },
  { pattern: /codecOpt\.decode\(/, label: 'calls codecOpt.decode()' },
];

/**
 * Runs tripwire checks on a list of files.
 * @param {string} suiteName
 * @param {string[]} files
 */
function tripwireSuite(suiteName, files) {
  describe(suiteName, () => {
    for (const relPath of files) {
      describe(relPath, () => {
        const absPath = resolve(ROOT, relPath);
        const source = readFileSync(absPath, 'utf-8');

        for (const { pattern, label } of FORBIDDEN_PATTERNS) {
          it(`must not contain: ${label}`, () => {
            const matches = source.match(pattern);
            expect(
              matches,
              `${relPath} violates P5: ${label}\nMatch: ${matches?.[0]}`,
            ).toBeNull();
          });
        }
      });
    }
  });
}

/**
 * Index files that are codec-free after the Slice 3 dissolution.
 * LogicalBitmapIndexBuilder, PropertyIndexBuilder: serialize() deleted,
 * only yieldShards() remains (returns IndexShard domain objects).
 * LogicalIndexBuildService: build() deleted, only buildStream()/buildShards()
 * remain (return IndexShard domain objects).
 */
const INDEX_FILES = [
  'src/domain/services/index/LogicalBitmapIndexBuilder.js',
  'src/domain/services/index/PropertyIndexBuilder.js',
  'src/domain/services/index/LogicalIndexBuildService.js',
];

tripwireSuite('P5 tripwire: patch files must not touch codec/bytes', PATCH_FILES);
tripwireSuite('P5 tripwire: checkpoint files must not touch codec/bytes', CHECKPOINT_FILES);
tripwireSuite('P5 tripwire: index builder files must not touch codec/bytes', INDEX_FILES);
