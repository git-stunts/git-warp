# CLI guide

The CLI follows the same vocabulary as the TypeScript API and MCP server:

> Observe Lanes. Keep Receipts.

v21 removed the `write`, `fork` and `settle` commands and the `--strand`
option ([#1054](https://github.com/git-stunts/git-warp/issues/1054)). Write
through the package: `warp.as(writer).execute(intent)` on a `Warp` opened with
your `WarpAccessPort`. The commands are `observe`, `receipt`, `doctor`,
`repair`, `audit` and `mcp`.

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
--writer <id>     Runtime writer identity (default: cli)
--json            Emit one canonical JSON envelope
--jsonl           Emit canonical JSON Lines for streaming output
```

Every command opens the local Runtime resources it needs and closes them before
returning. Commands do not expose Runtime handles, Git object identifiers, or
cache internals.

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

## Receipts and diagnostics

Render a saved Receipt through the same human renderer used by observe:

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

## Bounded failure diagnostics

Human failure reports use stderr. JSON and JSONL reports use stdout with deterministic key order and retain the existing `error.code`, `error.message`, and optional safe immediate `error.cause` fields. Additive typed cause nodes identify `cause`, `originalError`, `aggregate`, and `cleanup` edges. `typedCode` records a non-CLI runtime code when the legacy top-level classifier remains `E_INTERNAL`. Raw non-Error objects are represented generically, never serialized with arbitrary private fields.

Primary CLI failures retain their code and nonzero status when cleanup also fails. A cleanup failure after success exits with the internal failure status. SIGINT/SIGTERM shutdown errors use the same reporter. Getter calls, coercion methods, raw metadata maps, and stacks are excluded. Reflection failures degrade to a bounded safe report; this does not sandbox arbitrary JavaScript Proxy code.

Defensive defaults inspect at most four cause edges, admit eight display nodes, clip messages to 1024 UTF-8 bytes, and cap the serialized report including its newline at 8192 bytes. These are bounds, not performance measurements. Omission markers are explicit; emergency formatting retains primary code/status. Successful command output has its own existing contract. Home/cwd paths, URL credentials, Bearer/GitHub token patterns, and terminal controls are sanitized while relative paths, Git refs, and object IDs remain intact.
