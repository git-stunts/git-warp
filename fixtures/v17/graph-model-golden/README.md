# V17 Golden Graph-Model Fixture

This fixture is the first persisted-history witness for the v18 graph-model
migration path. The canonical artifact is `v17-golden-graph.bundle`; the
manifest is the operator-readable contract for the refs, heads, chain lengths,
and visible graph facts that the bundle must restore.

The fixture intentionally uses real `refs/warp/<graph>/writers/<writer>` refs
and patch-shaped commits with trailer-coded v17 patch metadata. It is not a
JSON-only mock and it is not a raw `.git` directory snapshot.

## Restore

Use the slice 46 restore helper from tests or scripts:

```text
restoreV17GoldenGraphFixture({
  manifestPath: "fixtures/v17/graph-model-golden/manifest.json",
  targetDirectory: "<empty target directory>"
})
```

The helper initializes the target repository, fetches the bundle refs, and
verifies the expected writer heads and patch counts.

## Regeneration

Regeneration must preserve deterministic commit inputs:

- author and committer name: `Git Warp Fixture`;
- author and committer email: `fixture@git-warp.local`;
- author and committer date: `2026-01-01T00:00:00Z`;
- graph id: `v17-golden-graph`;
- refs:
  - `refs/warp/v17-golden-graph/writers/alice`;
  - `refs/warp/v17-golden-graph/writers/bob`.

After regeneration, update `manifest.json` with the new writer heads and keep
the visible fact coverage over node, edge, property, content, removal, and
multi-writer cases.
