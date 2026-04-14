# Cycle 0016 Retro — MCP Server

**Status:** DESIGN COMPLETE — implementation targeted at v17.2.0

## What ground was taken

Designed the full MCP tool catalog: ~30 tools organized by admission
moment (revelation, commitment, folding, governance). Mapped each tool
to an `openWarpGraph()` capability method. Designed resource URIs for
read-only graph state. Identified security considerations (writerId
isolation, trust enforcement, rate limiting).

## Backlog items produced

- `MCP_warp-server` (up-next) — `git warp mcp` backed by
  openWarpGraph()

## What we learned

1. **openWarpGraph() is the right foundation.** The factory returns
   exactly the capability surface the MCP needs. Each tool is a
   thin wrapper around a capability method. No CLI parsing, no text
   scraping.

2. **The admission architecture maps to MCP naturally.** Revelation
   tools = read-only queries. Commitment tools = patch creation.
   Folding tools = materialization and time-travel. Governance tools
   = sync, doctor, trust. The vocabulary carries over.

3. **WriterId isolation is critical.** Each MCP session should get a
   unique writerId to maintain multi-writer isolation. An agent should
   not accidentally write with another agent's identity.

4. **The MCP should reuse CommandResult.** If Design 0014 ships first,
   the MCP tool handlers and CLI command handlers can share the same
   result-producing logic. The MCP just skips the Bijou renderer.

## Open questions

1. Should the MCP server support multiple graphs simultaneously?
2. Should there be a `warp_subscribe` notification stream?
3. Should strand/braid semantics be exposed directly or abstracted?
4. Should tool names use admission vocabulary or conventional verbs?
5. Core package or separate `@git-stunts/warp-mcp`?
6. What happens when an agent's MCP session crashes — does the
   writerId become orphaned? Does the graph need cleanup?
