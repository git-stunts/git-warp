# v19 Performance History

The canonical historical record is the repository's
[`Performance`](https://github.com/git-stunts/git-warp/actions/workflows/performance.yml)
workflow. Every successful main-branch run publishes:

- a browsable Markdown job summary;
- `comparison.json`, containing base/head materialization and oversized
  streaming evidence;
- the merged five-sample result for each ref;
- every raw ABBA batch;
- both hostile-control streaming proof reports; and
- the exact environment, corpus, execution order, and Git/git-cas versions.

Artifacts are named `v19-performance-<commit>` and retained for 90 days.
Release tags for v19 and later must point at a commit with a successful
main-branch performance run, so each published release is anchored to current
evidence rather than a manually selected result.

## Reviewed calibration

The source-reviewed baseline is
[`../calibration.json`](../calibration.json). It records the exact source commit
and environment used to choose the 25-node/five-suffix corpus and demonstrates
that the policy noise floors exceed observed median absolute deviation.

Changes to the corpus, schema, baseline, CPU ratio, noise floor, or memory
envelopes must be ordinary source changes in a pull request. The workflow never
rewrites a generated branch and never promotes the current head into the
baseline automatically.
