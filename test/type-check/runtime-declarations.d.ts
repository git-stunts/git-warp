declare global {
  type BunServeOptions = {
    port: number;
    hostname?: string;
    fetch(request: Request): Response | Promise<Response>;
  };

  type BunServer = {
    readonly hostname: string;
    readonly port: number;
    stop(): void | Promise<void>;
  };

  type BunRuntime = {
    serve(options: BunServeOptions): BunServer;
  };

  type DenoTcpAddress = {
    readonly transport: 'tcp';
    readonly hostname: string;
    readonly port: number;
  };

  type DenoUdpAddress = {
    readonly transport: 'udp';
    readonly hostname: string;
    readonly port: number;
  };

  type DenoUnsupportedAddress = {
    readonly transport: 'unix';
  };

  type DenoServeOptions = {
    port: number;
    hostname?: string;
    onListen?(): void;
  };

  type DenoServer = {
    readonly addr: DenoTcpAddress | DenoUdpAddress | DenoUnsupportedAddress;
    shutdown(): Promise<void>;
  };

  type DenoRuntime = {
    serve(options: DenoServeOptions, handler: (request: Request) => Response | Promise<Response>): DenoServer;
  };

  var Bun: BunRuntime;
  var Deno: DenoRuntime;
}

export {};
