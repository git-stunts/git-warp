import HttpServerPort, { HttpRequest, HttpResponse, type HttpServerHandle } from '../../src/ports/HttpServerPort.ts';
import type { SyncRequest, SyncResponse } from '../../src/domain/services/sync/SyncProtocol.ts';
import NoOpLogger from '../../src/infrastructure/adapters/NoOpLogger.ts';
const BODY = new TextEncoder().encode('{"type":"sync-request","frontier":{}}');

/** In-process transport: the real server installs its request handler here. */
export class MemoryHttpPort extends HttpServerPort {
  private _handler: ((request: HttpRequest) => Promise<HttpResponse>) | null = null;
  override createServer(handler: (request: HttpRequest) => Promise<HttpResponse>): HttpServerHandle {
    this._handler = handler;
    return {
      listen: (_port, host, callback) => { if (typeof host === 'function') { host(); } else { callback?.(); } },
      close: callback => { callback?.(); },
      address: () => ({ address: '127.0.0.1', port: 9999, family: 'IPv4' }),
    };
  }
  async request(headers: Record<string, string> = {}, body: Uint8Array = BODY): Promise<HttpResponse> {
    return await this.dispatch(new HttpRequest({ method: 'POST', url: '/sync', body,
      headers: { 'content-type': 'application/json', host: '127.0.0.1:9999', ...headers } }));
  }
  async dispatch(request: HttpRequest): Promise<HttpResponse> {
    if (this._handler === null) { throw new Error('Test server has not started'); }
    return await this._handler(request);
  }
}

export class SyncInbox {
  readonly requests: SyncRequest[] = [];
  processSyncRequest(request: SyncRequest): Promise<SyncResponse> {
    this.requests.push(request);
    return Promise.resolve({ type: 'sync-response', frontier: {}, patches: [] });
  }
}

export class WarningLog extends NoOpLogger {
  readonly warnings: string[] = [];
  override warn(message: string): void { this.warnings.push(message); }
}
