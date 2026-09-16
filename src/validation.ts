import type { DesignSystemSnapshot, ImpactConfig, ImpactReport, MigrationManifest, SemanticDiff } from './model.js';

type ArtifactKind = DesignSystemSnapshot['kind'] | SemanticDiff['kind'] | ImpactReport['kind'] | MigrationManifest['kind'];
export type ArtifactByKind<K extends ArtifactKind> = K extends DesignSystemSnapshot['kind'] ? DesignSystemSnapshot : K extends SemanticDiff['kind'] ? SemanticDiff : K extends ImpactReport['kind'] ? ImpactReport : MigrationManifest;

export class ValidationError extends Error {
  override readonly name = 'ValidationError';
  constructor(readonly code: `DSI${number}`, message: string) { super(`${code}: ${message}`); }
}

export function validateConfig(value: unknown): ImpactConfig {
  const config = object(value, 'DSI1002', 'Configuration must be a JSON object.');
  const designSystem = object(config.designSystem, 'DSI1003', 'designSystem must be an object.');
  string(designSystem.package, 'DSI1003', 'designSystem.package must be a non-empty string.');
  string(designSystem.entry, 'DSI1003', 'designSystem.entry must be a non-empty string.');
  optionalStringArray(config.tokens, 'DSI1004', 'tokens'); optionalStringArray(config.consumers, 'DSI1004', 'consumers');
  if (config.ownership !== undefined) { const ownership = object(config.ownership, 'DSI1005', 'ownership must be an object.'); string(ownership.codeowners, 'DSI1005', 'ownership.codeowners must be a non-empty string.'); }
  if (config.migrations !== undefined) { const migrations = object(config.migrations, 'DSI1006', 'migrations must be an object.'); if (migrations.schemaVersion !== 1) throw new ValidationError('DSI1006', 'migrations.schemaVersion must be 1.'); }
  return value as ImpactConfig;
}

export function validateArtifact<K extends ArtifactKind>(value: unknown, kind: K): ArtifactByKind<K> {
  const artifact = object(value, 'DSI1301', `Expected a ${kind} object.`);
  if (artifact.kind !== kind) throw new ValidationError('DSI1302', `Expected artifact kind "${kind}", received ${JSON.stringify(artifact.kind)}.`);
  if (artifact.schemaVersion !== 1) throw new ValidationError('DSI1303', `Unsupported ${kind} schemaVersion ${JSON.stringify(artifact.schemaVersion)}; expected 1.`);
  if (kind === 'design-system-snapshot') {
    const packageInfo = object(artifact.package, 'DSI1304', 'Snapshot package must be an object.'); string(packageInfo.name, 'DSI1304', 'Snapshot package.name must be a non-empty string.');
    record(artifact.components, 'DSI1304', 'Snapshot components must be an object.'); record(artifact.tokens, 'DSI1304', 'Snapshot tokens must be an object.');
    for (const item of array(artifact.exports, 'DSI1304', 'Snapshot exports must be an array.')) { const exported = object(item, 'DSI1304', 'Every snapshot export must be an object.'); string(exported.name, 'DSI1304', 'Every snapshot export needs a name.'); string(exported.importPath, 'DSI1304', 'Every snapshot export needs an importPath.'); }
    array(artifact.diagnostics, 'DSI1304', 'Snapshot diagnostics must be an array.');
  } else if (kind === 'design-system-diff') {
    const from = object(artifact.from, 'DSI1305', 'Diff from must be an object.'); const to = object(artifact.to, 'DSI1305', 'Diff to must be an object.'); string(from.name, 'DSI1305', 'Diff from.name is required.'); string(to.name, 'DSI1305', 'Diff to.name is required.');
    for (const item of array(artifact.changes, 'DSI1305', 'Diff changes must be an array.')) { const change = object(item, 'DSI1305', 'Every semantic change must be an object.'); string(change.id, 'DSI1305', 'Every semantic change needs an id.'); string(change.category, 'DSI1305', 'Every semantic change needs a category.'); string(change.changeType, 'DSI1305', 'Every semantic change needs a changeType.'); if (change.evidence !== 'observed') throw new ValidationError('DSI1305', 'Semantic change evidence must be "observed".'); object(change.subject, 'DSI1305', 'Every semantic change needs a subject.'); }
    array(artifact.diagnostics, 'DSI1305', 'Diff diagnostics must be an array.');
  } else if (kind === 'design-system-impact-report') {
    string(artifact.package, 'DSI1306', 'Impact package must be a non-empty string.');
    for (const item of array(artifact.impacts, 'DSI1306', 'Impact impacts must be an array.')) { const impact = object(item, 'DSI1306', 'Every impact must be an object.'); string(impact.id, 'DSI1306', 'Every impact needs an id.'); string(impact.changeId, 'DSI1306', 'Every impact needs a changeId.'); const location = object(impact.location, 'DSI1306', 'Every impact needs a location.'); string(location.file, 'DSI1306', 'Every impact location needs a file.'); positiveInteger(location.line, 'DSI1306', 'Impact location line'); positiveInteger(location.column, 'DSI1306', 'Impact location column'); }
    array(artifact.diagnostics, 'DSI1306', 'Impact diagnostics must be an array.');
  } else {
    const migration = object(artifact.migration, 'DSI1307', 'Migration metadata must be an object.'); string(migration.package, 'DSI1307', 'Migration package is required.');
    for (const item of array(artifact.tasks, 'DSI1307', 'Migration tasks must be an array.')) { const task = object(item, 'DSI1307', 'Every migration task must be an object.'); string(task.id, 'DSI1307', 'Every migration task needs an id.'); string(task.instruction, 'DSI1307', 'Every migration task needs an instruction.'); array(task.changeIds, 'DSI1307', 'Every migration task needs changeIds.'); array(task.locations, 'DSI1307', 'Every migration task needs locations.'); }
    array(artifact.diagnostics, 'DSI1307', 'Migration diagnostics must be an array.');
  }
  return value as ArtifactByKind<K>;
}

function object(value: unknown, code: `DSI${number}`, message: string): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError(code, message); return value as Record<string, unknown>; }
function array(value: unknown, code: `DSI${number}`, message: string): unknown[] { if (!Array.isArray(value)) throw new ValidationError(code, message); return value; }
function record(value: unknown, code: `DSI${number}`, message: string): Record<string, unknown> { return object(value, code, message); }
function string(value: unknown, code: `DSI${number}`, message: string): string { if (typeof value !== 'string' || value.length === 0) throw new ValidationError(code, message); return value; }
function positiveInteger(value: unknown, code: `DSI${number}`, field: string): number { if (!Number.isInteger(value) || (value as number) < 1) throw new ValidationError(code, `${field} must be a positive integer.`); return value as number; }
function optionalStringArray(value: unknown, code: `DSI${number}`, field: string): void { if (value === undefined) return; if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.length === 0)) throw new ValidationError(code, `${field} must be an array of non-empty strings.`); }
