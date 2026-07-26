# V18 Retained-Substrate Golden Fixture

This fixture is the persisted-history witness for the one-shot v18-to-v19
substrate migration. It was created through the published v18 public API, not
by hand-authoring Git objects and not from a private Think repository.

The bundle advertises two real writer refs and the retained state-cache ref.
The state-cache ref deliberately targets a Git blob. Its snapshot payload is a
git-cas tree whose OID appears inside the state-cache JSON, so the bundle also
packs that tree as an unadvertised root. This distinction reproduces the v18
store shape that v19 must migrate without teaching the current runtime to read
legacy state.

## Source lock

The isolated generator project installed these exact registry artifacts:

- `@git-stunts/git-warp@18.2.1`;
- `@git-stunts/git-cas@6.0.0`;
- `@git-stunts/plumbing@3.0.3`.

The versions match the `v18.2.1` repository lockfile. Their npm integrity
values are frozen in [`manifest.json`](./manifest.json). Pinning the transitive
dependencies matters: a fresh unpinned install of `18.2.1` now resolves a newer
git-cas and does not reproduce the legacy retained-state shape.

## Generation

Generation used a disposable project created with `mktemp -d`, `npm init -y`,
and one exact `npm install` command for the three packages above. The public
`GitGraphAdapter` and `openWarpWorldline()` surface wrote:

- two Alice patches containing nodes, properties, an edge property, and
  attached content;
- one independent Bob patch;
- one full public query, which materialized and retained the v18 state cache.

Git author and committer identity were fixed to `Git Warp Fixture
<fixture@git-warp.local>` and Git dates to `2026-01-01T00:00:00Z`. The retained
cache records its real runtime creation timestamp because v18 did not expose a
clock port on this public path.

The bundle command included the three advertised refs plus the payload root
`369ada79ceb9bf744f3d6fc94184490d6e888bda`. Without that final raw tree OID,
Git would not discover the payload referenced only by JSON text.

## Restore contract

`restoreV18RetainedSubstrateFixture()` initializes an isolated repository,
verifies the bundle SHA-256, fetches all advertised refs, confirms their exact
heads and Git object types, checks writer-chain lengths, decodes the retained
state-cache blob, and proves that the packed payload tree exists.

The fixture is intentionally small: the bundle is under 5 KiB, while retaining
the same object-type boundary that stranded the heavier live store.
