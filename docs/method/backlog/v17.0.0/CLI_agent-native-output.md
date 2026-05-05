---
id: CLI_agent-native-output
blocks: []
blocked_by: []
feature: api-capabilities
---

# CLI agent-native output (Design 0014)

Convert all 42 CLI .js files to .ts while adopting the CommandResult
pattern. Every command returns structured data; renderer decides
presentation (--json for agents, Bijou for humans).

Design doc: `docs/design/0014-cli-agent-native/cli-agent-native.md`

Target: v17.1.0
