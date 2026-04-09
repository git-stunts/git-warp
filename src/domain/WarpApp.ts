import WarpCore from './WarpCore.ts';
import WarpError from './errors/WarpError.ts';
import { callInternalRuntimeMethod } from './utils/callInternalRuntimeMethod.ts';

import type WarpRuntime from './WarpRuntime.js';
import type { Aperture, Observer, ObserverOptions } from '../../index.js';

type RuntimeBackedCore = WarpCore & {
  graphName: WarpRuntime['graphName'];
  writerId: WarpRuntime['writerId'];
  writer: WarpRuntime['writer'];
  createPatch: WarpRuntime['createPatch'];
  patch: WarpRuntime['patch'];
  patchMany: WarpRuntime['patchMany'];
  syncWith(
    remote: string | RuntimeBackedCore,
    options?: Parameters<WarpRuntime['syncWith']>[1],
  ): ReturnType<WarpRuntime['syncWith']>;
  worldline: WarpRuntime['worldline'];
  observer(
    nameOrConfig: string | Aperture,
    configOrOptions?: Aperture | ObserverOptions,
    options?: ObserverOptions,
  ): Promise<Observer>;
  translationCost: WarpRuntime['translationCost'];
  subscribe: WarpRuntime['subscribe'];
  watch: WarpRuntime['watch'];
};

type ContentMeta = Awaited<ReturnType<WarpCore['getContentMeta']>>;
type AppSyncOptions = Parameters<RuntimeBackedCore['syncWith']>[1];
type AppWorldlineOptions = Parameters<RuntimeBackedCore['worldline']>[0];
type AppWorldline = ReturnType<RuntimeBackedCore['worldline']>;
type AppTranslationCost = ReturnType<RuntimeBackedCore['translationCost']>;
type AppSubscription = ReturnType<RuntimeBackedCore['subscribe']>;
type AppWatch = ReturnType<RuntimeBackedCore['watch']>;
type UnwrappedSyncRemote = string | RuntimeBackedCore;

const RUNTIME_METHOD_NAMES = Object.freeze([
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

function isRuntimeBackedCore(value: object): value is RuntimeBackedCore {
  return (
    hasString(value, 'graphName') &&
    hasString(value, 'writerId') &&
    RUNTIME_METHOD_NAMES.every((name) => hasFunction(value, name))
  );
}

function requireRuntimeBackedCore(core: WarpCore, code: string): RuntimeBackedCore {
  if (isRuntimeBackedCore(core)) {
    return core;
  }

  throw new WarpError('WarpApp requires a runtime-backed WarpCore', code);
}

/**
 * Curated product-facing WARP surface.
 *
 * `WarpApp` is the default entrypoint for application builders, agentic CLI
 * usage, and other flows that should prefer worldlines, lenses, observers,
 * strands, and explicit sync over whole-state replay mechanics.
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
    return this._runtime().graphName;
  }

  get writerId(): string {
    return this._runtime().writerId;
  }

  core(): WarpCore {
    return this._core;
  }

  _runtime(): RuntimeBackedCore {
    return requireRuntimeBackedCore(this._core, 'E_WARP_APP_RUNTIME');
  }

  async writer(writerId?: string): Promise<Awaited<ReturnType<RuntimeBackedCore['writer']>>> {
    return await this._runtime().writer(writerId);
  }

  async createPatch(): Promise<Awaited<ReturnType<RuntimeBackedCore['createPatch']>>> {
    return await this._runtime().createPatch();
  }

  async patch(
    build: Parameters<RuntimeBackedCore['patch']>[0],
  ): Promise<Awaited<ReturnType<RuntimeBackedCore['patch']>>> {
    return await this._runtime().patch(build);
  }

  async patchMany(
    ...builds: Parameters<RuntimeBackedCore['patchMany']>
  ): Promise<Awaited<ReturnType<RuntimeBackedCore['patchMany']>>> {
    return await this._runtime().patchMany(...builds);
  }

  async syncWith(
    remote: string | WarpApp | WarpCore,
    options?: AppSyncOptions,
  ): Promise<Awaited<ReturnType<RuntimeBackedCore['syncWith']>>> {
    return await this._runtime().syncWith(unwrapSyncRemote(remote), options);
  }

  worldline(options?: AppWorldlineOptions): AppWorldline {
    return this._runtime().worldline(options);
  }

  async observer(config: Aperture, options?: ObserverOptions): Promise<Observer>;
  async observer(name: string, config: Aperture, options?: ObserverOptions): Promise<Observer>;
  async observer(
    nameOrConfig: string | Aperture,
    configOrOptions?: Aperture | ObserverOptions,
    maybeOptions?: ObserverOptions,
  ): Promise<Observer> {
    if (typeof nameOrConfig === 'string') {
      return await this._runtime().observer(nameOrConfig, configOrOptions, maybeOptions);
    }

    return await this._runtime().observer(nameOrConfig, configOrOptions);
  }

  async translationCost(
    configA: Parameters<RuntimeBackedCore['translationCost']>[0],
    configB: Parameters<RuntimeBackedCore['translationCost']>[1],
  ): Promise<Awaited<AppTranslationCost>> {
    return await this._runtime().translationCost(configA, configB);
  }

  subscribe(options: Parameters<RuntimeBackedCore['subscribe']>[0]): AppSubscription {
    return this._runtime().subscribe(options);
  }

  watch(pattern: string | string[], options: Parameters<RuntimeBackedCore['watch']>[1]): AppWatch {
    return this._runtime().watch(pattern, options);
  }

  async getContent(nodeId: string): Promise<Uint8Array | null> {
    return await callInternalRuntimeMethod<Uint8Array | null>(this._runtime(), 'getContent', nodeId);
  }

  async getContentStream(nodeId: string): Promise<AsyncIterable<Uint8Array> | null> {
    return await callInternalRuntimeMethod<AsyncIterable<Uint8Array> | null>(this._runtime(), 'getContentStream', nodeId);
  }

  async getContentOid(nodeId: string): Promise<string | null> {
    return await callInternalRuntimeMethod<string | null>(this._runtime(), 'getContentOid', nodeId);
  }

  async getContentMeta(nodeId: string): Promise<ContentMeta> {
    return await callInternalRuntimeMethod<ContentMeta>(this._runtime(), 'getContentMeta', nodeId);
  }

  async getEdgeContent(from: string, to: string, label: string): Promise<Uint8Array | null> {
    return await callInternalRuntimeMethod<Uint8Array | null>(this._runtime(), 'getEdgeContent', from, to, label);
  }

  async getEdgeContentStream(from: string, to: string, label: string): Promise<AsyncIterable<Uint8Array> | null> {
    return await callInternalRuntimeMethod<AsyncIterable<Uint8Array> | null>(this._runtime(), 'getEdgeContentStream', from, to, label);
  }

  async getEdgeContentOid(from: string, to: string, label: string): Promise<string | null> {
    return await callInternalRuntimeMethod<string | null>(this._runtime(), 'getEdgeContentOid', from, to, label);
  }

  async getEdgeContentMeta(from: string, to: string, label: string): Promise<ContentMeta> {
    return await callInternalRuntimeMethod<ContentMeta>(this._runtime(), 'getEdgeContentMeta', from, to, label);
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
    return remote._runtime();
  }

  if (isRuntimeBackedCore(remote)) {
    return remote;
  }

  throw new WarpError('WarpApp sync requires a runtime-backed WarpCore peer', 'E_WARP_APP_SYNC_REMOTE');
}
