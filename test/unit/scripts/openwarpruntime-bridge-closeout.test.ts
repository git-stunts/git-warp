import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { openWarpGraphRuntime } from '../../../src/domain/warp/WarpGraphRuntimeBridge.ts';
import { createInMemoryRepo } from '../../helpers/warpGraphTestUtils.ts';

const bridgePath = fileURLToPath(
  new URL('../../../src/domain/warp/WarpGraphRuntimeBridge.ts', import.meta.url),
);

function collectRetiredRuntimeReferences(sourcePath: string): string[] {
  const sourceText = readFileSync(sourcePath, 'utf8');
  const sourceFile = ts.createSourceFile(sourcePath, sourceText, ts.ScriptTarget.Latest, true);
  const references: string[] = [];

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const moduleSpecifier = node.moduleSpecifier.text;
      if (moduleSpecifier === '../WarpRuntime.ts') {
        references.push(`${sourcePath}: imports retired WarpRuntime module`);
      }
    }

    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      if (node.expression.text === 'openWarpRuntime') {
        references.push(`${sourcePath}: calls retired runtime opener`);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return references;
}

describe('openWarpRuntime bridge closeout', () => {
  it('keeps WarpGraphRuntimeBridge off retired WarpRuntime bridge wiring', () => {
    expect(collectRetiredRuntimeReferences(bridgePath)).toEqual([]);
  });

  it('constructs the graph runtime bridge through the supported host product', async () => {
    const repo = createInMemoryRepo();

    try {
      const runtime = await openWarpGraphRuntime({
        persistence: repo.persistence,
        graphName: 'bridge-closeout',
        writerId: 'alice',
      });

      expect(runtime.graphName).toBe('bridge-closeout');
      expect(runtime.writerId).toBe('alice');
      expect(typeof runtime.hasNode).toBe('function');
      expect(typeof runtime.createPatch).toBe('function');
      expect(Object.isFrozen(runtime)).toBe(true);
    } finally {
      await repo.cleanup();
    }
  });
});
