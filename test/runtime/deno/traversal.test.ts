import { assertEquals, assert } from "jsr:@std/assert";
import { createTestRepo } from "./helpers.ts";

Deno.test("traversal: BFS visits in breadth-first order", async () => {
  const repo = await createTestRepo("trav-bfs");
  try {
    const graph = await repo.openGraph("test", "alice");

    const p1 = await graph.createPatch();
    await p1
      .addNode("a").addNode("b").addNode("c")
      .addEdge("a", "b", "next").addEdge("b", "c", "next")
      .commit();
    await graph.materialize();

    const visited = await graph.traverse.bfs("a", { dir: "out" });
    assertEquals(visited, ["a", "b", "c"]);
  } finally {
    await repo.cleanup();
  }
});

Deno.test("traversal: shortestPath finds path", async () => {
  const repo = await createTestRepo("trav-sp");
  try {
    const graph = await repo.openGraph("test", "alice");

    const p1 = await graph.createPatch();
    await p1
      .addNode("a").addNode("b").addNode("c")
      .addEdge("a", "b", "next").addEdge("b", "c", "next")
      .commit();
    await graph.materialize();

    const result = await graph.traverse.shortestPath("a", "c", { dir: "out" });
    assert(result.found);
    assertEquals(result.path, ["a", "b", "c"]);
    assertEquals(result.length, 2);
  } finally {
    await repo.cleanup();
  }
});

Deno.test("traversal: shortestPath not found", async () => {
  const repo = await createTestRepo("trav-nf");
  try {
    const graph = await repo.openGraph("test", "alice");

    const p1 = await graph.createPatch();
    await p1.addNode("a").addNode("b").addEdge("a", "b", "next").commit();
    await graph.materialize();

    const result = await graph.traverse.shortestPath("b", "a", { dir: "out" });
    assertEquals(result.found, false);
  } finally {
    await repo.cleanup();
  }
});
