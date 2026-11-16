import { assertEquals } from "./assertions.ts";
import { denoRuntimeTest } from "./helpers.ts";
import DenoHttpAdapter from "../../../src/infrastructure/adapters/DenoHttpAdapter.ts";

// Oracle: issue #1090. The peer address is the connected socket peer that
// Deno.serve reports in its handler info, never a forwarding header.
denoRuntimeTest("http adapter: reports the socket peer address and ignores X-Forwarded-For", async () => {
  let seenPeer: string | undefined = "handler-not-called";
  const server = new DenoHttpAdapter().createServer((request) => {
    seenPeer = request.peerAddress;
    return Promise.resolve({ status: 204 });
  });
  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", (error) => (error ? reject(error) : resolve()));
  });
  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address?.port}/sync`, {
      headers: { "x-forwarded-for": "198.51.100.99" },
    });
    await response.arrayBuffer();
    assertEquals(response.status, 204);
    assertEquals(seenPeer, "127.0.0.1");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
