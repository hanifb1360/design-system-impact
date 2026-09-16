# Contributing

Use Node.js 20 or newer. Run `npm install`, then `npm run check` before opening a pull request. Add behavior-focused fixtures for semantic changes and impacts; do not rely only on large serialized snapshots. New analyzers must emit a diagnostic when incomplete analysis could mislead users. Preserve the separation between observation, author guidance, and inference, and never execute analyzed project source.

Changes should include tests and documentation when public schemas or commands change. Machine-readable schemas require explicit versioning and a migration note.
