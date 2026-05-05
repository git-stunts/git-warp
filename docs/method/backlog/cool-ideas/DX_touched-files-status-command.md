---
id: DX_touched-files-status-command
blocked_by: []
blocks: []
feature: api-capabilities
---

# `touched-files-status` — one command to show every file changed on a branch

**Effort:** XS

## Idea

During the JoinReducer-split session, the user caught the agent leaving
`.js` files half-converted after modifying them. The pattern was: the
agent would update an import line in `CheckpointController.js` as part
of a dependency cascade, but not convert the file to `.ts` — leaving
it in a "touched but not converted" state that the scorecard flagged
as 🔴.

The agent had to manually run grep patterns to find these. A single
command would solve it:

```text
scripts/touched-files-status.sh
```

Output:

```text
Touched on cycle/0013-typescript-migration (vs main):

  Converted to .ts ✅
    src/domain/services/MigrationService.ts
    src/domain/services/LegacyAnchorDetector.ts
    src/domain/services/OpNormalizer.ts
    ... (30 more)

  Still .js, body modified ⚠
    src/domain/services/controllers/CheckpointController.js (+25 LOC)
    src/domain/services/controllers/SyncController.js (+12 LOC)

  Still .js, import-only changes 🟡
    src/domain/services/PatchBuilder.js
    src/domain/services/index/IncrementalIndexUpdater.js
    ... (18 more)

  Still .js, untouched 🟢
    (not included — these aren't in the diff)
```

The categories make the sludge visible. "Body modified but still .js"
is the critical signal — that's the deferral pattern the user calls out.

## Why cool (agent-first angle)

- **Kills the "touched but not converted" deferral.** The agent can
  run this every turn and confirm no file is left half-done.
- **Feeds the end-of-turn scorecard.** The scorecard can be generated
  from this output automatically.
- **Helps during cycle close.** Final proof that nothing is left
  partially done.
- **Works for any migration cycle**, not just TS. A future cycle that
  migrates CBOR to a new format would get the same safety net.

## Implementation

Trivial:

```bash
#!/bin/bash
base=$(git merge-base HEAD main)
git diff --name-only "$base"..HEAD | while read f; do
  if [[ "$f" == *.ts ]]; then
    echo "✅ $f"
  elif [[ "$f" == *.js ]]; then
    # Distinguish import-only vs body changes
    lines=$(git diff "$base"..HEAD -- "$f" | grep -cE '^[+-]' | awk '$1 > 4 {print}')
    if [[ -z "$lines" ]]; then
      echo "🟡 $f  (import-only)"
    else
      echo "⚠  $f  (body modified)"
    fi
  fi
done
```

~30 lines of shell. Lives in `scripts/`. Any agent can run it on
demand or wire it into a `/touched` slash command.
