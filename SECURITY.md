# Security Model

@git-stunts/empty-graph is designed with security-by-default principles, treating the underlying Git binary as an untrusted subsystem through the `@git-stunts/plumbing` layer.

## 🛡️ Security Through Plumbing

This library inherits all security protections from `@git-stunts/plumbing`:

- **Command Sanitization**: All Git commands are validated through a strict whitelist
- **Argument Injection Prevention**: Refs are validated against strict patterns to prevent command injection
- **No Arbitrary Commands**: Only safe Git plumbing commands are permitted
- **Environment Isolation**: Git processes run in a clean environment with minimal variables

## 🚫 Ref Validation

The `GitGraphAdapter` validates all ref arguments to prevent injection attacks:

- Refs must match the pattern: `^[a-zA-Z0-9._/-]+((~\d*|\^\d*|\.\.[a-zA-Z0-9._/-]+)*)$`
- Refs cannot start with `-` or `--` to prevent option injection
- Invalid refs throw an error immediately

## 🌊 Resource Protection

- **Streaming-First**: Large graph traversals use async generators to prevent OOM
- **Bitmap Indexing**: Sharded Roaring Bitmap indexes enable O(1) lookups without loading entire graphs
- **Delimiter Safety**: Uses ASCII Record Separator (`\x1E`) to prevent message collision

## 🐞 Reporting a Vulnerability

If you discover a security vulnerability, please send an e-mail to [james@flyingrobots.dev](mailto:james@flyingrobots.dev).
