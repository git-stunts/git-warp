import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { Dot } from '../../../src/domain/crdt/Dot.ts';
import { lwwSet } from '../../../src/domain/crdt/LWW.ts';
import { EventId } from '../../../src/domain/utils/EventId.ts';
import { createEmptyState, encodeEdgeKey, encodePropKey } from '../../../src/domain/services/JoinReducer.ts';
import Observer, {
  type ObserverBacking,
  type ObserverConfig,
} from '../../../src/domain/services/query/Observer.ts';
import type { WorldlineSource } from '../../../src/domain/capabilities/QueryCapability.ts';

const observerPath = fileURLToPath(
  new URL('../../../src/domain/services/query/Observer.ts', import.meta.url),
);

type ImportPolicy = {
  readonly modules: ReadonlySet<string>;
  readonly importedNames: ReadonlySet<string>;
  readonly hasUnknownDoubleAssertion: boolean;
};

class HostileObserverBacking implements ObserverBacking {
  readonly calls: string[] = [];

  async hasNode(nodeId: string): Promise<boolean> {
    void nodeId;
    this.fail('hasNode');
  }

  async getNodes(): Promise<string[]> {
    this.fail('getNodes');
  }

  async getNodeProps(nodeId: string): Promise<Readonly<{ [key: string]: string }> | null> {
    void nodeId;
    this.fail('getNodeProps');
  }

  async getEdges(): Promise<[]> {
    this.fail('getEdges');
  }

  async observer(
    name: string,
    config: ObserverConfig,
    options: { source: WorldlineSource },
  ): Promise<Observer> {
    void name;
    void config;
    void options;
    this.fail('observer');
  }

  private fail(methodName: string): never {
    this.calls.push(methodName);
    throw new Error(`Observer should not use live graph backing for snapshot read: ${methodName}`);
  }
}

function parseObserverPolicy(): ImportPolicy {
  const sourceText = readFileSync(observerPath, 'utf8');
  const sourceFile = ts.createSourceFile(observerPath, sourceText, ts.ScriptTarget.Latest, true);
  const modules = new Set<string>();
  const importedNames = new Set<string>();
  let hasUnknownDoubleAssertion = false;

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      modules.add(node.moduleSpecifier.text);
      const namedBindings = node.importClause?.namedBindings;
      if (namedBindings !== undefined && ts.isNamedImports(namedBindings)) {
        for (const element of namedBindings.elements) {
          importedNames.add(element.name.text);
        }
      }
      if (node.importClause?.name !== undefined) {
        importedNames.add(node.importClause.name.text);
      }
    }

    if (ts.isAsExpression(node) && ts.isAsExpression(node.expression)) {
      hasUnknownDoubleAssertion = node.expression.type.kind === ts.SyntaxKind.UnknownKeyword;
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return Object.freeze({
    modules,
    importedNames,
    hasUnknownDoubleAssertion,
  });
}

function createSnapshotObserverState() {
  const state = createEmptyState();
  state.nodeAlive.add('user:alice', Dot.create('writer-a', 1));
  state.nodeAlive.add('user:bob', Dot.create('writer-a', 2));
  state.nodeAlive.add('team:eng', Dot.create('writer-a', 3));
  state.edgeAlive.add(
    encodeEdgeKey('user:alice', 'user:bob', 'follows'),
    Dot.create('writer-a', 4),
  );
  state.edgeAlive.add(
    encodeEdgeKey('user:alice', 'team:eng', 'belongs-to'),
    Dot.create('writer-a', 5),
  );
  state.mutatePropRegisterLWW(
    encodePropKey('user:alice', 'name'),
    lwwSet(new EventId(6, 'writer-a', 'abc1234', 0), 'Alice'),
  );
  state.mutatePropRegisterLWW(
    encodePropKey('user:alice', 'secret'),
    lwwSet(new EventId(7, 'writer-a', 'abc1234', 1), 'redacted'),
  );
  return state;
}

describe('Observer capability seam', () => {
  it('reads snapshot observers through the state-reader capability without live graph fallback', async () => {
    const backing = new HostileObserverBacking();
    const view = new Observer({
      name: 'snapshot-users',
      config: {
        match: 'user:*',
        expose: ['name'],
      },
      graph: backing,
      snapshot: {
        state: createSnapshotObserverState(),
        stateHash: 'snapshot-hash',
      },
    });

    expect(await view.hasNode('user:alice')).toBe(true);
    expect(await view.hasNode('team:eng')).toBe(false);
    expect(await view.getNodes()).toEqual(['user:alice', 'user:bob']);
    expect(await view.getNodeProps('user:alice')).toEqual({ name: 'Alice' });
    expect(await view.getEdges()).toEqual([
      {
        from: 'user:alice',
        to: 'user:bob',
        label: 'follows',
        props: {},
      },
    ]);
    expect(view.stateHash).toBe('snapshot-hash');
    expect('materialize' in backing).toBe(false);
    expect('_runtime' in view).toBe(false);
    expect(backing.calls).toEqual([]);
  });

  it('keeps Observer source policy on StateReader without runtime imports or double assertions', () => {
    const policy = parseObserverPolicy();

    expect(policy.modules.has('../state/StateReader.ts')).toBe(true);
    expect(policy.modules.has('../../WarpRuntime.ts')).toBe(false);
    expect(policy.importedNames.has('WarpRuntime')).toBe(false);
    expect(policy.hasUnknownDoubleAssertion).toBe(false);
  });
});
