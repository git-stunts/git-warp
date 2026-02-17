import { assertEquals, assert } from "jsr:@std/assert";
import { createTestRepo } from "./helpers.ts";

Deno.test("edge-cases: empty graph materializes with zero nodes", async () => {
  const repo = await createTestRepo("empty");
  try {
    const graph = await repo.openGraph("empty", "w1");
    await graph.materialize();
    assertEquals((await graph.getNodes()).length, 0);
    assertEquals((await graph.getEdges()).length, 0);
  } finally {
    await repo.cleanup();
  }
});

Deno.test("edge-cases: self-edges are supported", async () => {
  const repo = await createTestRepo("self");
  try {
    const graph = await repo.openGraph("self", "w1");
    await (await graph.createPatch())
      .addNode("loop")
      .addEdge("loop", "loop", "self-ref")
      .commit();
    await graph.materialize();

    const edges = await graph.getEdges();
    assertEquals(edges.length, 1);
    assertEquals(edges[0].from, "loop");
    assertEquals(edges[0].to, "loop");
  } finally {
    await repo.cleanup();
  }
});

Deno.test("edge-cases: unicode node IDs", async () => {
  const repo = await createTestRepo("unicode");
  try {
    const graph = await repo.openGraph("u", "w1");
    await (await graph.createPatch()).addNode("user:café").addNode("user:日本語").commit();
    await graph.materialize();

    const nodes = await graph.getNodes();
    assert(nodes.includes("user:café"));
    assert(nodes.includes("user:日本語"));
  } finally {
    await repo.cleanup();
  }
});
