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
  export type GitObjectInfo = Readonly<{
    oid: string;
    size: number;
    type: string;
  }>;

  export type GitObjectRead = GitObjectInfo &
    Readonly<{
      content: Uint8Array;
    }>;

  export type GitTreeEntry = Readonly<{
    mode: string;
    name: string;
    oid: string;
    type: string;
  }>;

  export class GitCatFileSession {
    close(): Promise<void>;
    info(_objectName: string): Promise<GitObjectInfo>;
    infoMany(_objectNames: string[]): Promise<ReadonlyArray<GitObjectInfo>>;
    read(_objectName: string, _options?: { maxBytes?: number }): Promise<GitObjectRead>;
    readMany(
      _objectNames: string[],
      _options?: { maxBytes?: number }
    ): Promise<ReadonlyArray<GitObjectRead>>;
    terminate(): Promise<void>;
  }

  export class GitFastImportSession {
    abort(): Promise<void>;
    checkpoint(): Promise<void>;
    close(): Promise<void>;
    writeBlob(_content: string | Uint8Array): Promise<string>;
    writeBlobs(
      _contents: Array<string | Uint8Array>,
      _options?: { maxBytes?: number }
    ): Promise<ReadonlyArray<string>>;
  }

  export class GitMktreeSession {
    close(): Promise<void>;
    terminate(): Promise<void>;
    write(_entries: Iterable<GitTreeEntry> | AsyncIterable<GitTreeEntry>): Promise<string>;
    writeMany(
      _trees: Array<Iterable<GitTreeEntry> | AsyncIterable<GitTreeEntry>>
    ): Promise<ReadonlyArray<string>>;
  }

  export class GitUpdateRefSession {
    close(): Promise<void>;
    terminate(): Promise<void>;
    update(
      _options: Readonly<{
        expectedOldOid?: string | null;
        newOid: string;
        noDeref?: boolean;
        ref: string;
      }>
    ): Promise<void>;
  }

  export interface PlumbingCollectableStream extends AsyncIterable<Uint8Array> {
    collect(_options?: { asString?: boolean; maxBytes?: number }): Promise<Buffer | string>;
  }

  class Plumbing {
    static createDefault(_options: { cwd: string }): Promise<Plumbing>;
    readonly emptyTree: string;
    execute(_options: { args: string[]; input?: string | Buffer }): Promise<string>;
    executeStream(_options: { args: string[] }): Promise<PlumbingCollectableStream>;
    openCatFileSession(): Promise<GitCatFileSession>;
    openFastImportSession(): Promise<GitFastImportSession>;
    openMktreeSession(): Promise<GitMktreeSession>;
    openUpdateRefSession(): Promise<GitUpdateRefSession>;
  }

  export const ShellRunnerFactory: any;
  export default Plumbing;
}
