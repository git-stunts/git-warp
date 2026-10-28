import { describe, expect, it } from 'vitest';

import InMemoryGraphAdapter from '../../../test/helpers/InMemoryGraphAdapter.ts';
import WarpWorldlineCoordinate from '../../../src/domain/WarpWorldlineCoordinate.ts';
import WarpWorldline, { type WarpWorldlinePatchBuild } from '../../../src/domain/WarpWorldline.ts';
import { openMemoryWarpWorldline as openWarpWorldline } from '../../helpers/MemoryRuntimeHost.ts';
import ProjectionHandle from '../../../src/domain/services/ProjectionHandle.ts';
import Observer, { type ObserverBacking } from '../../../src/domain/services/query/Observer.ts';
import { testDerivedIntentAdmissionReceipt } from '../../helpers/intentAdmission.ts';

import type { Aperture } from '../../../src/domain/types/Aperture.ts';
import type { WorldlineSource } from '../../../src/domain/capabilities/QueryCapability.ts';

type ObserverCall = {
  readonly name: string;
  readonly config: Aperture;
  readonly source: WorldlineSource;
};

function isAperture(
  value: Aperture | { readonly source: WorldlineSource } | undefined
): value is Aperture {
  return value !== undefined && 'match' in value;
}

function createObserverBacking(calls: ObserverCall[]): ObserverBacking {
  return {
    hasNode: async () => false,
    getNodes: async () => [],
    getNodeProps: async () => null,
    getEdges: async () => [],
    observer: async (name: string, config: Aperture, options: { source: WorldlineSource }) => {
      calls.push({ name, config, source: options.source });
      return createObserver(name, config, calls, options.source);
    },
  };
}

function createObserver(
  name: string,
  config: Aperture,
  calls: ObserverCall[],
  source: WorldlineSource
): Observer {
  return new Observer({
    name,
    config,
    graph: createObserverBacking(calls),
    source,
  });
}

function createWorldline(calls: ObserverCall[]): ProjectionHandle {
  return new ProjectionHandle({
    graph: {
      observer: async (
        nameOrConfig: string | Aperture,
        configOrOptions?: Aperture | { readonly source: WorldlineSource },
        maybeOptions?: { readonly source: WorldlineSource }
      ) => {
        const name = typeof nameOrConfig === 'string' ? nameOrConfig : 'observer';
        const config =
          typeof nameOrConfig === 'string' ? requireAperture(configOrOptions) : nameOrConfig;
        const options =
          typeof nameOrConfig === 'string'
            ? requireObserverSource(maybeOptions)
            : requireObserverSource(configOrOptions);
        calls.push({ name, config, source: options.source });
        return createObserver(name, config, calls, options.source);
      },
    },
  });
}

function requireAperture(
  value: Aperture | { readonly source: WorldlineSource } | undefined
): Aperture {
  if (isAperture(value)) {
    return value;
  }
  return { match: '*' };
}

function requireObserverSource(
  value: Aperture | { readonly source: WorldlineSource } | undefined
): { readonly source: WorldlineSource } {
  if (value !== undefined && 'source' in value) {
    return value;
  }
  return { source: { kind: 'live' } };
}

function createHandle(
  calls: ObserverCall[] = [],
  commitPatch: (build: WarpWorldlinePatchBuild) => Promise<string> = async () => 'patch-sha'
): WarpWorldline {
  return new WarpWorldline({
    worldlineName: 'events',
    writerId: 'agent-1',
    commitPatch,
    createWorldline: () => createWorldline(calls),
    admitIntent: async (descriptor) => testDerivedIntentAdmissionReceipt(descriptor.intentId),
  });
}

