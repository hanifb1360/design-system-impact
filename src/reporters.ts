import type { ImpactReport, MigrationManifest, SemanticDiff } from './model.js';
import { stableStringify } from './utils.js';
export type ReportFormat = 'json' | 'text' | 'markdown';
export function renderArtifact(value: SemanticDiff | ImpactReport | MigrationManifest, format: ReportFormat): string {
  if (format === 'json') return stableStringify(value);
  if (value.kind === 'design-system-diff') return renderDiff(value, format);
  if (value.kind === 'design-system-impact-report') return renderImpact(value, format);
  return renderPlan(value, format);
}
function renderDiff(value: SemanticDiff, format: Exclude<ReportFormat, 'json'>): string {
  if (format === 'markdown') return `# Design system semantic diff\n\n**${value.from.name}**: ${value.from.version ?? 'unknown'} → ${value.to.version ?? 'unknown'}\n\n${value.changes.map((c) => `- **${c.severity}** \`${c.id}\`: ${c.changeType}`).join('\n') || 'No semantic changes.'}\n`;
  return [`Design system diff: ${value.from.name} ${value.from.version ?? '?'} → ${value.to.version ?? '?'}`, ...value.changes.map((c) => `${c.severity.toUpperCase().padEnd(20)} ${c.id} (${c.changeType})`), `${value.changes.length} change(s)`].join('\n') + '\n';
}
function renderImpact(value: ImpactReport, format: Exclude<ReportFormat, 'json'>): string {
  if (format === 'markdown') return `# Consumer impact report\n\n${value.impacts.map((i) => `- \`${i.location.file}:${i.location.line}:${i.location.column}\` — **${i.subject}** affected by \`${i.changeId}\`${i.location.owner ? ` (${i.location.owner.join(', ')})` : ''}`).join('\n') || 'No affected usages found.'}\n`;
  return [`Consumer impact: ${value.package}`, ...value.impacts.map((i) => `${i.location.file}:${i.location.line}:${i.location.column}  ${i.subject}  ← ${i.changeId}${i.location.owner ? `  ${i.location.owner.join(',')}` : ''}`), `${value.impacts.length} affected usage(s)`].join('\n') + '\n';
}
function renderPlan(value: MigrationManifest, format: Exclude<ReportFormat, 'json'>): string {
  if (format === 'markdown') return `# Migration plan\n\n${value.tasks.map((t) => `## ${t.title}\n\n- Classification: **${t.automatic ? 'automatic' : 'review required'}**\n- Confidence: ${t.confidence}\n- Locations: ${t.locations.map((l) => `\`${l.file}:${l.line}\``).join(', ')}\n\n${t.instruction}`).join('\n\n') || 'No migration tasks.'}\n`;
  return [`Migration plan: ${value.migration.package} ${value.migration.from ?? '?'} → ${value.migration.to ?? '?'}`, ...value.tasks.map((t) => `${t.automatic ? 'AUTOMATIC' : 'REVIEW'.padEnd(9)} ${t.title}\n  ${t.locations.map((l) => `${l.file}:${l.line}`).join(', ')}`), `${value.tasks.length} task(s)`].join('\n') + '\n';
}
