# Cycle 0015 Retro — Missing CLI Commands

**Status:** DESIGN COMPLETE — implementation deferred to v17.1.0

## What ground was taken

Mapped all 9 capability namespaces against the existing CLI command
registry. Found 8 missing commands across 4 priority tiers. Designed
command signatures, option schemas, and capability mappings for each.

## Backlog items produced

- `CLI_missing-commands` (up-next) — implement sync, serve, fork,
  checkpoint, gc, query (rich), migrate, export/import, watch

## What we learned

1. **The domain layer is ahead of the CLI.** `syncWith()`, `serve()`,
   `fork()`, checkpoint management, and GC all work in the domain.
   The CLI just doesn't expose them. This is a wiring problem, not
   a capability problem.

2. **`sync` and `serve` are the most impactful gaps.** Without a CLI
   sync command, multi-writer collaboration requires programmatic
   setup. This is the biggest barrier to adoption.

3. **`query` needs a mini-language.** Individual getNodeProps/getEdges
   calls are too low-level for CLI use. A query expression language
   (`nodes where type = 'user'`) would make the CLI genuinely useful
   for graph exploration.

4. **`migrate` depends on INFRA_substrate-upgrade-tool.** The domain
   migration service exists but there's no user-facing migration path.
   This is an operational gap, not a feature gap.

## Open questions

1. Should `sync` support bidirectional sync in one command?
2. Should `query` use a DSL or structured subcommands?
3. Should `export/import` use git-cas for the transport format?
4. Should `watch` support filtering (`--match "user:*"`)?
