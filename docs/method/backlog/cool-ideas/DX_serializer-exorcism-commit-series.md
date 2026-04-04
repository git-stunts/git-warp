# Serializer Exorcism Commit Series

One artifact family per commit, each with a before/after boundary
diff. Makes the git history teach the rule: "domain stops speaking
bytes."

Commit series:
1. Patches: PatchJournalPort + CborPatchJournalAdapter
2. Checkpoints: CheckpointStorePort + CborCheckpointStoreAdapter
3. Indexes: IndexStorePort + CborIndexStoreAdapter
4. Provenance + BTR: remaining store ports + adapters

Each commit should read as a self-contained lesson in boundary
placement.

## Source

P5 codec dissolution planning (2026-04-04).
