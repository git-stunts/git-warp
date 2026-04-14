# Convert 29 remaining JS test helper files to TypeScript

**Audit ref:** CQ01-4.4

29 test helper files remain as `.js` (benchmarks, bats helpers,
integration setup). While functional, they are not covered by
`tsconfig.test.json` type checking.

Part of the v17.1 CLI TS conversion cycle.

## Proposal

Convert these files alongside the CLI `.js` → `.ts` migration in v17.1.
This completes the "100% TypeScript" story across the entire repository.
