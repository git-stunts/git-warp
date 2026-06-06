# Canonical Fixtures And Witnesses

Canonical fixtures are immutable replay inputs. Witnesses are observed outputs or
proof artifacts. Release and goalpost evidence needs both when a claim depends
on data that cannot be reconstructed uniquely from the tag commit.

The rule is:

```text
fixture + replay command -> witness
```

A witness without canonical inputs is not proof. A fixture without a replay
command is not proof.

## Fixture Roots

Use these roots:

| Root | Purpose |
| --- | --- |
| `test/fixtures/canonical/` | Long-lived test fixtures used across releases. |
| `docs/releases/vX.Y.Z/fixtures/` | Release-specific fixture inputs. |
| `docs/design/<cycle>/fixtures/` | Design-cycle proof inputs that should travel with the design packet. |

If an existing committed fixture is already canonical, cite it instead of
copying it.

## Fixture Types

Canonical fixtures may include:

- Git object fixtures;
- causal suffix bundles;
- checkpoint basis manifests;
- graph topology fixtures;
- patch streams;
- migration inputs;
- package artifact manifests;
- CLI input transcripts;
- normalized output snapshots;
- generated artifact manifests;
- large-graph or performance fixtures.

## Witness Types

Witnesses may include:

- unit test output;
- fixture-table test output;
- CLI transcript output;
- generated manifest output;
- package inspection output;
- CI run URL;
- release guard output;
- normalized digest output;
- accessibility, API, operator, or agent evidence.

## Normalization

Host-specific noise must be normalized or excluded explicitly. Examples:

- temp paths;
- absolute paths;
- clocks and timestamps;
- random IDs;
- process IDs;
- registry timestamps;
- network timing;
- unordered host map output;
- tool download timing.

The evidence row must say what was normalized.

## Naming

Prefer names that make the proof purpose obvious:

```text
<goalpost-or-issue>-<claim>-fixture.<ext>
<goalpost-or-issue>-<claim>-witness.<ext>
<goalpost-or-issue>-<claim>-manifest.<ext>
```

Examples:

```text
0629-reading-identity-manifest.fixture.cbor
0629-reading-identity-manifest-witness.txt
0635-cli-holographic-playback-witness.json
```

## Release Packet Rows

Every release evidence row that uses a fixture should name:

- claim;
- fixture path;
- fixture digest, if relevant;
- replay command;
- witness path or CI URL;
- expected deterministic result;
- normalization rule;
- residual risk or `None`.
