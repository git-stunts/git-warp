# Design 0016: git-warp MCP Server

## Problem

AI agents are the fastest-growing class of git-warp consumers. Today
they interact via CLI text parsing — fragile, lossy, and untyped.
WARP's admission architecture (`openWarpGraph()` returning 9 typed
capability namespaces) is a natural fit for the Model Context Protocol,
which provides typed tool definitions and structured responses.

## Thesis

`git warp mcp` starts an MCP server that exposes WARP capabilities as
tools. Each tool maps directly to a capability method. The agent gets
typed inputs, structured outputs, and semantic error codes — no CLI
parsing, no text scraping.

## Architecture

```text
Agent (Claude, etc.)
  ↓ MCP protocol (stdio or SSE)
git-warp MCP Server
  ↓ openWarpGraph(deps)
WarpGraph capability bag
  ↓
  commitment / folding / revelation / governance
```

### Entry point

```text
git warp mcp                    # stdio transport (default)
git warp mcp --transport sse    # SSE transport
git warp mcp --graph events     # specific graph
```

The server opens the graph once and serves tools against it. Multiple
graphs can be served via the `graph` parameter on each tool call.

### Tool catalog

Tools are organized by architectural moment, matching the WarpGraph
capability surface:

#### Revelation (read)

| Tool | Description | Maps to |
|------|-------------|---------|
| `warp_nodes` | List all node IDs | `query.getNodes()` |
| `warp_node_props` | Get properties for a node | `query.getNodeProps(nodeId)` |
| `warp_edges` | List all edges | `query.getEdges()` |
| `warp_edge_props` | Get properties for an edge | `query.getEdgeProps(from, to, label)` |
| `warp_neighbors` | Get neighbors of a node | `query.neighbors(nodeId, direction)` |
| `warp_has_node` | Check if a node exists | `query.hasNode(nodeId)` |
| `warp_state_snapshot` | Get full materialized state | `query.getStateSnapshot()` |
| `warp_content` | Read content blob for a node | `query.getContent(nodeId)` |

#### Commitment (write)

| Tool | Description | Maps to |
|------|-------------|---------|
| `warp_patch` | Create and commit a patch | `patches.createPatch()` + ops + `commit()` |
| `warp_add_node` | Add a node (convenience) | patch with NodeAdd op |
| `warp_add_edge` | Add an edge (convenience) | patch with EdgeAdd op |
| `warp_set_prop` | Set a property (convenience) | patch with PropSet op |
| `warp_remove_node` | Remove a node | patch with NodeRemove op |
| `warp_strand_create` | Create a speculative lane | `strands.createStrand(id)` |
| `warp_strand_materialize` | Materialize a strand | `strands.materializeStrand(id)` |

#### Folding (history)

| Tool | Description | Maps to |
|------|-------------|---------|
| `warp_materialize` | Materialize current state | `materialize.materialize({})` |
| `warp_seek` | Time-travel to a tick | `materialize.materialize({ ceiling })` |
| `warp_checkpoint_create` | Create a checkpoint | `checkpoint.createCheckpoint()` |
| `warp_checkpoint_list` | List checkpoints | `checkpoint.listCheckpoints()` |

#### Governance (sync + trust)

| Tool | Description | Maps to |
|------|-------------|---------|
| `warp_sync` | Sync with a remote peer | `sync.syncWith(remote)` |
| `warp_status` | Get graph status | `sync.status()` |
| `warp_frontier` | Get current frontier | `sync.getFrontier()` |
| `warp_doctor` | Run diagnostic checks | doctor subsystem |
| `warp_trust` | Query trust state | trust evaluation |

#### Meta

| Tool | Description |
|------|-------------|
| `warp_graphs` | List available graphs in the repo |
| `warp_info` | Graph metadata (name, writerId, version) |
| `warp_diff` | Diff between two ticks or coordinates |

### Resources

MCP resources expose read-only views:

| Resource | URI pattern |
|----------|-------------|
| Graph state | `warp://{graph}/state` |
| Node | `warp://{graph}/nodes/{nodeId}` |
| Edge | `warp://{graph}/edges/{from}/{to}/{label}` |
| Frontier | `warp://{graph}/frontier` |
| Provenance | `warp://{graph}/provenance/{sha}` |

### Implementation

```typescript
// bin/cli/commands/mcp.ts
import { McpServer } from '@anthropic-ai/mcp';
import { openWarpGraph } from '../../src/domain/WarpGraph.ts';

export default async function handleMcp(options: McpOptions) {
  const graph = await openWarpGraph({
    persistence,
    graphName: options.graph,
    writerId: options.writerId ?? `mcp-${crypto.randomUUID()}`,
  });

  const server = new McpServer({
    name: 'git-warp',
    version: pkg.version,
  });

  // Revelation tools
  server.tool('warp_nodes', {}, async () => {
    const nodes = await graph.query.getNodes();
    return { content: [{ type: 'text', text: JSON.stringify(nodes) }] };
  });

  server.tool('warp_node_props', { nodeId: z.string() }, async ({ nodeId }) => {
    const props = await graph.query.getNodeProps(nodeId);
    return { content: [{ type: 'text', text: JSON.stringify(props) }] };
  });

  // Commitment tools
  server.tool('warp_patch', {
    ops: z.array(z.object({
      type: z.enum(['NodeAdd', 'NodeRemove', 'EdgeAdd', 'EdgeRemove', 'PropSet']),
      // ... op-specific fields
    })),
  }, async ({ ops }) => {
    const patch = await graph.patches.createPatch();
    for (const op of ops) {
      // apply each op to the patch builder
    }
    const sha = await patch.commit();
    return { content: [{ type: 'text', text: JSON.stringify({ sha }) }] };
  });

  // ... register all tools

  await server.start({ transport: options.transport });
}
```

### Dependencies

- `@anthropic-ai/mcp` — MCP server SDK (or `@modelcontextprotocol/sdk`)
- `zod` — already in the project, used for tool input validation

### Security considerations

1. **Write access**: The MCP server can create patches, sync, and
   modify graph state. Trust mode should be enforced.
2. **Authentication**: When serving over SSE, auth headers should be
   required. Stdio transport is inherently local.
3. **Rate limiting**: Large graphs could produce expensive operations.
   Consider tool-level timeouts via @git-stunts/alfred.
4. **WriterId**: Each MCP session should get a unique writerId to
   maintain multi-writer isolation.

## Relation to Paper VII

The MCP server is the **revelation surface** for agents. In the
commitment/folding/revelation decomposition:

- Agents commit through `warp_patch`, `warp_strand_create`
- Agents fold through `warp_materialize`, `warp_seek`, `warp_checkpoint`
- Agents observe through `warp_nodes`, `warp_node_props`, `warp_edges`
- Agents govern through `warp_sync`, `warp_doctor`, `warp_trust`

The MCP server is how agents participate in the admission architecture
as first-class principals — not as CLI scrapers, but as typed
capability consumers.

## Open questions

1. Should the MCP server support multiple graphs simultaneously?
   (Multi-graph repo with per-tool graph selection)
2. Should there be a `warp_subscribe` tool that returns an MCP
   notification stream for state changes?
3. Should the MCP expose strand/braid semantics directly, or
   abstract them behind simpler "branch" metaphors?
4. Should tool names use the admission vocabulary
   (commit/fold/reveal) or more conventional verbs (read/write/sync)?
5. Package distribution: should the MCP server be in git-warp core
   or a separate `@git-stunts/warp-mcp` package?
