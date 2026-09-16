# Design System Impact

`design-system-impact` explains what changed in a React/TypeScript design system, which consumers are affected, and what an agent or developer must migrate. It is deterministic, works offline, executes no analyzed source code, sends no source anywhere, and has no telemetry.

It complements [`design-system-guard`](https://www.npmjs.com/package/design-system-guard): Impact plans a migration after a design-system API evolves; Guard validates that the resulting application still follows design-system policy.

## Status

This is an initial production-oriented vertical slice. It supports exported function components with statically resolvable props, TypeScript literal unions and requiredness, JSON/DTCG-style tokens, CSS custom properties, JSX usage, workspace attribution, basic CODEOWNERS rules, explicit migration hints, and JSON/text/Markdown output. See [Known limitations](#known-limitations).

## Install

```sh
npm install --save-dev design-system-impact
```

Node.js 20 or newer is required.

## Quick start

Create `design-system-impact.config.json` (or run `npx design-system-impact init`):

```json
{
  "designSystem": { "package": "@acme/ui", "entry": "./src/index.ts" },
  "tokens": ["./src/tokens/**/*.json", "./src/**/*.css"],
  "consumers": ["./apps", "./packages"],
  "ownership": { "codeowners": "./CODEOWNERS" },
  "migrations": {
    "schemaVersion": 1,
    "componentProps": {
      "Button": {
        "tone": { "replacedBy": "variant", "values": { "critical": "danger" } }
      }
    }
  }
}
```

Capture and compare contracts:

```sh
design-system-impact snapshot --output snapshots/1.json
# change the design system
design-system-impact snapshot --output snapshots/2.json
design-system-impact diff snapshots/1.json snapshots/2.json --format json --output changes.json
design-system-impact impact changes.json --format json --output impacts.json
design-system-impact plan changes.json impacts.json --format json --output migration.json
```

Given `tone?: "default" | "critical"`, a new `variant?: "default" | "danger"`, and `<Button tone="critical">`, the diff records one observed removal and one observed addition. It does **not** claim a rename. Only the author-provided hint makes the resulting `tone="critical"` → `variant="danger"` task automatic.

For CI, `design-system-impact check changes.json` exits 1 when a breaking change exists. Add `--consumers` to fail only when a breaking change reaches an analyzed consumer. Exit 2 means invalid usage/configuration; exit 3 means an unexpected analysis failure. Machine output goes to stdout; errors go to stderr.

## Programmatic API

```ts
import { createSnapshot, diffSnapshots, analyzeImpact, createMigrationPlan } from 'design-system-impact';
```

The CLI is a thin wrapper over these functions. Public artifacts use `schemaVersion: 1` and stable serialization. Snapshot source paths are repository-relative and slash-normalized.

## Supported patterns

- Named public exports from a TypeScript entry point
- Function/arrow components whose first parameter resolves to a props type
- Required and optional props, primitive display types, literal unions, and `@deprecated`
- DTCG-style `$value`, legacy `value`, nested JSON tokens, and `{alias.path}` aliases
- CSS custom-property declarations and `var(--token)` aliases/usages
- Named component imports and JSX attributes
- Nearest `package.json` workspace attribution and common CODEOWNERS patterns

## Known limitations

- Generic, polymorphic, class, wrapped (`memo`/`forwardRef`), conditional, and externally declared props may be incomplete; unsupported declarations are not fabricated.
- Consumer analysis follows direct named imports and literal JSX attributes. Re-exports, aliases through local variables, spreads, computed values, and runtime token construction need future data-flow analysis.
- JSON configuration is intentionally static and safe. `defineConfig` is typed for programmatic use, but the CLI does not execute TypeScript configuration.
- CODEOWNERS support covers common last-match-wins glob rules, not every escaping nuance of GitHub's grammar.
- Token location lines in JSON are file-level in v0.1. CSS locations are exact.
- Rename inference is deliberately absent. Explicit migration hints are authoritative guidance; observations remain separate.

## Design philosophy

Facts, author guidance, and hypotheses must remain distinct. Snapshots contain observed contracts. Diffs contain observed changes. Configuration can supply author-owned migration intent. The planner marks work automatic only when that intent fully covers the observed literal usage. AI is a consumer of the manifest, never an authority in the analysis loop.

## Reports

Use `--format json` for programs and agents, `text` for terminals, or `markdown` for CI artifacts and pull requests. JSON output contains no ANSI codes or diagnostic chatter.

## Development

```sh
npm install
npm run check
node dist/cli.js --help
npm pack --dry-run
```

See [docs/architecture.md](docs/architecture.md), [docs/research.md](docs/research.md), and [CONTRIBUTING.md](CONTRIBUTING.md).

To run the repository's complete Button example after building:

```sh
node dist/cli.js snapshot --root test/fixtures/v1 -o /tmp/dsi-v1.json
node dist/cli.js snapshot --root test/fixtures/v2 -o /tmp/dsi-v2.json
node dist/cli.js diff /tmp/dsi-v1.json /tmp/dsi-v2.json --root . -f json -o /tmp/dsi-diff.json
node dist/cli.js impact /tmp/dsi-diff.json --root test/fixtures/consumer -f json -o /tmp/dsi-impact.json
node dist/cli.js plan /tmp/dsi-diff.json /tmp/dsi-impact.json --root test/fixtures/consumer -f markdown
```
