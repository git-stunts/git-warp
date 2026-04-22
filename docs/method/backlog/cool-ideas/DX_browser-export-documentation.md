---
id: DX_browser-export-documentation
blocked_by: []
blocks: []
feature: docs-dx
---

# Document the browser.js / browser.d.ts export path

**Audit ref:** CQ01-2.1

The `browser.js` and `browser.d.ts` export paths exist in `package.json`
exports but are completely undocumented. The browser story — what works,
what does not, which adapters to use (WebCrypto, IndexedDB, etc.) — is
not explained anywhere.

A consumer wanting to use git-warp in the browser has to reverse-engineer
the export map and adapter implementations.

## Proposal

Add a "Browser Usage" section to README.md and/or a dedicated
`docs/BROWSER.md` covering:
- Which export to use (`@git-stunts/git-warp/browser`)
- Which adapters are browser-compatible
- Known limitations (no Git CLI, no node:fs)
- Example setup with WebCrypto adapter
