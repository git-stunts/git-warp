/* @generated from schemas/v19-public-vocabulary.graphql by Wesley. Do not edit. */

export const V19_PUBLIC_VOCABULARY = {
  "version": "git-warp.capabilities/v19",
  "moduleSummary": "Write intents. Observe lanes. Keep receipts.",
  "sdkSummary": "Generated SDKs construct validated Intent and Observer values for Runtime Lane workflows.",
  "formalIdentifiers": [
    "WitnessReference",
    "WitnessReferences",
    "witnessRef",
    "witnessRefs"
  ],
  "exceptionPaths": [
    "docs/migrations/",
    "docs/topics/api/README.md",
    "docs/topics/git-perf.md",
    "docs/topics/git-substrate.md",
    "scripts/v18-to-v19/",
    "src/infrastructure/"
  ],
  "nouns": [
    {
      "name": "Runtime",
      "summary": "Opens local resources and owns Lane lifecycles."
    },
    {
      "name": "Lane",
      "summary": "Names one causal application history."
    },
    {
      "name": "Intent",
      "summary": "Describes one validated application write."
    },
    {
      "name": "Observer",
      "summary": "Defines one bounded read over a Lane."
    },
    {
      "name": "Observation",
      "summary": "Executes an Observer once and streams Readings."
    },
    {
      "name": "Reading",
      "summary": "Carries a canonical value with bounded support."
    },
    {
      "name": "Receipt",
      "summary": "Records the durable outcome of an operation."
    },
    {
      "name": "Settlement",
      "summary": "Revalidates and applies an immutable plan between Lanes."
    }
  ],
  "forbiddenTerms": [
    {
      "phrase": "blob",
      "scopes": [
        "ROOT_DECLARATION"
      ]
    },
    {
      "phrase": "cas",
      "scopes": [
        "ROOT_DECLARATION"
      ]
    },
    {
      "phrase": "commit",
      "scopes": [
        "ROOT_DECLARATION"
      ]
    },
    {
      "phrase": "git",
      "scopes": [
        "ROOT_DECLARATION"
      ]
    },
    {
      "phrase": "object id",
      "scopes": [
        "ROOT_DECLARATION"
      ]
    },
    {
      "phrase": "oid",
      "scopes": [
        "ROOT_DECLARATION",
        "PUBLIC_SURFACE"
      ]
    },
    {
      "phrase": "plumbing",
      "scopes": [
        "ROOT_DECLARATION"
      ]
    },
    {
      "phrase": "ref",
      "scopes": [
        "ROOT_DECLARATION"
      ]
    },
    {
      "phrase": "sha",
      "scopes": [
        "ROOT_DECLARATION"
      ]
    },
    {
      "phrase": "tree",
      "scopes": [
        "ROOT_DECLARATION"
      ]
    },
    {
      "phrase": "timeline",
      "scopes": [
        "PUBLIC_SURFACE"
      ]
    },
    {
      "phrase": "merge",
      "scopes": [
        "PUBLIC_SURFACE"
      ]
    },
    {
      "phrase": "graph store",
      "scopes": [
        "PUBLIC_SURFACE"
      ]
    },
    {
      "phrase": "generic event",
      "scopes": [
        "PUBLIC_SURFACE"
      ]
    },
    {
      "phrase": "dry run",
      "scopes": [
        "PUBLIC_SURFACE"
      ]
    },
    {
      "phrase": "session",
      "scopes": [
        "PUBLIC_SURFACE"
      ]
    },
    {
      "phrase": "query result page",
      "scopes": [
        "PUBLIC_SURFACE"
      ]
    }
  ],
  "cli": [
    {
      "command": "write",
      "summary": "Write one Intent to a Lane.",
      "usage": "git warp write --lane <name> [--strand <name>] --intent <json>"
    },
    {
      "command": "observe",
      "summary": "Run one bounded Observer over a Lane.",
      "usage": "git warp observe --lane <name> [--strand <name>] --observer <id> --reading <json>"
    },
    {
      "command": "fork",
      "summary": "Fork a Lane into a named strand Lane.",
      "usage": "git warp fork --lane <source> --name <strand>"
    },
    {
      "command": "settle",
      "summary": "Preview or apply an immutable Settlement plan.",
      "usage": "git warp settle preview --source <lane> --strand <name> --target <lane> | settle apply --plan <path>"
    },
    {
      "command": "receipt",
      "summary": "Render a canonical Receipt envelope.",
      "usage": "git warp receipt show --input <path|->"
    },
    {
      "command": "doctor",
      "summary": "Diagnose the local Runtime and Lane.",
      "usage": "git warp doctor --lane <name>"
    },
    {
      "command": "repair",
      "summary": "Apply one explicit Runtime repair.",
      "usage": "git warp repair --lane <name> --action materialization"
    },
    {
      "command": "audit",
      "summary": "Verify the local Runtime audit trail.",
      "usage": "git warp audit --lane <name>"
    },
    {
      "command": "mcp",
      "summary": "Serve the v19 capabilities over MCP stdio.",
      "usage": "git warp mcp --repo <path> --writer <id>"
    }
  ]
} as const;

export const V19_PUBLIC_NOUNS = {
  "Runtime": "Runtime",
  "Lane": "Lane",
  "Intent": "Intent",
  "Observer": "Observer",
  "Observation": "Observation",
  "Reading": "Reading",
  "Receipt": "Receipt",
  "Settlement": "Settlement"
} as const;
