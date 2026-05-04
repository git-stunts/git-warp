---
id: SPEC_static-text-test-sludge-domain-purity
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/domain/trust/domainPurity.test.ts`

**Effort:** S

This file scans trust-domain source text for `process.env`,
infrastructure/adapters imports, and direct console usage.

Replace it with the existing TypeScript policy checker or an AST-backed
architecture rule. Behavioral tests should prove trust services receive
configuration, logging, and infrastructure through ports.
