import { describe, expect, it } from 'vitest';
import OperationAbortedError from '../../../../../src/domain/errors/OperationAbortedError.ts';
import OperationPolicyExhaustedError from '../../../../../src/domain/errors/OperationPolicyExhaustedError.ts';
import SyncError from '../../../../../src/domain/errors/SyncError.ts';
import SyncController from '../../../../../src/domain/services/controllers/SyncController.ts';
import type { SyncHost } from '../../../../../src/domain/services/controllers/SyncControllerTypes.ts';
import type { SyncStatusEvent } from '../../../../../src/domain/services/controllers/SyncControllerTypes.ts';
import { createEmptyState, type WarpState } from '../../../../../src/domain/services/JoinReducer.ts';
import type SnapshotWarpState from '../../../../../src/domain/services/snapshot/SnapshotWarpState.ts';
import { SHARED_SECRET_HMAC_SYNC_AUTH_SCHEME } from '../../../../../src/domain/services/sync/SyncAuthService.ts';
import type { SyncResponse } from '../../../../../src/domain/services/sync/SyncProtocol.ts';
import SyncSecret from '../../../../../src/domain/services/sync/SyncSecret.ts';
import NodeCryptoAdapter from '../../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import defaultCodec from '../../../../../src/infrastructure/codecs/CborCodec.ts';
import OperationPolicyPort, { type OperationPolicyExecuteOptions } from '../../../../../src/ports/OperationPolicyPort.ts';
import SyncHttpClientPort, {
  type SyncHttpClientRequest,
  type SyncHttpClientResult,
} from '../../../../../src/ports/SyncHttpClientPort.ts';
import InMemoryGraphAdapter from '../../../../helpers/InMemoryGraphAdapter.ts';
import ManualClock from '../../../../helpers/ManualClock.ts';
import SequenceRandomPort from '../../../../helpers/SequenceRandomPort.ts';
import { SyncInbox } from '../../../../helpers/SyncHttpFixture.ts';

const REMOTE = 'http://peer.invalid/sync';
const EMPTY: SyncResponse = { type: 'sync-response', frontier: {}, patches: [] };
const SUCCESS: SyncHttpClientResult = { kind: 'success', status: 200, response: EMPTY };
const NETWORK_FAILURE: SyncHttpClientResult = { kind: 'network-failure', message: 'connection reset' };

/** The host surface SyncController reads, over an empty in-memory repository with no writers. */
class SyncHostDouble implements SyncHost {
  _cachedState: WarpState | null;
  _lastFrontier: Map<string, string> | null = null;
  _stateDirty = false;
  _patchesSinceGC = 0;
  _graphName = 'sync-controller-policy';
  _persistence = new InMemoryGraphAdapter();
  _codec = defaultCodec;
  _crypto = new NodeCryptoAdapter();
  _random = new SequenceRandomPort();
  _clock = new ManualClock();
  _logger = null;
  _syncReplayProtection = null;
  _patchesSinceCheckpoint = 0;
  _maxObservedLamport = 0;

  constructor(state: WarpState | null) {
    this._cachedState = state;
  }

  materialize(): Promise<SnapshotWarpState> {
    return Promise.reject(new Error('these syncs never ask the host to materialize'));
  }

  _setMaterializedState(state: WarpState): Promise<object> {
    this._cachedState = state;
    return Promise.resolve({});
  }

  discoverWriters(): Promise<string[]> {
    return Promise.resolve([]);
  }
}

/** A host whose cached state is gone once the sync has applied, as after a concurrent clear. */
class StateDroppingHost extends SyncHostDouble {
  override _setMaterializedState(): Promise<object> {
    this._cachedState = null;
    return Promise.resolve({});
  }
}

/** Answers each exchange with the next scripted result and records every request. */
class ScriptedHttpClient extends SyncHttpClientPort {
  readonly requests: SyncHttpClientRequest[] = [];

  constructor(private readonly results: readonly SyncHttpClientResult[]) {
    super();
  }

  override exchange(request: SyncHttpClientRequest): Promise<SyncHttpClientResult> {
    this.requests.push(request);
    return Promise.resolve(this.results[this.requests.length - 1] ?? SUCCESS);
  }
}

/**
 * Retries in memory with no delay, with the semantics AlfredOperationPolicyAdapter gives
 * @git-stunts/alfred retry: an error that `shouldRetry` refuses is rethrown as it is, the
 * last failure becomes OperationPolicyExhaustedError, and each scheduled retry is reported
 * to `onRetry`. It records the options of every execution.
 */
class ImmediateRetryPolicy extends OperationPolicyPort {
  readonly executions: OperationPolicyExecuteOptions[] = [];

  override async execute<T>(
    operation: (signal?: AbortSignal) => Promise<T>,
    options: OperationPolicyExecuteOptions = {},
  ): Promise<T> {
    this.executions.push(options);
    const attempts = (options.retries ?? 0) + 1;
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await operation(options.signal);
      } catch (error) {
        if (!(error instanceof Error) || options.shouldRetry?.(error) === false) { throw error; }
        if (attempt >= attempts) { throw new OperationPolicyExhaustedError(attempt, error); }
        options.onRetry?.(error, attempt, 0);
      }
    }
  }

  override async stream<T>(
    operation: (signal?: AbortSignal) => Promise<AsyncIterable<T>>,
    options: OperationPolicyExecuteOptions = {},
  ): Promise<AsyncIterable<T>> {
    return await this.execute(operation, options);
  }
}

