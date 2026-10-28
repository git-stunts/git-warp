# Cone showcase baseline before slices 2 and 3

These results come from `feat/1039-cone-showcase` on top of `17084f178` (slice 1:
cone records and ingest). The public read and write paths at that commit still
use the checkpoint-tail engine. Each run used the
`docker/Dockerfile.node22-slim` image, limited to 4 CPUs and 6 GiB, and the
command `npm run witness:cone-showcase`.

- `example-output.txt`: the annotations example exited 1. Every intent write
  derived except `deleteComment`, which was obstructed with
  `git-warp.write.missing-bounded-basis` because `edge.remove` needs a basis
  (#1037). Every margins read was obstructed with `missing_bounded_basis`
  because no checkpoint basis exists, and the example never runs repair.
- `cone-showcase-<N>.json` and `summary.md`: one-patch saves derived at every
  scale, at 26 Git processes each. Every margins read and every cold open was
  obstructed with `missing_bounded_basis`. The read latencies and the
  2 Git processes per read measure the refusal, not a read. No read cost could
  be measured before slices 2 and 3.
