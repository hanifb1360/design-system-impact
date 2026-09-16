#!/usr/bin/env node
import { parseArgs } from 'node:util'; import { readFile, writeFile } from 'node:fs/promises'; import path from 'node:path';
import { analyzeImpact } from './impact.js'; import { loadConfig } from './config.js'; import { diffSnapshots } from './diff.js'; import { createMigrationPlan } from './migration.js'; import { createCodeownersResolver } from './ownership.js'; import { renderArtifact, type ReportFormat } from './reporters.js'; import { snapshotFromConfig } from './snapshot.js'; import { stableStringify } from './utils.js';
import type { DesignSystemSnapshot, ImpactReport, SemanticDiff } from './model.js';
const HELP = `design-system-impact — semantic design system evolution analysis

Usage:
  design-system-impact init [--force]
  design-system-impact snapshot [--output file]
  design-system-impact diff <before.json> <after.json> [--format json|text|markdown] [--output file]
  design-system-impact impact <diff.json> [--format json|text|markdown] [--output file]
  design-system-impact plan <diff.json> <impact.json> [--format json|text|markdown] [--output file]
  design-system-impact check <diff.json> [--consumers]

Options:
  --config <file>   Configuration JSON (default: design-system-impact.config.json)
  --root <path>     Repository root (default: current directory)
  --format <format> Reporter format (default: text; snapshot defaults to json)
  --output <file>   Write output to a file instead of stdout
  --help            Show help

Exit codes: 0 success, 1 blocking impact, 2 invalid usage/configuration, 3 runtime failure.
`;
async function main(): Promise<void> {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { help: { type: 'boolean', short: 'h' }, config: { type: 'string' }, root: { type: 'string' }, output: { type: 'string', short: 'o' }, format: { type: 'string', short: 'f' }, force: { type: 'boolean' }, consumers: { type: 'boolean' } } });
  if (values.help || !positionals[0]) { process.stdout.write(HELP); return; }
  const command = positionals[0]; const root = path.resolve(values.root ?? process.cwd());
  if (command === 'init') { const destination = path.join(root, values.config ?? 'design-system-impact.config.json'); try { if (!values.force) await readFile(destination); throw new UsageError(`Configuration already exists: ${destination}. Use --force to replace it.`); } catch (error) { if (error instanceof UsageError) throw error; } await writeFile(destination, stableStringify({ designSystem: { package: '@acme/ui', entry: './src/index.ts' }, tokens: ['./src/tokens/**/*.json', './src/**/*.css'], consumers: ['./apps', './packages'], ownership: { codeowners: './CODEOWNERS' } })); process.stdout.write(`Created ${path.relative(root, destination)}\n`); return; }
  const format = parseFormat(values.format);
  if (command === 'snapshot') { const config = await loadConfig(root, values.config); const snapshot = await snapshotFromConfig(root, config); await output(stableStringify(snapshot), values.output, root); return; }
  if (command === 'diff') { requireArgs(positionals, 3, 'diff requires <before.json> and <after.json>.'); const result = diffSnapshots(await json<DesignSystemSnapshot>(positionals[1]!, root), await json<DesignSystemSnapshot>(positionals[2]!, root)); await output(renderArtifact(result, format), values.output, root); return; }
  if (command === 'impact') { requireArgs(positionals, 2, 'impact requires <diff.json>.'); const config = await loadConfig(root, values.config); const diff = await json<SemanticDiff>(positionals[1]!, root); const ownership = config.ownership ? await createCodeownersResolver(path.resolve(root, config.ownership.codeowners)) : undefined; const report = await analyzeImpact({ root, consumers: config.consumers ?? ['.'], packageName: config.designSystem.package, diff, ...(ownership ? { ownership } : {}) }); await output(renderArtifact(report, format), values.output, root); return; }
  if (command === 'plan') { requireArgs(positionals, 3, 'plan requires <diff.json> and <impact.json>.'); const config = await loadConfig(root, values.config); const result = createMigrationPlan(await json<SemanticDiff>(positionals[1]!, root), await json<ImpactReport>(positionals[2]!, root), config.migrations); await output(renderArtifact(result, format), values.output, root); return; }
  if (command === 'check') { requireArgs(positionals, 2, 'check requires <diff.json>.'); const diff = await json<SemanticDiff>(positionals[1]!, root); if (values.consumers) { const config = await loadConfig(root, values.config); const ownership = config.ownership ? await createCodeownersResolver(path.resolve(root, config.ownership.codeowners)) : undefined; const report = await analyzeImpact({ root, consumers: config.consumers ?? ['.'], packageName: config.designSystem.package, diff, ...(ownership ? { ownership } : {}) }); process.stdout.write(renderArtifact(report, format)); if (report.impacts.some((i) => diff.changes.find((c) => c.id === i.changeId)?.severity === 'breaking')) process.exitCode = 1; } else { process.stdout.write(renderArtifact(diff, format)); if (diff.changes.some((c) => c.severity === 'breaking')) process.exitCode = 1; } return; }
  throw new UsageError(`Unknown command: ${command}`);
}
class UsageError extends Error {}
function requireArgs(values: string[], count: number, message: string): void { if (values.length < count) throw new UsageError(message); }
function parseFormat(value: string | undefined): ReportFormat { if (!value) return 'text'; if (value === 'json' || value === 'text' || value === 'markdown') return value; throw new UsageError(`Unknown format: ${value}`); }
async function json<T>(file: string, root: string): Promise<T> { return JSON.parse(await readFile(path.resolve(root, file), 'utf8')) as T; }
async function output(text: string, file: string | undefined, root: string): Promise<void> { if (file) await writeFile(path.resolve(root, file), text); else process.stdout.write(text); }
main().catch((error: unknown) => { const usage = error instanceof UsageError || (error instanceof Error && /^DSI10/.test(error.message)); process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = usage ? 2 : 3; });
