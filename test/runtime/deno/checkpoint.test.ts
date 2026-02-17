import { assert, assertMatch, assertEquals } from "jsr:@std/assert";
import { createTestRepo } from "./helpers.ts";

Deno.test("checkpoint: creates checkpoint with valid SHA", async () => {
  const repo = await createTestRepo("ckpt");
  try {
    const graph = await repo.openGraph("test", "w1");

    await (await graph.createPatch()).addNode("n1").commit();
    await (await graph.createPatch()).addNode("n2").commit();
    await graph.materialize();

    const sha = await graph.createCheckpoint();
    assertMatch(sha, /^[0-9a-f]{40}$/);
  } finally {
    await repo.cleanup();
  }
});

Deno.test("checkpoint: materializeAt restores state", async () => {
  const repo = await createTestRepo("ckpt-at");
  try {
    const graph = await repo.openGraph("test", "w1");

    await (await graph.createPatch()).addNode("n1").commit();
    await graph.materialize();
    const sha = await graph.createCheckpoint();

    const state = await graph.materializeAt(sha);
    assert(state !== null);
    const nodes = await graph.getNodes();
    assertEquals(nodes.includes("n1"), true);
  } finally {
    await repo.cleanup();
  }
});
