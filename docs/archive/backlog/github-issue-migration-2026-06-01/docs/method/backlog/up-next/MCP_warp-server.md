---
id: MCP_warp-server
blocked_by: []
blocks: []
feature: api-capabilities
---

# Add a git-warp MCP server

## Problem

Agents can call the CLI with `--json` or `--ndjson`, but that still leaves them
outside the typed capability surface. A Model Context Protocol server would let
agents inspect and operate on WARP graphs through explicit tools instead of CLI
text parsing.

## Shape

`git warp mcp` starts a local MCP server backed by the current public graph and
worldline surfaces.

The first useful cut should expose a narrow, honest catalog:

- graph and package info
- read/query tools
- materialization or coordinate inspection tools for diagnostic use
- patch creation tools only after input validation and writer identity policy
  are explicit
- trust, sync, and server tools only after those CLI/domain seams are ready

## Acceptance

- Tool schemas validate inputs at the MCP boundary.
- Tool outputs are structured and do not require parsing human CLI text.
- Write-capable tools are explicit about writer identity, trust mode, and local
  side effects.
- The server can run over local stdio first; network transports need a separate
  auth and rate-limit decision.
- The implementation reuses current public capabilities where they are honest
  and defines adapter DTOs where the MCP boundary needs a different shape.

## Source

Rehomed from archived v17 residual note `MCP_warp-server`. The old
`CLI_agent-native-output` blocker is not carried forward; MCP can reuse current
structured CLI plumbing where helpful, but should not be blocked on the old v17
CLI migration card.
