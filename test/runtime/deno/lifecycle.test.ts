import { assertEquals, assert } from "jsr:@std/assert";
import { createTestRepo } from "./helpers.ts";

Deno.test("lifecycle: open → addNode → materialize → getNodes", async () => {
  const repo = await createTestRepo("lifecycle");
  try {
    const graph = await repo.openGraph("test", "alice");

    const patch = await graph.createPatch();
    await patch.addNode("user:alice").setProperty("user:alice", "name", "Alice").commit();

    await graph.materialize();
    const nodes = await graph.getNodes();
    assert(nodes.includes("user:alice"));
  } finally {
    await repo.cleanup();
  }
});

Deno.test("lifecycle: creates edges and retrieves them", async () => {
  const repo = await createTestRepo("lifecycle-edge");
  try {
    const graph = await repo.openGraph("test", "alice");

    const p1 = await graph.createPatch();
    await p1.addNode("a").addNode("b").addEdge("a", "b", "link").commit();

    await graph.materialize();
    const edges = await graph.getEdges();
    assertEquals(edges.length, 1);
    assertEquals(edges[0].from, "a");
    assertEquals(edges[0].to, "b");
    assertEquals(edges[0].label, "link");
  } finally {
    await repo.cleanup();
  }
});

Deno.test("lifecycle: node properties via Map", async () => {
  const repo = await createTestRepo("lifecycle-props");
  try {
    const graph = await repo.openGraph("test", "alice");

    const patch = await graph.createPatch();
    await patch.addNode("n").setProperty("n", "k", "v").commit();

    await graph.materialize();
    const props = await graph.getNodeProps("n");
    assertEquals(props.get("k"), "v");
  } finally {
    await repo.cleanup();
  }
});
