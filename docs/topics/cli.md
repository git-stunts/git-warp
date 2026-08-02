# CLI guide

The v19 CLI follows the same vocabulary as the TypeScript API and MCP server:

> Write Intents. Observe Lanes. Keep Receipts.

The Git subcommand form is canonical:

```bash
git warp <command> [options]
```

The npm executable can also be invoked directly as `git-warp`. v19 does not
ship the former graph-first executable or command aliases.

## Common options

```text
--repo <path>     Local Git repository (default: cwd)
--lane <name>     Runtime Lane name
--strand <name>   Named child strand of --lane
--writer <id>     Runtime writer identity (default: cli)
--json            Emit one canonical JSON envelope
--jsonl           Emit canonical JSON Lines for streaming output
```

Every command opens the local Runtime resources it needs and closes them before
returning. Commands do not expose Runtime handles, Git object identifiers, or
cache internals.

## Write an Intent

```bash
git warp write \
  --lane users \
  --writer local \
  --json \
  --intent '{"kind":"node.add","subject":"user:alice"}'
```

`write` returns a canonical Receipt. Supported public Intent kinds are
`node.add`, `node.remove`, `edge.add`, `edge.remove`, `property.set`, and
`entity.add`.

`entity.add` creates one entity and its initial payload in a single patch:

```bash
git warp write \
  --lane users \
  --writer local \
  --json \
  --intent '{"kind":"entity.add","subject":"user:alice","properties":{"role":"admin"}}'
```

That patch reads nothing and writes exactly one fresh id, so its footprint is
exact by construction and the creation gives the entity an initial singleton
cone. It requires at least one property.

It does **not** check that the subject is new. `git warp write` goes through a
lane, and a lane writer never materializes, so the uniqueness guard has no basis
in which to observe an existing id and never fires. Writing the same subject
twice is admitted both times, whether from one lane or from two writers, and the
join merges the results into one entity with a two-patch cone. The guard exists
for a directly constructed `PatchBuilder` opened against a materialized state.

Choose collision-resistant subjects. One-creation-per-id is your invariant to
keep, and nothing on this path will keep it for you.

## Prepare and observe a Lane

Bounded observations require a prepared materialization basis. The explicit
repair command prepares it:

```bash
git warp repair \
  --lane users \
  --writer local \
  --action materialization
```

Then run a bounded Observer:

```bash
git warp observe \
  --lane users \
  --writer local \
  --jsonl \
  --observer users.exists \
  --reading '{"kind":"node.exists","subject":"user:alice"}'
```

JSON Lines output emits one canonical `Reading` per line followed by the
Observation Receipt. `Reading.value` is the result payload.

## Fork and settle a strand

Create a named child strand:

```bash
git warp fork \
  --lane users \
  --writer local \
  --name review
```

Address the child with the parent Lane plus `--strand`:

```bash
git warp write \
  --lane users \
  --strand review \
  --writer local \
  --intent '{"kind":"property.set","subject":"user:alice","key":"role","value":"admin"}'
```

Settlement is deliberately two-phase:

```bash
git warp settle preview \
  --source users \
  --strand review \
  --target users \
  --writer local \
  --out settlement.json

git warp settle apply \
  --writer local \
  --plan settlement.json
```

The saved artifact is presentation, not executable authority. `apply` reopens
the selected Lanes, derives a fresh Runtime-owned plan, compares every plan
identity field, and fails closed if either Lane moved.

## Receipts and diagnostics

Render a saved Receipt through the same human renderer used by write and
observe:

```bash
git warp receipt show --input receipt.json
```

The remaining diagnostic commands are explicit and bounded:

```bash
git warp doctor --lane users
git warp repair --lane users --action materialization
git warp audit --lane users
```

They may report substrate evidence, but substrate nouns are not application
commands.

## MCP

Start the stdio MCP server with:

```bash
git warp mcp --repo . --writer local
```

The server advertises only the generated v19 capability catalog. Observation
batches and cursors are transport details; the domain results remain Readings
and Receipts.

## Where next

- [v19 API guide](api/README.md)
- [v19 migration guide](../migrations/v19/README.md)
- [Troubleshooting](troubleshooting.md)
