/**
 * Minimal ambient declarations for Deno and Bun runtime globals.
 *
 * These cover ONLY the APIs actually used in this codebase:
 *   - Deno.serve()              (DenoHttpAdapter.js)
 *   - Deno.env.get()            (bin/cli/infrastructure.js)
 *   - Bun.serve()               (BunHttpAdapter.js)
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
}

/* ------------------------------------------------------------------ */
/*  Bun                                                               */
/* ------------------------------------------------------------------ */

interface BunServer {
  stop(closeActiveConnections?: boolean): Promise<void>;
  hostname: string;
  port: number;
}

interface BunServeOptions {
  port?: number;
  hostname?: string;
  fetch: (request: Request, server: BunServer) => Promise<Response | undefined> | Response | undefined;
}

declare namespace Bun {
  function serve(options: BunServeOptions): BunServer;
}

/* ------------------------------------------------------------------ */
/*  globalThis augmentation                                           */
/* ------------------------------------------------------------------ */

declare var Bun: typeof Bun | undefined;
declare var Deno: typeof Deno | undefined;

/* ------------------------------------------------------------------ */
/*  Untyped substrate packages                                        */
/* ------------------------------------------------------------------ */

declare module '@git-stunts/plumbing' {
  const Plumbing: any;
  export const ShellRunnerFactory: any;
  export default Plumbing;
}

declare module '@git-stunts/trailer-codec' {
  export interface TrailerCodecPayload {
    title: string;
    trailers: Record<string, string>;
  }

  export interface TrailerCodecDecodedMessage {
    trailers: Record<string, string>;
  }

  export interface TrailerCodecFacade {
    encode(payload: TrailerCodecPayload): string;
    decode(message: string): TrailerCodecDecodedMessage;
  }

  export class TrailerCodecService {}

  export class TrailerCodec implements TrailerCodecFacade {
    constructor(options: {
      service: TrailerCodecService;
      bodyFormatOptions?: { keepTrailingNewline?: boolean };
    });
    encode(payload: TrailerCodecPayload): string;
    decode(message: string): TrailerCodecDecodedMessage;
  }

  export function createMessageHelpers(options?: {
    service: TrailerCodecService;
    bodyFormatOptions?: { keepTrailingNewline?: boolean };
  }): TrailerCodecFacade;
}
