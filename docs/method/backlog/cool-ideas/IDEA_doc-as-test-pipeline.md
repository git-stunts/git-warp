---
id: IDEA_doc-as-test-pipeline
blocked_by: []
blocks: []
---

# Doc-as-test pipeline: run code snippets from docs as tests

Create `test/examples/` that imports and executes every code snippet
from GETTING_STARTED.md, GUIDE.md, and README.md. Extract fenced
code blocks tagged `typescript` or `js`, wrap them in test harnesses,
and run them as part of the test suite.

This would have caught the v16→v17 API drift automatically — the
stale `WarpApp.open()` examples in GETTING_STARTED.md would have
failed as soon as the API changed.

Prior art: Rust's `doc-tests`, Python's `doctest`, Go's `Example_*`
test functions.
