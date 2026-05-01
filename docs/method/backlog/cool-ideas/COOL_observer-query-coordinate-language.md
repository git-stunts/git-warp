# Observer Query Coordinate Language

## Idea

Define a small vocabulary for query execution:

- observer
- aperture
- coordinate
- frontier
- slice
- hologram boundary
- cursor
- stream
- materialization fallback

## Why It Is Cool

It prevents "query" from meaning "whatever RuntimeHost felt like doing
today."

## Guardrails

- Keep it short and operational.
- Tie every noun to code seams and user-facing behavior.
- Do not create abstract theory without implementation relevance.
- Use it to guide future query/read-model and observer cycles.
