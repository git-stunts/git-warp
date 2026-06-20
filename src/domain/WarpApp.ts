import WarpCore from './WarpCore.ts';
import WarpError from './errors/WarpError.ts';

import type { Aperture } from './types/Aperture.ts';
import type {
  ObserverOptions,
  WorldlineOptions,
  TranslationCostResult,
} from './capabilities/QueryCapability.ts';
import type {
  SyncWithOptions,
  SyncWithResult,
} from './capabilities/SyncCapability.ts';
import type {
  SubscribeOptions,
  SubscriptionHandle,
  WatchOptions,
} from './capabilities/SubscriptionCapability.ts';
import type Observer from './services/query/Observer.ts';
import type ProjectionHandle from './services/ProjectionHandle.ts';
import type { Writer } from './warp/Writer.ts';
import type { PatchBuilder } from './services/PatchBuilder.ts';

type ContentMeta = Awaited<ReturnType<WarpCore['getContentMeta']>>;
type PatchBuild = (patch: PatchBuilder) => void | Promise<void>;
type AppSurface = {
  graphName: string;
  writerId: string;
  writer(writerId?: string): Promise<Writer>;
  createPatch(): Promise<PatchBuilder>;
  patch(build: PatchBuild): Promise<string>;
  patchMany(...builds: PatchBuild[]): Promise<string[]>;
  syncWith(remote: string | AppSurface, options?: SyncWithOptions): Promise<SyncWithResult>;
  worldline(options?: WorldlineOptions): ProjectionHandle;
  observer(
    nameOrConfig: string | Aperture,
    configOrOptions?: Aperture | ObserverOptions,
    options?: ObserverOptions,
  ): Promise<Observer>;
  translationCost(configA: Aperture, configB: Aperture): Promise<TranslationCostResult>;
  subscribe(options: SubscribeOptions): SubscriptionHandle;
  watch(pattern: string | string[], options: WatchOptions): SubscriptionHandle;
  getContent(nodeId: string): Promise<Uint8Array | null>;
  getContentStream(nodeId: string): Promise<AsyncIterable<Uint8Array> | null>;
  getContentOid(nodeId: string): Promise<string | null>;
  getContentMeta(nodeId: string): Promise<ContentMeta>;
  getEdgeContent(from: string, to: string, label: string): Promise<Uint8Array | null>;
  getEdgeContentStream(from: string, to: string, label: string): Promise<AsyncIterable<Uint8Array> | null>;
  getEdgeContentOid(from: string, to: string, label: string): Promise<string | null>;
  getEdgeContentMeta(from: string, to: string, label: string): Promise<ContentMeta>;
};

type UnwrappedSyncRemote = string | AppSurface;

const APP_SURFACE_METHOD_NAMES = Object.freeze([
  'writer',
  'createPatch',
  'patch',
  'patchMany',
  'syncWith',
  'worldline',
  'observer',
  'translationCost',
  'subscribe',
  'watch',
]);

function hasFunction(value: object, name: string): boolean {
  return typeof Reflect.get(value, name) === 'function';
}

function hasString(value: object, name: string): boolean {
  return typeof Reflect.get(value, name) === 'string';
}

function isAppSurface(value: object): value is AppSurface {
  return (
    hasString(value, 'graphName') &&
    hasString(value, 'writerId') &&
    APP_SURFACE_METHOD_NAMES.every((name) => hasFunction(value, name))
  );
}

function requireAppSurface(core: WarpCore, code: string): AppSurface {
  if (isAppSurface(core)) {
    return core;
  }

  throw new WarpError('WarpApp requires a capability-backed WarpCore surface', code);
}

/**
 * Legacy curated WARP application surface.
 *
 * `WarpApp` remains supported for compatibility with existing application
 * builders and agentic CLI usage. New application code should open a named
 * worldline with openWarpWorldline() and keep substrate access out of the
 * first-use path.
 *
 * @deprecated For new application workflows, use openWarpWorldline(). WarpApp
 * remains supported as a compatibility facade while graph-first APIs migrate
 * to worldline/optic-first docs.
 */
export default class WarpApp {
  private readonly _core: WarpCore;

  constructor(core: WarpCore) {
    this._core = core;
  }

  static async open(options: Parameters<typeof WarpCore.open>[0]): Promise<WarpApp> {
    return new WarpApp(await WarpCore.open(options));
  }

  get graphName(): string {
    return this._surface().graphName;
  }

  get writerId(): string {
    return this._surface().writerId;
  }

  core(): WarpCore {
    return this._core;
  }

  _surface(): AppSurface {
    return requireAppSurface(this._core, 'E_WARP_APP_SURFACE');
  }

  async writer(writerId?: string): Promise<Writer> {
    return await this._surface().writer(writerId);
  }

  async createPatch(): Promise<PatchBuilder> {
    return await this._surface().createPatch();
  }

  async patch(
    build: PatchBuild,
  ): Promise<string> {
    return await this._surface().patch(build);
  }

  async patchMany(
    ...builds: PatchBuild[]
  ): Promise<string[]> {
    return await this._surface().patchMany(...builds);
  }

