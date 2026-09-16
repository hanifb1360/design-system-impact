# Changelog

## 0.1.0 - Unreleased

- Initial deterministic snapshot, semantic diff, impact analysis, migration planning, ownership, reporting, CLI, and programmatic API vertical slice.
- Added runtime configuration and artifact validation, explicit wrapped-component extraction, compiled CLI coverage, and packed-package smoke tests.
- Added a manual, environment-protected npm provenance workflow.
- Added package export/subpath discovery, multi-path export diffs, and subpath-aware consumer imports.
- Added deterministic multi-level local barrel and named-alias tracing for consumer imports.
- Added `DSI2101` diagnostics for JSX spreads and suppressed false definite impacts when a spread may supply a newly required prop.
- Added AST-derived JSON token line and column locations and ignored DTCG group metadata such as `$type`.
- Added published Draft 2020-12 JSON Schemas and compatibility tests for all four v1 artifact formats.
