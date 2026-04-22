---
id: PROTO_encrypted-trailer-rename
blocked_by: []
blocks: []
---

# Rename `encrypted` trailer to `eg-encrypted`

The Git commit trailer key `encrypted` should be namespaced to avoid
collisions. But renaming is a wire format change — existing commits
use `encrypted`. Needs the same ADR + migration approach as edge
property ops: keep reading old key, start writing new one, eventually
stop reading old. Breaking change, major version bump.
