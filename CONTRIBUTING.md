# Contributing to @git-stunts/empty-graph

## Philosophy
- **Lightweight substrate**: This library is a low-level building block for other graph-based tools.
- **Hexagonal Architecture**: Ensure the service logic remains decoupled from Git specific CLI formats.

## Testing
- Use `npm test`.
- All parsing logic in `GraphService` should be unit tested with mock persistence output.
