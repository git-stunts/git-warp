# Strands

v21 removed the public strand, fork and settlement API
([#1054](https://github.com/git-stunts/git-warp/issues/1054)): `Runtime.fork`,
`Runtime.strand`, `Runtime.previewSettlement`, `Runtime.settle`, and the CLI
`fork`, `settle` and `--strand`.
[#1053](https://github.com/git-stunts/git-warp/issues/1053) brings strands back
as Coordinate-derived handles with a preview and settlement journey.

The internal engine still stores strands. This page describes that storage.
A strand is not a Git branch or worktree.

## Identity

A strand's name is a label. Its id is the sha256 of a genesis record: the
lane, the creating writer, a creation occurrence reserved from that writer's
lane counter, the name, and the base frontier digest. Two strands never share
an id, even when created from identical inputs, and renaming a strand keeps
its id. Within one clone a name is unique, and every strand operation accepts
either the name or the id.

Each writer that writes to a strand advances its own chain and mints its own
dots, spelled `@w.<writer>@s.<strand-id>`. Lane writers keep their bare
writer ids. A strand view reads every writer chain on the strand.

## See also

- [v19 API](api/README.md)
- [Git substrate](git-substrate.md)
