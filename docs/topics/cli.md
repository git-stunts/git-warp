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

That patch declares an empty read set and exactly one subject write. This
describes the operands encoded by the patch, not every dependency in the
calling application. If the caller read graph state before constructing the
JSON payload, that dependency remains undeclared. The intent requires at least
one property.

It does **not** check that the subject is new. `git warp write` goes through a
lane, and a lane writer never materializes, so the uniqueness guard has no basis
in which to observe an existing id and never fires. Writing the same subject
twice is admitted both times, whether from one lane or from two writers, and the
join merges the results into one entity with a two-patch cone. The guard exists
for a directly constructed `PatchBuilder` opened against a materialized state.

Use the supplied-subject form only when the application already owns a semantic
identity. Repeated admissions of that subject remain distinct occurrences even
though their provenance cones share one address.

When the fact has no independent semantic key, ask git-warp to allocate the
subject from the same writer-local dot that creates it:

```bash
git warp write \
  --lane users \
  --writer local \
  --json \
  --intent '{"kind":"entity.add","namespace":"entry","properties":{"role":"admin"}}'
```

The CLI JSON envelope exposes only `occurrence.subject` and the opaque
`occurrence.id`; JSON has no comparison methods.

The occurrence fields report how many entity births the admitted write
contains:

- Zero entity births emit `occurrence: null` and omit `occurrences`.
- Exactly one entity birth emits an `occurrence` object and omits
  `occurrences`.
- Two or more entity births emit `occurrence: null` and an ordered
  `occurrences` array.

The `occurrences` order follows the requested Intent array. It is receipt
ordering, not a new claim about causal or application chronology.

The in-process TypeScript `EntityOccurrence` additionally provides `relationTo`
for causal partial-order questions within a worldline; occurrences from
independent worldlines are concurrent. Its `compare` method orders the worldline
first, then uses git-warp's canonical `EventId` linearization for a deterministic
list. Do not parse the allocated subject or occurrence id. Do not use a payload
timestamp for uniqueness or causal order.

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

## Bounded failure diagnostics

Human failure reports use stderr. JSON and JSONL reports use stdout with deterministic key order and retain the existing `error.code`, `error.message`, and optional safe immediate `error.cause` fields. Additive typed cause nodes identify `cause`, `originalError`, `aggregate`, and `cleanup` edges. `typedCode` records a non-CLI runtime code when the legacy top-level classifier remains `E_INTERNAL`. Raw non-Error objects are represented generically, never serialized with arbitrary private fields.

Primary CLI failures retain their code and nonzero status when cleanup also fails. A cleanup failure after success exits with the internal failure status. SIGINT/SIGTERM shutdown errors use the same reporter. Getter calls, coercion methods, raw metadata maps, and stacks are excluded. Reflection failures degrade to a bounded safe report; this does not sandbox arbitrary JavaScript Proxy code.

Defensive defaults inspect at most four cause edges, admit eight display nodes, clip messages to 1024 UTF-8 bytes, and cap the serialized report including its newline at 8192 bytes. These are bounds, not performance measurements. Omission markers are explicit; emergency formatting retains primary code/status. Successful command output has its own existing contract. Home/cwd paths, URL credentials, Bearer/GitHub token patterns, and terminal controls are sanitized while relative paths, Git refs, and object IDs remain intact.
