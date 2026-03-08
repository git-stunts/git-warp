/**
 * Minimal ambient declarations for Deno and Bun runtime globals.
 *
 * These cover ONLY the APIs actually used in this codebase:
 *   - Deno.serve()              (DenoHttpAdapter.js, DenoWsAdapter.js)
 *   - Deno.upgradeWebSocket()   (DenoWsAdapter.js)
 *   - Deno.env.get()            (bin/cli/infrastructure.js)
 *   - Bun.serve()               (BunHttpAdapter.js, BunWsAdapter.js)
 *
 * Do NOT install @types/deno or @types/bun — this file is intentionally
 * narrow to avoid pulling in thousands of unrelated declarations.
 */

/* ------------------------------------------------------------------ */
/*  Deno                                                              */
/* ------------------------------------------------------------------ */

interface DenoAddr {
  transport: string;
  hostname: string;
  port: number;
}

interface DenoServer {
  shutdown(): Promise<void>;
  addr: DenoAddr;
}

interface DenoServeOptions {
  port?: number;
  hostname?: string;
  onListen?: (addr?: { port: number; hostname: string }) => void;
}

interface DenoEnv {
  get(name: string): string | undefined;
}

declare namespace Deno {
  const env: DenoEnv;
  function serve(
    options: DenoServeOptions,
    handler: (request: Request) => Promise<Response> | Response,
  ): DenoServer;
  function upgradeWebSocket(request: Request): { socket: WebSocket; response: Response };
}

/* ------------------------------------------------------------------ */
/*  Bun                                                               */
/* ------------------------------------------------------------------ */

interface BunServerWebSocket<T = unknown> {
  send(data: string | ArrayBuffer | Uint8Array): void;
  close(code?: number, reason?: string): void;
  data: T;
  readyState: number;
}

interface BunWsData {
  messageHandler: ((message: string) => void) | null;
  closeHandler: ((code?: number, reason?: string) => void) | null;
  messageBuffer: string[];
}

interface BunWebSocketHandlers<T = unknown> {
  open?(ws: BunServerWebSocket<T>): void;
  message?(ws: BunServerWebSocket<T>, message: string | ArrayBuffer): void;
  close?(ws: BunServerWebSocket<T>, code: number, reason: string): void;
}

interface BunServer {
  stop(closeActiveConnections?: boolean): Promise<void>;
  hostname: string;
  port: number;
  upgrade<T>(req: Request, options?: { data?: T }): boolean;
}

interface BunServeOptions {
  port?: number;
  hostname?: string;
  fetch: (request: Request, server: BunServer) => Promise<Response | undefined> | Response | undefined;
  websocket?: BunWebSocketHandlers<BunWsData>;
}

declare namespace Bun {
  function serve(options: BunServeOptions): BunServer;
}

/* ------------------------------------------------------------------ */
/*  globalThis augmentation                                           */
/* ------------------------------------------------------------------ */

declare var Bun: typeof Bun | undefined;
declare var Deno: typeof Deno | undefined;
