# Update ARCHITECTURE.md file references from .js to .ts

**Audit ref:** DQ01-M-06

`docs/ARCHITECTURE.md` may still reference `.js` file extensions in the
repository layout section. Since src/ is 100% TypeScript, any remaining
`.js` references are stale.

## Steps

1. Audit all file path references in ARCHITECTURE.md.
2. Replace `.js` with `.ts` where the source file has been migrated.
3. Leave `bin/*.js` references as-is (CLI files are still JS by design).
