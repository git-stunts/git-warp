import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Dot } from '../../src/domain/crdt/Dot.ts';
import {
  buildTargetIdentity,
  normalizeConflictOp,
  normalizeEffectPayload,
} from '../../src/domain/services/strand/conflictTargetIdentity.ts';
import NodeAdd from '../../src/domain/types/ops/NodeAdd.ts';
import NodePropSet from '../../src/domain/types/ops/NodePropSet.ts';
import PropSet from '../../src/domain/types/ops/PropSet.ts';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CONFLICT_TARGET_IDENTITY_PATH = 'src/domain/services/strand/conflictTargetIdentity.ts';
const FAKE_MODEL_MANIFEST_PATH = 'policy/quarantines/0025C-fake-models.json';
const quarantineManifestSchema = z.object({
  files: z.array(z.string()),
}).passthrough();

function readRepoFile(path: string): string {
  return readFileSync(join(REPO_ROOT, path), 'utf8');
}

function readManifest(path: string): z.infer<typeof quarantineManifestSchema> {
  const parsed: unknown = JSON.parse(readRepoFile(path));
  return quarantineManifestSchema.parse(parsed);
}

function collectProjectLikeIdentifiers(path: string): readonly string[] {
  const source = readRepoFile(path);
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const identifiers = new Set<string>();

  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && isProjectLikeIdentifier(node.text)) {
      identifiers.add(node.text);
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return [...identifiers].sort((left, right) => left.localeCompare(right));
}

function isProjectLikeIdentifier(name: string): boolean {
  return /^[A-Z][A-Za-z0-9]*Like$/u.test(name);
}

describe('conflict target identity fake-model graduation', () => {
  it('removes conflictTargetIdentity from the 0025C fake-model quarantine', () => {
    const manifest = readManifest(FAKE_MODEL_MANIFEST_PATH);

    expect(manifest.files).not.toContain(CONFLICT_TARGET_IDENTITY_PATH);
  });

  it('keeps the conflict target identity AST free of project *Like placeholders', () => {
    expect(collectProjectLikeIdentifiers(CONFLICT_TARGET_IDENTITY_PATH)).toStrictEqual([]);
  });

  it('normalizes raw property ops into runtime-backed canonical conflict ops', () => {
    const rawOp = new PropSet('node-a', 'color', 'blue');

    const canonicalOp = normalizeConflictOp(rawOp);

    expect(canonicalOp).toBeInstanceOf(NodePropSet);
    if (canonicalOp instanceof NodePropSet) {
      expect(buildTargetIdentity(canonicalOp, '*')).toEqual({
        targetKind: 'node_property',
        entityId: 'node-a',
        propertyKey: 'color',
      });
      expect(normalizeEffectPayload(canonicalOp)).toEqual({ value: 'blue' });
    }
  });

  it('keeps add effects on the runtime Dot instance instead of cloning op-shaped bags', () => {
    const rawOp = new NodeAdd('node-a', new Dot('writer-a', 1));

    const canonicalOp = normalizeConflictOp(rawOp);

    expect(normalizeEffectPayload(canonicalOp)).toEqual({
      dot: new Dot('writer-a', 1),
    });
  });
});
