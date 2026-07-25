import { describe, expect, it } from 'vitest';

import PatchCollector, {
  type CheckpointData,
  type PatchWithSha,
} from '../../../../../src/domain/capabilities/PatchCollector.ts';
import PatchError from '../../../../../src/domain/errors/PatchError.ts';
import MaterializationCoordinate from '../../../../../src/domain/materialization/MaterializationCoordinate.ts';
import { replayTargetedNodeProperties } from '../../../../../src/domain/services/controllers/TargetedNodePropertyReplay.ts';
import Patch from '../../../../../src/domain/types/Patch.ts';
import EdgePropSet from '../../../../../src/domain/types/ops/EdgePropSet.ts';
import NodePropSet from '../../../../../src/domain/types/ops/NodePropSet.ts';

const TARGET_NODE = 'node:target';

class ChainPatchCollector extends PatchCollector {
  readonly loadedTips: string[] = [];
  readonly chains: ReadonlyMap<string, readonly PatchWithSha[]>;

  constructor(chains: ReadonlyMap<string, readonly PatchWithSha[]>) {
    super();
    this.chains = chains;
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

  override loadPatchChain(toSha: string, _fromSha?: string | null): Promise<PatchWithSha[]> {
    this.loadedTips.push(toSha);
    return Promise.resolve([...(this.chains.get(toSha) ?? [])]);
  }

  override getFrontier(): Promise<Map<string, string>> {
    return Promise.resolve(new Map());
  }
}

describe('replayTargetedNodeProperties', () => {
  it('selects LWW winners at the exact frontier and ignores unrelated operations', async () => {
    const patches = new ChainPatchCollector(new Map([
      ['tip-a', [
        patchEntry({
          lamport: 3,
          ops: [
            new NodePropSet(TARGET_NODE, 'status', 'writer-a'),
            new NodePropSet('node:other', 'status', 'ignored-node'),
            new EdgePropSet({
              from: TARGET_NODE,
              to: 'node:other',
              label: 'rel',
              key: 'status',
              value: 'ignored-edge',
            }),
          ],
          sha: 'aaaa',
          writer: 'writer-a',
        }),
        patchEntry({
          lamport: 5,
          ops: [new NodePropSet(TARGET_NODE, 'status', 'above-ceiling')],
          sha: 'cccc',
          writer: 'writer-a',
        }),
      ]],
      ['tip-b', [
        patchEntry({
          lamport: 3,
          ops: [
            new NodePropSet(TARGET_NODE, 'status', 'writer-b'),
            new NodePropSet(TARGET_NODE, 'title', 'Target title'),
          ],
          sha: 'bbbb',
          writer: 'writer-b',
        }),
      ]],
    ]));

    const properties = await replayTargetedNodeProperties({
      coordinate: coordinate(new Map([
        ['writer-b', 'tip-b'],
        ['writer-a', 'tip-a'],
      ]), 4),
      nodeId: TARGET_NODE,
      patches,
    });

    expect(properties).toEqual({
      status: 'writer-b',
      title: 'Target title',
    });
    expect(patches.loadedTips).toEqual(['tip-a', 'tip-b']);
  });

  it('uses the original operation index to order writes within one patch', async () => {
    const patches = new ChainPatchCollector(new Map([
      ['tip-a', [
        patchEntry({
          lamport: 2,
          ops: [
            new NodePropSet(TARGET_NODE, 'status', 'first'),
            new NodePropSet('node:other', 'status', 'ignored'),
            new NodePropSet(TARGET_NODE, 'status', 'last'),
          ],
          sha: 'aaaa',
          writer: 'writer-a',
        }),
      ]],
    ]));

    await expect(replayTargetedNodeProperties({
      coordinate: coordinate(new Map([['writer-a', 'tip-a']]), null),
      nodeId: TARGET_NODE,
      patches,
    })).resolves.toEqual({ status: 'last' });
  });

  it('returns a sorted frozen bag with a safe own __proto__ property', async () => {
    const patches = new ChainPatchCollector(new Map([
      ['tip-a', [
        patchEntry({
          lamport: 2,
          ops: [
            new NodePropSet(TARGET_NODE, 'zeta', 3),
            new NodePropSet(TARGET_NODE, '__proto__', 'safe'),
            new NodePropSet(TARGET_NODE, 'alpha', 1),
          ],
          sha: 'aaaa',
          writer: 'writer-a',
        }),
      ]],
    ]));

    const properties = await replayTargetedNodeProperties({
      coordinate: coordinate(new Map([['writer-a', 'tip-a']]), null),
      nodeId: TARGET_NODE,
      patches,
    });

    expect(Object.keys(properties)).toEqual(['__proto__', 'alpha', 'zeta']);
    expect(Object.hasOwn(properties, '__proto__')).toBe(true);
    expect(properties['__proto__']).toBe('safe');
    expect(Object.getPrototypeOf(properties)).toBe(Object.prototype);
    expect(Object.isFrozen(properties)).toBe(true);
  });

  it('returns an empty frozen bag when no target properties exist', async () => {
    const properties = await replayTargetedNodeProperties({
      coordinate: coordinate(new Map(), null),
      nodeId: TARGET_NODE,
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
          ops: [new NodePropSet(TARGET_NODE, 'invalid', undefined)],
          sha: 'aaaa',
          writer: 'writer-a',
        }),
      ]],
    ]));

    await expect(replayTargetedNodeProperties({
      coordinate: coordinate(new Map([['writer-a', 'tip-a']]), null),
      nodeId: TARGET_NODE,
      patches,
    })).rejects.toBeInstanceOf(PatchError);
  });
});

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
