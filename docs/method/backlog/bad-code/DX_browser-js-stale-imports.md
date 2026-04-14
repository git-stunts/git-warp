---
id: DX_browser-js-stale-imports
---

# browser.js likely has stale import paths

`browser.js` is the browser entrypoint. It wasn't touched during
the .js→.ts infrastructure adapter renames. Its import paths
probably still reference .js files that are now .ts. Verify and
fix before release.
