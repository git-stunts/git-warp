import { describe, expect, it } from 'vitest';

import PatchCollector, {
  type CheckpointData,
  type PatchWithSha,
} from '../../../../../src/domain/capabilities/PatchCollector.ts';
import { Dot } from '../../../../../src/domain/crdt/Dot.ts';
import PatchError from '../../../../../src/domain/errors/PatchError.ts';
import MaterializationCoordinate from '../../../../../src/domain/materialization/MaterializationCoordinate.ts';
import { replayTargetedEdgeProperties } from '../../../../../src/domain/services/controllers/TargetedEdgePropertyReplay.ts';
import Patch from '../../../../../src/domain/types/Patch.ts';
import EdgeAdd from '../../../../../src/domain/types/ops/EdgeAdd.ts';
import EdgePropSet from '../../../../../src/domain/types/ops/EdgePropSet.ts';
import NodePropSet from '../../../../../src/domain/types/ops/NodePropSet.ts';

const TARGET_EDGE = {
  from: 'node:source',
  to: 'node:target',
  label: 'rel',
} as const;

class ChainPatchCollector extends PatchCollector {
  readonly loadedTips: string[] = [];
  readonly #chains: ReadonlyMap<string, readonly PatchWithSha[]>;

  constructor(chains: ReadonlyMap<string, readonly PatchWithSha[]>) {
    super();
    this.#chains = chains;
  }

  override discoverWriters(): Promise<string[]> {
    return Promise.resolve([]);
  }

  override loadWriterPatches(_writerId: string): Promise<PatchWithSha[]> {
    return Promise.resolve([]);
  }

  override loadCheckpoint(): Promise<CheckpointData | null> {
    return Promise.resolve(null);
  }

  override loadPatchesSince(_checkpoint: CheckpointData): Promise<PatchWithSha[]> {
    return Promise.resolve([]);
  }

  override loadPatchChain(
    toSha: string,
    _fromSha?: string | null,
  ): Promise<PatchWithSha[]> {
    this.loadedTips.push(toSha);
    return Promise.resolve([...(this.#chains.get(toSha) ?? [])]);
  }

  override getFrontier(): Promise<Map<string, string>> {
    return Promise.resolve(new Map());
  }
}

describe('replayTargetedEdgeProperties', () => {
  it('selects visible LWW winners at the exact frontier after edge rebirth', async () => {
    const patches = new ChainPatchCollector(new Map([
      ['tip-a', [
        patchEntry({
          lamport: 1,
          ops: [
            edgeProp('stale', 'hidden-by-rebirth'),
            new NodePropSet(TARGET_EDGE.from, 'ignored', true),
          ],
          sha: 'aaaa',
          writer: 'writer-a',
        }),
        patchEntry({
          lamport: 3,
          ops: [
            edgeProp('status', 'writer-a'),
            new EdgePropSet({
              from: TARGET_EDGE.from,
              to: 'node:other',
              label: TARGET_EDGE.label,
              key: 'status',
              value: 'ignored-edge',
            }),
          ],
          sha: 'cccc',
          writer: 'writer-a',
        }),
        patchEntry({
          lamport: 5,
          ops: [edgeProp('status', 'above-ceiling')],
          sha: 'eeee',
          writer: 'writer-a',
        }),
      ]],
      ['tip-b', [
        patchEntry({
          lamport: 2,
          ops: [
            new EdgeAdd({
              ...TARGET_EDGE,
              dot: Dot.create('writer-b', 1),
            }),
            edgeProp('born', 'visible'),
          ],
          sha: 'bbbb',
          writer: 'writer-b',
        }),
        patchEntry({
          lamport: 3,
          ops: [edgeProp('status', 'writer-b')],
          sha: 'dddd',
          writer: 'writer-b',
        }),
      ]],
    ]));

    const properties = await replayTargetedEdgeProperties({
      coordinate: coordinate(new Map([
        ['writer-b', 'tip-b'],
        ['writer-a', 'tip-a'],
      ]), 4),
      edge: TARGET_EDGE,
      patches,
    });

    expect(properties).toEqual({
      born: 'visible',
      status: 'writer-b',
    });
    expect(patches.loadedTips).toEqual(['tip-a', 'tip-b']);
  });

  it('uses original operation indexes to order writes within one patch', async () => {
    const patches = new ChainPatchCollector(new Map([
      ['tip-a', [
        patchEntry({
          lamport: 2,
          ops: [
            new EdgeAdd({
              ...TARGET_EDGE,
              dot: Dot.create('writer-a', 1),
            }),
            edgeProp('status', 'first'),
            new NodePropSet(TARGET_EDGE.from, 'ignored', true),
            edgeProp('status', 'last'),
          ],
          sha: 'aaaa',
          writer: 'writer-a',
        }),
      ]],
    ]));

    await expect(replayTargetedEdgeProperties({
      coordinate: coordinate(new Map([['writer-a', 'tip-a']]), null),
      edge: TARGET_EDGE,
      patches,
    })).resolves.toEqual({ status: 'last' });
  });

  it('returns a sorted frozen bag with a safe own __proto__ property', async () => {
    const patches = new ChainPatchCollector(new Map([
      ['tip-a', [
        patchEntry({
          lamport: 2,
          ops: [
            edgeProp('zeta', 3),
            edgeProp('__proto__', 'safe'),
            edgeProp('alpha', 1),
          ],
          sha: 'aaaa',
          writer: 'writer-a',
        }),
      ]],
    ]));

    const properties = await replayTargetedEdgeProperties({
      coordinate: coordinate(new Map([['writer-a', 'tip-a']]), null),
      edge: TARGET_EDGE,
      patches,
    });

    expect(Object.keys(properties)).toEqual(['__proto__', 'alpha', 'zeta']);
    expect(Object.hasOwn(properties, '__proto__')).toBe(true);
    expect(properties['__proto__']).toBe('safe');
    expect(Object.getPrototypeOf(properties)).toBe(Object.prototype);
    expect(Object.isFrozen(properties)).toBe(true);
  });

  it('returns an empty frozen bag when no target properties exist', async () => {
    const properties = await replayTargetedEdgeProperties({
      coordinate: coordinate(new Map(), null),
      edge: TARGET_EDGE,
      patches: new ChainPatchCollector(new Map()),
    });

    expect(properties).toEqual({});
    expect(Object.isFrozen(properties)).toBe(true);
  });

  it('fails closed on an invalid property value', async () => {
    const patches = new ChainPatchCollector(new Map([
      ['tip-a', [
        patchEntry({
          lamport: 2,
          ops: [edgeProp('invalid', undefined)],
          sha: 'aaaa',
          writer: 'writer-a',
        }),
      ]],
    ]));

    await expect(replayTargetedEdgeProperties({
      coordinate: coordinate(new Map([['writer-a', 'tip-a']]), null),
      edge: TARGET_EDGE,
      patches,
    })).rejects.toBeInstanceOf(PatchError);
  });
});

function edgeProp(key: string, value: unknown): EdgePropSet {
  return new EdgePropSet({
    ...TARGET_EDGE,
    key,
    value,
  });
}

function coordinate(
  frontier: Map<string, string>,
  ceiling: number | null,
): MaterializationCoordinate {
  return new MaterializationCoordinate({ frontier, ceiling });
}

function patchEntry(options: {
  readonly lamport: number;
  readonly ops: Patch['ops'];
  readonly sha: string;
  readonly writer: string;
}): PatchWithSha {
  return {
    patch: new Patch({
      schema: 3,
      writer: options.writer,
      lamport: options.lamport,
      context: {},
      ops: options.ops,
    }),
    sha: options.sha,
  };
}
