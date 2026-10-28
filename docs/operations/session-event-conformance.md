# Session-event consumer conformance

The public CLI proof in `test/bats/session-event-retention.bats` captures a
complete consumer event as an opaque UTF-8 property value. It preserves four
separate identities: application intent, application subject, allocated graph
subject, and causal occurrence. Each entity birth returns one opaque patch
support handle and anchored, pinned publication retention evidence. Fresh CLI
processes recover the exact original UTF-8 bytes by the returned graph subject.

The fixture first admits a direct event into the authoritative `events`
worldline, then explicitly forks Alpha and Beta Strands at the same basis. Each
strand admits its own event and also records itself on the direct event, so
both strands name that element. Alpha settles into the unchanged target with
the exact `derived` outcome and complete bound plan/evidence: the five bound
inputs plus the three cone roots the preview compared. Alpha's settlement
changes the direct event, which Beta's patches name, so Beta then receives
`git-warp.settlement-common-basis-required` on both preview and apply (the
footprint-records policy, see [Strands](../topics/strands.md#settlement)). The
stored plan file contains the full preview envelope; applying its plan
preserves the preview's exact classification.

After the obstruction, Alpha remains visible in the target. Both candidates
remain readable in their original Strands. Repeating the same negative target
reading before and after Beta's attempted settlement produces identical
observations, including each reading's own basis, tick and receipt support.
Negative observations carry cone-record support; absence does not imply an
empty evidence list.

The fixture runs 28 independent public CLI processes: five writes, two forks,
two settlement previews, two applies, four cone basis repairs and thirteen
observations. It does not import private runtime code or decode occurrence IDs.
Candidate authority is established by explicit fork/Strand selection. Consumer
conflict and supersession rules remain application concerns.

Run the proof through COPY-based Docker:

```sh
bash scripts/run-in-docker.sh bats \
  --show-output-of-passing-tests test/bats/session-event-retention.bats
bash scripts/run-in-docker.sh env PYTHONOPTIMIZE=1 bats \
  --show-output-of-passing-tests test/bats/session-event-retention.bats
```

Ten BATS checks verify the captured public evidence. Seven controlled mutations
must fail their named load-bearing checks: conflated identity, missing birth
support, changed payload bytes, incomplete settlement support, a changed stale
basis reason, forced target visibility and an unbound negative-reading basis.
The Python oracle uses explicit failures so optimization cannot remove these
checks. This proof adds tests and operator documentation without changing
production behavior. Bounded Mermaid lifecycle validation (#870) is its
recorded publication prerequisite.
