import type { ImpactReport, MigrationHints, MigrationManifest, MigrationTask, SemanticDiff } from './model.js';
import { compareId } from './utils.js';
export function createMigrationPlan(diff: SemanticDiff, report: ImpactReport, hints?: MigrationHints): MigrationManifest {
  const tasks: MigrationTask[] = [];
  for (const impact of report.impacts) {
    const change = diff.changes.find((item) => item.id === impact.changeId); if (!change) continue;
    const component = change.subject.component; const prop = change.subject.property;
    const hint = component && prop ? hints?.componentProps?.[component]?.[prop] : undefined;
    const mappedValue = impact.observedValue && hint?.values?.[impact.observedValue];
    const automatic = Boolean(hint && (!impact.observedValue || mappedValue));
    const from = prop ? `${component}.${prop}${impact.observedValue ? `="${impact.observedValue}"` : ''}` : impact.subject;
    const to = hint ? `${component}.${hint.replacedBy}${mappedValue ? `="${mappedValue}"` : ''}` : undefined;
    const task: MigrationTask = {
      id: `task.${impact.id}`, changeIds: [change.id], title: automatic ? `Replace ${from} with ${to}` : `Review ${from}`,
      locations: [impact.location], instruction: automatic ? `At the listed location, rename prop "${prop}" to "${hint!.replacedBy}"${mappedValue ? ` and replace literal value "${impact.observedValue}" with "${mappedValue}"` : ''}. Preserve all unrelated JSX and behavior.` : `Review this usage against change ${change.id}. No deterministic replacement guidance was supplied; do not guess semantic equivalence.`,
      automatic, confidence: automatic ? 'high' : impact.confidence, ...(to ? { replacement: { from, to } } : {})
    }; tasks.push(task);
  }
  return { schemaVersion: 1, kind: 'design-system-migration-manifest', migration: { package: diff.to.name, ...(diff.from.version ? { from: diff.from.version } : {}), ...(diff.to.version ? { to: diff.to.version } : {}) }, tasks: tasks.sort(compareId), diagnostics: [...diff.diagnostics, ...report.diagnostics] };
}
