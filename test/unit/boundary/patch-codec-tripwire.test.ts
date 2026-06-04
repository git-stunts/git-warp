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
import ts from 'typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..', '..');

/**
 * Files that must be codec-free after the P5 dissolution.
 * Add files here as each artifact family is migrated.
 */
const PATCH_FILES = [
  'src/domain/services/PatchBuilder.ts',
  'src/domain/services/sync/syncPatchLoader.ts',
  'src/domain/services/sync/syncDelta.ts',
  'src/domain/services/sync/syncRequestResponse.ts',
  'src/domain/warp/Writer.ts',
];

// Checkpoint files that are already codec-free (CheckpointService routes
// through CheckpointStorePort when available). The serializer files
// (CheckpointSerializer, StateSerializer, Frontier) are NOT yet in
// the tripwire — they still export legacy serialize/deserialize functions
// used by callers that haven't been migrated (MaterializeController,
// BoundaryTransitionRecord, etc.). Add them when ALL callers are migrated.
const CHECKPOINT_FILES = [
  'src/domain/services/state/checkpointHelpers.ts',
  'src/domain/services/state/checkpointCreate.ts',
  'src/domain/services/state/checkpointLoad.ts',
];

const CODEC_RECEIVER_NAMES = new Set(['_codec', 'codec', 'codecOpt']);

type CodecBoundaryViolation = {
  readonly label: string;
  readonly evidence: string;
};

function collectCodecBoundaryViolations(sourcePath: string, sourceText: string): readonly CodecBoundaryViolation[] {
  const sourceFile = ts.createSourceFile(
    sourcePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const violations: CodecBoundaryViolation[] = [];

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node)) {
      collectImportViolation(node, sourceText, violations);
    }
    if (ts.isCallExpression(node)) {
      collectCodecCallViolation(node, sourceText, violations);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

function collectImportViolation(
  node: ts.ImportDeclaration,
  sourceText: string,
  violations: CodecBoundaryViolation[],
): void {
  if (!ts.isStringLiteral(node.moduleSpecifier)) {
    return;
  }
  const modulePath = node.moduleSpecifier.text;
  const defaultImportName = node.importClause?.name?.text;
  if (defaultImportName === 'defaultCodec') {
    violations.push({
      label: 'imports defaultCodec',
      evidence: sourceText.slice(node.getStart(), node.getEnd()),
    });
  }
  if (modulePath.includes('defaultCodec')) {
    violations.push({
      label: 'imports from defaultCodec module',
      evidence: modulePath,
    });
  }
  if (modulePath === 'cbor-x') {
    violations.push({
      label: 'imports cbor-x directly',
      evidence: modulePath,
    });
  }
}

function collectCodecCallViolation(
  node: ts.CallExpression,
  sourceText: string,
  violations: CodecBoundaryViolation[],
): void {
  if (!ts.isPropertyAccessExpression(node.expression)) {
    return;
  }
  const methodName = node.expression.name.text;
  if (methodName !== 'encode' && methodName !== 'decode') {
    return;
  }
  const receiver = node.expression.expression;
  const receiverName = codecReceiverName(receiver);
  if (receiverName === null) {
    return;
  }
  violations.push({
    label: `calls ${receiverName}.${methodName}()`,
    evidence: sourceText.slice(node.expression.getStart(), node.expression.getEnd()),
  });
}

function codecReceiverName(node: ts.Expression): string | null {
  if (ts.isIdentifier(node) && CODEC_RECEIVER_NAMES.has(node.text)) {
    return node.text;
  }
  if (
    ts.isPropertyAccessExpression(node)
    && node.name.text === '_codec'
    && node.expression.kind === ts.SyntaxKind.ThisKeyword
  ) {
    return 'this._codec';
  }
  return null;
}

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

        it('must not import codecs or call codec encode/decode', () => {
          const violations = collectCodecBoundaryViolations(relPath, source);
          expect(
            violations,
            `${relPath} violates P5 codec boundary policy`,
          ).toEqual([]);
        });
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
  'src/domain/services/index/LogicalBitmapIndexBuilder.ts',
  'src/domain/services/index/PropertyIndexBuilder.ts',
  'src/domain/services/index/LogicalIndexBuildService.ts',
];

tripwireSuite('P5 tripwire: patch files must not touch codec/bytes', PATCH_FILES);
tripwireSuite('P5 tripwire: checkpoint files must not touch codec/bytes', CHECKPOINT_FILES);
tripwireSuite('P5 tripwire: index builder files must not touch codec/bytes', INDEX_FILES);