describe('WarpWorldline', () => {
  it('opens a frozen worldline handle over the current graph runtime', async () => {
    const handle = await openWarpWorldline({
      persistence: new InMemoryGraphAdapter(),
      worldlineName: 'events',
      writerId: 'agent-1',
    });

    expect(handle).toBeInstanceOf(WarpWorldline);
    expect(Object.isFrozen(handle)).toBe(true);
    expect(handle.worldlineName).toBe('events');
    expect(handle.writerId).toBe('agent-1');
    expect('graphName' in handle).toBe(false);
    expect('materialize' in handle).toBe(false);
  });

  it('commits through the open helper and reads through the live worldline', async () => {
    const handle = await openWarpWorldline({
      persistence: new InMemoryGraphAdapter(),
      worldlineName: 'events',
      writerId: 'agent-1',
    });

    const sha = await handle.commit((patch) => {
      patch.addNode('user:alice');
    });

    expect(sha.length).toBeGreaterThan(0);
    await expect(handle.live().hasNode('user:alice')).resolves.toBe(true);
  });

  it('does not persist a partial patch when the commit callback fails', async () => {
    const handle = await openWarpWorldline({
      persistence: new InMemoryGraphAdapter(),
      worldlineName: 'events',
      writerId: 'agent-1',
    });

    await expect(
      handle.commit((patch) => {
        patch.addNode('user:bob');
        throw new Error('abort worldline commit');
      })
    ).rejects.toThrow('abort worldline commit');

    await expect(handle.live().hasNode('user:bob')).resolves.toBe(false);
  });

  it('reads live and historical worldline state through the same public handle', async () => {
    const handle = await openWarpWorldline({
      persistence: new InMemoryGraphAdapter(),
      worldlineName: 'events',
      writerId: 'agent-1',
    });

    await handle.commit((patch) => {
      patch.addNode('user:alice');
    });
    await handle.commit((patch) => {
      patch.addNode('user:bob');
    });

    await expect(handle.live().hasNode('user:bob')).resolves.toBe(true);

    const historical = await handle.seek({ source: { kind: 'live', ceiling: 1 } });
    await expect(historical.hasNode('user:alice')).resolves.toBe(true);
    await expect(historical.hasNode('user:bob')).resolves.toBe(false);
  });

  it('pins observer reads to a historical worldline source', async () => {
    const handle = await openWarpWorldline({
      persistence: new InMemoryGraphAdapter(),
      worldlineName: 'events',
      writerId: 'agent-1',
    });

    await handle.commit((patch) => {
      patch.addNode('user:alice');
    });
    await handle.commit((patch) => {
      patch.addNode('internal:secret');
    });

    const historical = await handle.seek({ source: { kind: 'live', ceiling: 1 } });
    const users = await historical.observer('users', { match: 'user:*' });

    await expect(users.hasNode('user:alice')).resolves.toBe(true);
    await expect(users.hasNode('internal:secret')).resolves.toBe(false);
  });

  it('exposes a live optic over the lane cone basis that reads without preparation', async () => {
    const handle = await openWarpWorldline({
      persistence: new InMemoryGraphAdapter(),
      worldlineName: 'events',
      writerId: 'agent-1',
    });

    const optic = handle.optic();

    await expect(optic.node('user:alice').read()).resolves.toMatchObject({
      alive: false,
      readIdentity: { kind: 'cone-read', worldline: 'events' },
    });
  });

  it('rejects empty open identities before returning a handle', async () => {
    await expect(
      openWarpWorldline({
        persistence: new InMemoryGraphAdapter(),
        worldlineName: '',
        writerId: 'agent-1',
      })
    ).rejects.toMatchObject({
      code: 'E_WARP_WORLDLINE_IDENTITY',
      context: { field: 'worldlineName' },
    });
  });

  it('rejects empty writer identity before returning a handle', async () => {
    await expect(
      openWarpWorldline({
        persistence: new InMemoryGraphAdapter(),
        worldlineName: 'events',
        writerId: '',
      })
    ).rejects.toMatchObject({
      code: 'E_WARP_WORLDLINE_IDENTITY',
      context: { field: 'writerId' },
    });
  });

  it('rejects blank writer identity before returning a handle', async () => {
    await expect(
      openWarpWorldline({
        persistence: new InMemoryGraphAdapter(),
        worldlineName: 'events',
        writerId: '   ',
      })
    ).rejects.toMatchObject({
      code: 'E_WARP_WORLDLINE_IDENTITY',
      context: { field: 'writerId' },
    });
  });

  it('reports malformed JavaScript writer identity as WarpError', async () => {
    await expect(
      openWarpWorldline({
        persistence: new InMemoryGraphAdapter(),
        worldlineName: 'events',
        // @ts-expect-error exercising runtime validation for JavaScript callers
        writerId: 42,
      })
    ).rejects.toMatchObject({
      code: 'E_WARP_WORLDLINE_IDENTITY',
      context: { field: 'writerId' },
    });
  });

  it('freezes the worldline-first public handle without materialize escapes', () => {
    const handle = createHandle();

    expect(Object.isFrozen(handle)).toBe(true);
    expect(handle.worldlineName).toBe('events');
    expect(handle.writerId).toBe('agent-1');
    expect('graphName' in handle).toBe(false);
    expect('core' in handle).toBe(false);
    expect('materialize' in handle).toBe(false);
    expect('materializeCoordinate' in handle).toBe(false);
    expect('materializeAt' in handle).toBe(false);
    expect('checkpoint' in handle).toBe(false);
    expect('provenance' in handle).toBe(false);
    expect('strands' in handle).toBe(false);
  });

  it('delegates commit through the injected patch capability seam', async () => {
    let receivedBuild: WarpWorldlinePatchBuild | null = null;
    const build: WarpWorldlinePatchBuild = () => undefined;
    const handle = createHandle([], async (nextBuild) => {
      receivedBuild = nextBuild;
      return 'committed-sha';
    });

    await expect(handle.commit(build)).resolves.toBe('committed-sha');
    expect(receivedBuild).toBe(build);
  });

  it('returns existing ProjectionHandle read handles for live and historical reads', async () => {
    const handle = createHandle();

    expect(handle.live()).toBeInstanceOf(ProjectionHandle);

    const historical = await handle.seek({ source: { kind: 'live', ceiling: 2 } });
    expect(historical).toBeInstanceOf(ProjectionHandle);
    expect(historical.source).toEqual({ kind: 'live', ceiling: 2 });
  });

  it('delegates observer creation through the live worldline', async () => {
    const calls: ObserverCall[] = [];
    const handle = createHandle(calls);
    const aperture = { match: 'user:*', redact: ['ssn'] };

    const observer = await handle.observer('public-users', aperture);

    expect(observer).toBeInstanceOf(Observer);
    expect(observer.name).toBe('public-users');
    expect(calls).toEqual([
      {
        name: 'public-users',
        config: aperture,
        source: { kind: 'live' },
      },
    ]);
  });

  it('rejects named observer creation without aperture config', async () => {
    const handle = createHandle();
    // @ts-expect-error exercising runtime validation for JavaScript callers
    const missingConfig = handle.observer('public-users', undefined);

    await expect(missingConfig).rejects.toMatchObject({
      code: 'E_WARP_WORLDLINE_OBSERVER_CONFIG',
    });
  });

  it('refuses draft operations on a handle opened without draft support', async () => {
    const handle = createHandle();
    const coordinate = new WarpWorldlineCoordinate({
      worldlineName: 'events', coneRoot: 'abcd', frontier: new Map(), createOptic: () => handle.optic(),
    });
    const unavailable = { code: 'E_WARP_WORLDLINE_DRAFT_UNAVAILABLE' };
    await expect(handle.createDraft('draft', coordinate)).rejects.toMatchObject(unavailable);
    await expect(handle.openDraft('draft')).rejects.toMatchObject(unavailable);
    await expect(handle.loadDraftPatchEntries('draft')).rejects.toMatchObject(unavailable);
    await expect(handle.patchDraftWithEvidence('draft', () => undefined)).rejects.toMatchObject(unavailable);
    await expect(handle.previewDraftJoin('draft')).rejects.toMatchObject(unavailable);
    await expect(handle.captureCoordinate()).rejects.toMatchObject({ code: 'E_WARP_WORLDLINE_CONE_UNAVAILABLE' });
    await expect(handle.captureReadCoordinate()).rejects.toMatchObject({ code: 'E_WARP_WORLDLINE_CONE_UNAVAILABLE' });
  });

  it('refuses public optics on a handle whose storage keeps no cone records', () => {
    const handle = createHandle();

    expect(() => handle.optic()).toThrow(expect.objectContaining({ code: 'E_WARP_WORLDLINE_CONE_UNAVAILABLE' }));
  });
});
