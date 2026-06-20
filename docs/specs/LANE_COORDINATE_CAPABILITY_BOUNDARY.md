# Lane, Coordinate, and Capability Boundary

This boundary names the substrate-owned nouns that debugger, agent, and UI
protocols may depend on. It does not define session policy, layout, shortcut,
or visualization behavior.

## Substrate Lanes

| Lane kind | Owned by substrate | Meaning |
| --- | --- | --- |
| `worldline` | yes | The admitted application-facing causal lane opened by `openWarpWorldline()`. |
| `strand` | yes | A pinned speculative lane with its own descriptor, base observation, and queued intents. |
| `braid` | yes | A lane relationship that reads across strand overlays without making debugger policy authoritative. |

## Coordinate Anchors

| Coordinate kind | Owned by substrate | Meaning |
| --- | --- | --- |
| `live` | yes | The current admitted frontier for a worldline. |
| `frontier` | yes | An explicit map of writer ids to patch heads. |
| `checkpoint` | yes | A checkpoint-backed reading anchor plus frontier evidence. |
| `strand-base` | yes | The base observation recorded by a strand descriptor. |

## Capability Authority

Substrate capabilities name graph truth or graph-control facts:

- `worldline.commit`
- `worldline.live`
- `worldline.seek`
- `worldline.observer`
- `worldline.optic`
- `strand.create`
- `strand.braid`
- `strand.patch`
- `strand.intent`
- `coordinate.compare`
- `coordinate.transfer-plan`
- `sync.exchange`

Session-policy capabilities name debugger or presentation behavior. They are
not substrate facts:

- `debugger.cursor`
- `debugger.layout`
- `debugger.selection`
- `debugger.theme`
- `session.history`
- `session.shortcut`

## Non-Authority Rule

Mirrors, DTOs, and convenience protocol objects may copy these names, but they
do not become peer authorities. When a debugger or agent disagrees with this
boundary, the substrate boundary wins.
