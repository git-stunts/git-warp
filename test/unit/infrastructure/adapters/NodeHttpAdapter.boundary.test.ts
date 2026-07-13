import { describe, expect, it, vi, beforeEach } from 'vitest';

type HeaderValues = Record<string, string | string[] | undefined>;

type CapturedRequest = AsyncIterable<Buffer> & {
  readonly method: string | undefined;
  readonly url: string | undefined;
  readonly headers: HeaderValues;
  destroy(): void;
};

type CapturedResponse = {
  readonly headersSent: boolean;
  writeHead(status: number, headers: Record<string, string>): void;
  end(body?: string | Uint8Array): void;
};

type CapturedHandler = (req: CapturedRequest, res: CapturedResponse) => void;

class EmptyRequest implements AsyncIterable<Buffer> {
  readonly headers: HeaderValues = {};
  readonly method: string | undefined;
  readonly url: string | undefined;

  constructor(fields: { readonly method?: string; readonly url?: string }) {
    this.method = fields.method;
    this.url = fields.url;
  }

  destroy(): void {}

  async *[Symbol.asyncIterator](): AsyncIterableIterator<Buffer> {
    const chunks: Buffer[] = [];
    for (const chunk of chunks) {
      yield chunk;
    }
  }
}

const httpMock = vi.hoisted(() => {
  let capturedHandler: CapturedHandler | undefined;
  const fakeServer = {
    listen(): void {},
    close(): void {},
    address(): { address: string; port: number; family: string } | null {
      return null;
    },
  };

  return {
    createServer: vi.fn((handler: CapturedHandler) => {
      capturedHandler = handler;
      return fakeServer;
    }),
    capturedHandler(): CapturedHandler | undefined {
      return capturedHandler;
    },
    reset(): void {
      capturedHandler = undefined;
    },
  };
});

vi.mock('node:http', () => ({
  createServer: httpMock.createServer,
}));

const { default: NodeHttpAdapter } = await import('../../../../src/infrastructure/adapters/NodeHttpAdapter.ts');

function responseDouble(): {
  readonly response: CapturedResponse;
  readonly status: () => number | undefined;
  readonly body: () => string | Uint8Array | undefined;
  readonly done: Promise<void>;
} {
  let headersSent = false;
  let status: number | undefined;
  let body: string | Uint8Array | undefined;
  let complete = (): void => {};
  const done = new Promise<void>((resolve) => {
    complete = resolve;
  });
  const response: CapturedResponse = {
    get headersSent() {
      return headersSent;
    },
    writeHead(nextStatus: number) {
      headersSent = true;
      status = nextStatus;
    },
    end(nextBody?: string | Uint8Array) {
      body = nextBody;
      complete();
    },
  };
  return {
    response,
    status: () => status,
    body: () => body,
    done,
  };
}

describe('NodeHttpAdapter boundary validation', () => {
  beforeEach(() => {
    httpMock.reset();
    httpMock.createServer.mockClear();
  });

  it('does not default missing request method and URL before validation', async () => {
    const logger = { error: vi.fn() };
    const handler = vi.fn(async () => ({ status: 200, body: 'handler-called' }));
    const adapter = new NodeHttpAdapter({ logger });
    adapter.createServer(handler);

    const res = responseDouble();
    const capturedHandler = httpMock.capturedHandler();
    expect(capturedHandler).toBeDefined();
    if (capturedHandler === undefined) {
      throw new Error('captured HTTP handler must exist');
    }
    capturedHandler(new EmptyRequest({}), res.response);
    await res.done;

    expect(handler).not.toHaveBeenCalled();
    expect(res.status()).toBe(500);
    expect(res.body()).toBe('Internal Server Error');
    expect(logger.error).toHaveBeenCalled();
  });
});
