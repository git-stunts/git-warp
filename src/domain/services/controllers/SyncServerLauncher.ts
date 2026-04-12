/**
 * SyncServerLauncher — starts the built-in HTTP sync server for a graph host.
 *
 * Extracted from SyncController to keep that class within the 500 LOC ceiling.
 * Called directly by SyncController.serve().
 *
 * @module domain/services/controllers/SyncServerLauncher
 */

import SyncError from '../../errors/SyncError.ts';
import HttpSyncServer from '../sync/HttpSyncServer.js';
import type { SyncRequest, SyncResponse } from '../sync/SyncProtocol.ts';
import type HttpServerPort from '../../../ports/HttpServerPort.ts';
import type { SyncHost } from './SyncController.ts';

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_SYNC_SERVER_MAX_BYTES = 4 * 1024 * 1024;

// ── Types ────────────────────────────────────────────────────────────────────

export interface ServeOptions {
  port: number;
  host?: string;
  path?: string;
  maxRequestBytes?: number;
  httpPort: HttpServerPort;
  auth?: { keys: Record<string, string>; mode?: 'enforce' | 'log-only' };
}

export interface ServerHandle {
  close: () => Promise<void>;
  url: string;
}

// ── SyncServerLauncher ───────────────────────────────────────────────────────

/**
 * Starts a built-in HTTP sync server for the given graph host.
 *
 * @param host - The WarpRuntime instance providing processSyncRequest and crypto
 * @param options - Server configuration
 * @returns Server handle with close() method and url string
 * @throws SyncError If port is not a number or httpPort adapter is missing
 */
export async function launchSyncServer(
  host: SyncHost,
  options: ServeOptions,
): Promise<ServerHandle> {
  const {
    port,
    host: hostname = '127.0.0.1',
    path = '/sync',
    maxRequestBytes = DEFAULT_SYNC_SERVER_MAX_BYTES,
    httpPort,
    auth,
  } = options;

  if (typeof port !== 'number') {
    throw new SyncError('serve() requires a numeric port', {
      code: 'E_SYNC_SERVE',
      context: { port },
    });
  }
  if (httpPort === undefined || httpPort === null) {
    throw new SyncError('serve() requires an httpPort adapter', {
      code: 'E_SYNC_SERVE',
      context: {},
    });
  }

  const authConfig = auth
    ? {
        ...auth,
        crypto: host._crypto,
        ...(host._logger ? { logger: host._logger } : {}),
      }
    : undefined;

  const httpServer = new HttpSyncServer({
    httpPort,
    graph: host as unknown as {
      processSyncRequest: (req: SyncRequest) => Promise<SyncResponse>;
    },
    path,
    host: hostname,
    maxRequestBytes,
    ...(authConfig !== undefined ? { auth: authConfig } : {}),
  } as ConstructorParameters<typeof HttpSyncServer>[0]);

  return await httpServer.listen(port);
}
