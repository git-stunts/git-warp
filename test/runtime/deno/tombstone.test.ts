import { assertEquals, assert } from "jsr:@std/assert";
import { createTestRepo } from "./helpers.ts";

Deno.test("tombstone: removeNode hides node", async () => {
  const repo = await createTestRepo("tomb");
  try {
    const graph = await repo.openGraph("test", "alice");

    await (await graph.createPatch()).addNode("temp").commit();
    await graph.materialize();
    assert(await graph.hasNode("temp"));

    await (await graph.createPatch()).removeNode("temp").commit();
    await graph.materialize();
    assertEquals(await graph.hasNode("temp"), false);
  } finally {
    await repo.cleanup();
  }
});

Deno.test("tombstone: re-add after removal", async () => {
  const repo = await createTestRepo("tomb-re");
  try {
    const graph = await repo.openGraph("test", "alice");

    await (await graph.createPatch()).addNode("phoenix").commit();
    await graph.materialize();
    await (await graph.createPatch()).removeNode("phoenix").commit();
    await graph.materialize();
    assertEquals(await graph.hasNode("phoenix"), false);

    await (await graph.createPatch()).addNode("phoenix").commit();
    await graph.materialize();
    assert(await graph.hasNode("phoenix"));
  } finally {
    await repo.cleanup();
  }
});
