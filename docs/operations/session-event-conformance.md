# Session-event consumer conformance

v21 retired this proof ([#1054](https://github.com/git-stunts/git-warp/issues/1054)).
The proof drove the public CLI `write`, `fork` and `settle` commands across
fresh processes. v21 removed those commands, so its BATS suite
(`test/bats/session-event-retention.bats`) was deleted with them. The last
version of the suite and of this page stays in Git history.

The identity rules it checked still apply to the internal engine. When
[#1053](https://github.com/git-stunts/git-warp/issues/1053) adds
Coordinate-derived strands and settlement, a new public proof is necessary for
these rules:

- Application intent, application subject, allocated graph subject and causal
  occurrence stay four separate identities.
- A stale common basis obstructs both settlement preview and apply.
- A negative reading keeps its own basis, tick and receipt support.