  async syncWith(
    remote: string | WarpApp | WarpCore,
    options?: SyncWithOptions,
  ): Promise<SyncWithResult> {
    return await this._surface().syncWith(unwrapSyncRemote(remote), options);
  }

  worldline(options?: WorldlineOptions): ProjectionHandle {
    return this._surface().worldline(options);
  }

  async observer(config: Aperture, options?: ObserverOptions): Promise<Observer>;
  async observer(name: string, config: Aperture, options?: ObserverOptions): Promise<Observer>;
  async observer(
    nameOrConfig: string | Aperture,
    configOrOptions?: Aperture | ObserverOptions,
    maybeOptions?: ObserverOptions,
  ): Promise<Observer> {
    if (typeof nameOrConfig === 'string') {
      return await this._surface().observer(nameOrConfig, configOrOptions, maybeOptions);
    }

    return await this._surface().observer(nameOrConfig, configOrOptions);
  }

  async translationCost(
    configA: Aperture,
    configB: Aperture,
  ): Promise<TranslationCostResult> {
    return await this._surface().translationCost(configA, configB);
  }

  subscribe(options: SubscribeOptions): SubscriptionHandle {
    return this._surface().subscribe(options);
  }

  watch(pattern: string | string[], options: WatchOptions): SubscriptionHandle {
    return this._surface().watch(pattern, options);
  }

  async getContent(nodeId: string): Promise<Uint8Array | null> {
    return await this._surface().getContent(nodeId);
  }

  async getContentStream(nodeId: string): Promise<AsyncIterable<Uint8Array> | null> {
    return await this._surface().getContentStream(nodeId);
  }

  async getContentOid(nodeId: string): Promise<string | null> {
    return await this._surface().getContentOid(nodeId);
  }

  async getContentMeta(nodeId: string): Promise<ContentMeta> {
    return await this._surface().getContentMeta(nodeId);
  }

  async getEdgeContent(from: string, to: string, label: string): Promise<Uint8Array | null> {
    return await this._surface().getEdgeContent(from, to, label);
  }

  async getEdgeContentStream(from: string, to: string, label: string): Promise<AsyncIterable<Uint8Array> | null> {
    return await this._surface().getEdgeContentStream(from, to, label);
  }

  async getEdgeContentOid(from: string, to: string, label: string): Promise<string | null> {
    return await this._surface().getEdgeContentOid(from, to, label);
  }

  async getEdgeContentMeta(from: string, to: string, label: string): Promise<ContentMeta> {
    return await this._surface().getEdgeContentMeta(from, to, label);
  }

  async createStrand(options?: Parameters<WarpCore['createStrand']>[0]): Promise<Awaited<ReturnType<WarpCore['createStrand']>>> {
    return await this.core().createStrand(options);
  }

  async getStrand(strandId: string): Promise<Awaited<ReturnType<WarpCore['getStrand']>>> {
    return await this.core().getStrand(strandId);
  }

  async listStrands(): Promise<Awaited<ReturnType<WarpCore['listStrands']>>> {
    return await this.core().listStrands();
  }

  async braidStrand(
    strandId: string,
    options?: Parameters<WarpCore['braidStrand']>[1],
  ): Promise<Awaited<ReturnType<WarpCore['braidStrand']>>> {
    return await this.core().braidStrand(strandId, options);
  }

  async dropStrand(strandId: string): Promise<Awaited<ReturnType<WarpCore['dropStrand']>>> {
    return await this.core().dropStrand(strandId);
  }

  async createStrandPatch(strandId: string): Promise<Awaited<ReturnType<WarpCore['createStrandPatch']>>> {
    return await this.core().createStrandPatch(strandId);
  }

  async patchStrand(
    strandId: string,
    build: Parameters<WarpCore['patchStrand']>[1],
  ): Promise<Awaited<ReturnType<WarpCore['patchStrand']>>> {
    return await this.core().patchStrand(strandId, build);
  }

  async queueStrandIntent(
    strandId: string,
    build: Parameters<WarpCore['queueStrandIntent']>[1],
  ): Promise<Awaited<ReturnType<WarpCore['queueStrandIntent']>>> {
    return await this.core().queueStrandIntent(strandId, build);
  }

  async listStrandIntents(
    strandId: string,
  ): Promise<Awaited<ReturnType<WarpCore['listStrandIntents']>>> {
    return await this.core().listStrandIntents(strandId);
  }

  async tickStrand(strandId: string): Promise<Awaited<ReturnType<WarpCore['tickStrand']>>> {
    return await this.core().tickStrand(strandId);
  }
}

function unwrapSyncRemote(remote: string | WarpApp | WarpCore): UnwrappedSyncRemote {
  if (typeof remote === 'string') {
    return remote;
  }

  if (remote instanceof WarpApp) {
    return remote._surface();
  }

  if (isAppSurface(remote)) {
    return remote;
  }

  throw new WarpError('WarpApp sync requires a capability-backed WarpCore peer', 'E_WARP_APP_SYNC_REMOTE');
}
