import type { DesignSystemSnapshot, SemanticChange, SemanticDiff } from './model.js';
import { compareId } from './utils.js';
const idPart = (value: string): string => encodeURIComponent(value).replaceAll('%', '~');
function change(input: Omit<SemanticChange, 'evidence'>): SemanticChange { return { ...input, evidence: 'observed' }; }
export function diffSnapshots(before: DesignSystemSnapshot, after: DesignSystemSnapshot): SemanticDiff {
  const changes: SemanticChange[] = [];
  const componentNames = new Set([...Object.keys(before.components), ...Object.keys(after.components)]);
  for (const name of [...componentNames].sort()) {
    const oldComponent = before.components[name]; const newComponent = after.components[name]; const base = `component.${idPart(name)}`;
    if (!oldComponent) { changes.push(change({ id: `${base}.added`, category: 'component', changeType: 'added', severity: 'non-breaking', subject: { component: name }, after: newComponent })); continue; }
    if (!newComponent) { changes.push(change({ id: `${base}.removed`, category: 'component', changeType: 'removed', severity: 'breaking', subject: { component: name }, before: oldComponent })); continue; }
    if (!oldComponent.deprecated && newComponent.deprecated) changes.push(change({ id: `${base}.deprecated`, category: 'component', changeType: 'deprecated', severity: 'potentially-breaking', subject: { component: name }, after: newComponent.deprecated }));
    const props = new Set([...Object.keys(oldComponent.props), ...Object.keys(newComponent.props)]);
    for (const prop of [...props].sort()) {
      const oldProp = oldComponent.props[prop]; const newProp = newComponent.props[prop]; const propBase = `${base}.prop.${idPart(prop)}`;
      if (!oldProp) { changes.push(change({ id: `${propBase}.added`, category: 'component-prop', changeType: 'added', severity: newProp!.required ? 'breaking' : 'non-breaking', subject: { component: name, property: prop }, after: newProp })); continue; }
      if (!newProp) { changes.push(change({ id: `${propBase}.removed`, category: 'component-prop', changeType: 'removed', severity: 'breaking', subject: { component: name, property: prop }, before: oldProp })); continue; }
      if (!oldProp.deprecated && newProp.deprecated) changes.push(change({ id: `${propBase}.deprecated`, category: 'component-prop', changeType: 'deprecated', severity: 'potentially-breaking', subject: { component: name, property: prop }, after: newProp.deprecated }));
      if (oldProp.required !== newProp.required) changes.push(change({ id: `${propBase}.requiredness`, category: 'component-prop', changeType: 'requiredness-changed', severity: newProp.required ? 'breaking' : 'non-breaking', subject: { component: name, property: prop }, before: oldProp.required, after: newProp.required }));
      const oldSet = new Set(oldProp.literals ?? []); const newSet = new Set(newProp.literals ?? []);
      if (oldSet.size && newSet.size && !setEqual(oldSet, newSet)) {
        const removed = [...oldSet].filter((v) => !newSet.has(v)); const added = [...newSet].filter((v) => !oldSet.has(v));
        const kind = removed.length && !added.length ? 'union-narrowed' : added.length && !removed.length ? 'union-expanded' : 'type-changed';
        changes.push(change({ id: `${propBase}.${kind}`, category: 'component-prop', changeType: kind, severity: removed.length ? 'breaking' : 'non-breaking', subject: { component: name, property: prop }, before: oldProp.literals, after: newProp.literals }));
      } else if (oldProp.type !== newProp.type) changes.push(change({ id: `${propBase}.type`, category: 'component-prop', changeType: 'type-changed', severity: 'potentially-breaking', subject: { component: name, property: prop }, before: oldProp.type, after: newProp.type }));
    }
  }
  const exportNames = new Set([...before.exports.map((v) => v.name), ...after.exports.map((v) => v.name)]);
  for (const name of [...exportNames].sort()) {
    const oldPaths = new Set(before.exports.filter((item) => item.name === name).map((item) => item.importPath));
    const newPaths = new Set(after.exports.filter((item) => item.name === name).map((item) => item.importPath));
    const removed = [...oldPaths].filter((item) => !newPaths.has(item)).sort(); const added = [...newPaths].filter((item) => !oldPaths.has(item)).sort();
    if (oldPaths.size === 1 && newPaths.size === 1 && removed.length === 1 && added.length === 1) changes.push(change({ id: `export.${idPart(name)}.path`, category: 'export', changeType: 'path-changed', severity: 'breaking', subject: { export: name }, before: removed[0], after: added[0] }));
    else {
      for (const importPath of removed) changes.push(change({ id: `export.${idPart(name)}.${idPart(importPath)}.removed`, category: 'export', changeType: 'removed', severity: 'breaking', subject: { export: name }, before: importPath }));
      for (const importPath of added) changes.push(change({ id: `export.${idPart(name)}.${idPart(importPath)}.added`, category: 'export', changeType: 'added', severity: 'non-breaking', subject: { export: name }, after: importPath }));
    }
  }
  const tokenNames = new Set([...Object.keys(before.tokens), ...Object.keys(after.tokens)]);
  for (const name of [...tokenNames].sort()) { const a = before.tokens[name]; const b = after.tokens[name]; const base = `token.${idPart(name)}`;
    if (!a) changes.push(change({ id: `${base}.added`, category: 'token', changeType: 'added', severity: 'non-breaking', subject: { token: name }, after: b }));
    else if (!b) changes.push(change({ id: `${base}.removed`, category: 'token', changeType: 'removed', severity: 'breaking', subject: { token: name }, before: a }));
    else { if (JSON.stringify(a.value) !== JSON.stringify(b.value)) changes.push(change({ id: `${base}.value`, category: 'token', changeType: 'value-changed', severity: 'potentially-breaking', subject: { token: name }, before: a.value, after: b.value })); if (a.alias !== b.alias) changes.push(change({ id: `${base}.alias`, category: 'token', changeType: 'alias-changed', severity: 'potentially-breaking', subject: { token: name }, before: a.alias, after: b.alias })); }
  }
  return { schemaVersion: 1, kind: 'design-system-diff', from: before.package, to: after.package, changes: changes.sort(compareId), diagnostics: [...before.diagnostics, ...after.diagnostics] };
}
function setEqual(a: Set<string>, b: Set<string>): boolean { return a.size === b.size && [...a].every((v) => b.has(v)); }