/** A policy that reports an abort, as alfred does when its signal fires between attempts. */
class AbortingPolicy extends OperationPolicyPort {
  override execute<T>(): Promise<T> {
    return Promise.reject(new DOMException('Operation aborted', 'AbortError'));
  }

  override stream<T>(): Promise<AsyncIterable<T>> {
    return Promise.reject(new DOMException('Operation aborted', 'AbortError'));
  }
}

describe('SyncController.syncWith transport and policy options', () => {
  it('signs with an unnamed key when the caller names no key id', async () => {
    const client = new ScriptedHttpClient([SUCCESS]);
    const controller = new SyncController(new SyncHostDouble(null), { httpClient: client, operationPolicy: new ImmediateRetryPolicy() });

    await controller.syncWith(REMOTE, { auth: { secret: SyncSecret.fromString('unnamed-key-test-secret') } });

    // Oracle: the transport signs an unnamed key as 'default' (FetchSyncHttpClientAdapter).
    expect(client.requests.map(({ auth }) => [auth?.scheme, auth?.keyId])).toEqual([[SHARED_SECRET_HMAC_SYNC_AUTH_SCHEME, undefined]]);
  });

  it('does not retry an exchange that the transport reports as aborted', async () => {
    const client = new ScriptedHttpClient([{ kind: 'aborted' }, SUCCESS]);
    const controller = new SyncController(new SyncHostDouble(null), { httpClient: client, operationPolicy: new ImmediateRetryPolicy() });

    await expect(controller.syncWith(REMOTE, { retries: 3 })).rejects.toBeInstanceOf(OperationAbortedError);
    expect(client.requests).toHaveLength(1);
  });

  it('refuses a response that the transport reports as too large, without a retry', async () => {
    const client = new ScriptedHttpClient([{ kind: 'response-too-large', status: 200, maxBytes: 64 }, SUCCESS]);
    const controller = new SyncController(new SyncHostDouble(null), { httpClient: client, operationPolicy: new ImmediateRetryPolicy() });

    await expect(controller.syncWith(REMOTE, { retries: 3 })).rejects.toMatchObject({
      name: SyncError.name, code: 'E_SYNC_RESPONSE_TOO_LARGE', context: { status: 200, maxBytes: 64 },
    });
    expect(client.requests).toHaveLength(1);
  });

  it('refuses a response that fails payload validation', async () => {
    const oversizedWriter = 'w'.repeat(257);
    const peer = { processSyncRequest: (): Promise<SyncResponse> => Promise.resolve({ ...EMPTY, frontier: { [oversizedWriter]: 'a'.repeat(40) } }) };
    const controller = new SyncController(new SyncHostDouble(null), { operationPolicy: new ImmediateRetryPolicy() });

    // Oracle: SyncPayloadSchema bounds a frontier writer id to 256 characters.
    await expect(controller.syncWith(peer)).rejects.toMatchObject({ code: 'E_SYNC_PAYLOAD_INVALID' });
  });

  it('hands the caller abort signal to the operation policy', async () => {
    const policy = new ImmediateRetryPolicy();
    const caller = new AbortController();
    const controller = new SyncController(new SyncHostDouble(null), { httpClient: new ScriptedHttpClient([SUCCESS]), operationPolicy: policy });

    await controller.syncWith(REMOTE, { signal: caller.signal });

    expect(policy.executions.map(({ signal }) => signal)).toEqual([caller.signal]);
  });

  it('hands the caller abort signal to the transport', async () => {
    const client = new ScriptedHttpClient([SUCCESS]);
    const caller = new AbortController();
    const controller = new SyncController(new SyncHostDouble(null), { httpClient: client, operationPolicy: new ImmediateRetryPolicy() });

    await controller.syncWith(REMOTE, { signal: caller.signal });

    expect(client.requests.map(({ signal }) => signal)).toEqual([caller.signal]);
  });

  it('reports each scheduled retry to the status listener', async () => {
    const events: SyncStatusEvent[] = [];
    const controller = new SyncController(new SyncHostDouble(null), {
      httpClient: new ScriptedHttpClient([NETWORK_FAILURE, SUCCESS]), operationPolicy: new ImmediateRetryPolicy(),
    });

    await controller.syncWith(REMOTE, { retries: 2, onStatus: (event) => { events.push(event); } });

    expect(events.filter(({ type }) => type === 'retrying')).toEqual([
      { type: 'retrying', attempt: 1, delayMs: 0, error: expect.objectContaining({ code: 'E_SYNC_NETWORK' }) },
    ]);
  });

  it('refuses to report a materialized sync when the host holds no state after it', async () => {
    const controller = new SyncController(new StateDroppingHost(createEmptyState()), { operationPolicy: new ImmediateRetryPolicy() });

    await expect(controller.syncWith(new SyncInbox(), { materialize: true }))
      .rejects.toMatchObject({ name: SyncError.name, code: 'E_SYNC_NO_STATE' });
  });

  it('turns a policy abort into OperationAbortedError when no status listener is given', async () => {
    const controller = new SyncController(new SyncHostDouble(null), {
      httpClient: new ScriptedHttpClient([SUCCESS]), operationPolicy: new AbortingPolicy(),
    });

    await expect(controller.syncWith(REMOTE)).rejects.toBeInstanceOf(OperationAbortedError);
  });
});
