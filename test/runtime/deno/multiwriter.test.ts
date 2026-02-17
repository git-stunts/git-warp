import { assertEquals, assert } from "jsr:@std/assert";
import { createTestRepo } from "./helpers.ts";

Deno.test("multiwriter: two writers merge via CRDT", async () => {
  const repo = await createTestRepo("mw");
  try {
    const alice = await repo.openGraph("shared", "alice");
    const bob = await repo.openGraph("shared", "bob");

    await (await alice.createPatch()).addNode("a").commit();
    await (await bob.createPatch()).addNode("b").commit();

    await alice.materialize();
    const nodes = await alice.getNodes();
    assert(nodes.includes("a"));
    assert(nodes.includes("b"));
  } finally {
    await repo.cleanup();
  }
});

Deno.test("multiwriter: discovers all writers", async () => {
  const repo = await createTestRepo("mw-disc");
  try {
    const alice = await repo.openGraph("g", "alice");
    const bob = await repo.openGraph("g", "bob");

    await (await alice.createPatch()).addNode("a").commit();
    await (await bob.createPatch()).addNode("b").commit();

    const writers = await alice.discoverWriters();
    assertEquals(writers.sort(), ["alice", "bob"]);
  } finally {
    await repo.cleanup();
  }
});
