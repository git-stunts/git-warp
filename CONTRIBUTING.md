# Contributing to @git-stunts/empty-graph

First off, thank you for considering contributing to this project! It's people like you that make the open-source community such a great place to learn, inspire, and create.

## 📜 Code of Conduct

By participating in this project, you are expected to uphold our Code of Conduct. Please be respectful and professional in all interactions.

## 🛠️ Development Process

### Prerequisites
- Docker and Docker Compose
- Node.js >= 20.0.0 (for local linting)
- **Windows Users**: Must use WSL or Git Bash to run shell-based test scripts locally.

### Workflow
1.  **Fork the repository** and create your branch from `main`.
2.  **Install dependencies**: `npm install`.
3.  **Make your changes**: Ensure you follow our architectural principles (Hexagonal, DDD, one class per file).
4.  **Write tests**: Any new feature or fix *must* include corresponding tests.
5.  **Verify locally**:
    - Run linting: `npm run lint`
    - Run tests in Docker: `docker-compose run --rm test`
6.  **Commit**: Use [Conventional Commits](https://www.conventionalcommits.org/) (e.g., `feat: ...`, `fix: ...`).
7.  **Submit a Pull Request**: Provide a clear description of the changes and link to any relevant issues.

## 🏗️ Architectural Principles
- **Hexagonal Architecture**: Keep the domain pure. Infrastructure details stay in `adapters`.
- **Graph-First Design**: All operations should stream when possible to handle large graphs.
- **Security First**: All Git refs must be validated before use.
- **Immutable Entities**: `GraphNode` and other entities are immutable.

## 🧪 Testing Philosophy
- Tests validate **behavior**, not implementation details
- No spies on internal methods
- Use real Git operations in tests (we have test infrastructure for this)
- Test error types, not error messages

## 🐞 Reporting Bugs
- Use the GitHub issue tracker.
- Provide a minimal reproducible example.
- Include details about your environment (OS, Node version, Git version).

## 📄 License
By contributing, you agree that your contributions will be licensed under its Apache-2.0 License.
