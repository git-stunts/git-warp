# Sludge Score Dashboard

## Idea

Build a CLI/report that scores files by sludge signals:

- LOC ceiling
- runtime objects per file
- `unknown`
- `Record<string, unknown>`
- `as any`
- `as unknown as`
- `*Like`
- `Object.create`
- public/internal underscore seams
- constructor DI violations
- god-object smell

Output the top sludge offenders with severity and evidence.

## Why It Is Cool

It turns sewer smell into telemetry.

## Guardrails

- Start as report-only. Do not hard-fail CI until the signal is trusted.
- Raw regex hits are candidates, not automatic guilt.
- Exclude generated, vendor, build, and explicitly irrelevant artifacts.
- Prefer precise categories over one giant shame number.
- Do not let the dashboard become a `SludgeScannerPolicyResolutionService`.
