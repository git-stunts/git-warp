---
id: DX_npm-audit-fix-vite
feature: tooling-release
blocked_by: []
blocks: []
---

# Run npm audit fix for vite CVEs

**Audit ref:** CQ01-4.1, SR01-V1

`npm audit` reports 3 high-severity advisories in vite 8.0.0-8.0.4:
- GHSA-4w7w-66w2-5vf9 — Path traversal in optimized deps
- GHSA-v2wj-q39q-566r — server.fs.deny bypass
- GHSA-p9ff-h696-f583 — Arbitrary file read via WebSocket

Vite is a devDep only (used by Vitest). Not shipped in npm package.
Low practical risk but should be resolved.

## Steps

1. Run `npm audit fix`.
2. If a breaking change prevents automatic fix, pin to patched vite
   in `package.json` overrides.
3. Verify `npm run test:local` still passes.
