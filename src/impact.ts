import { readFile } from 'node:fs/promises'; import path from 'node:path'; import ts from 'typescript';
import type { Impact, ImpactReport, SemanticDiff } from './model.js'; import type { OwnershipResolver } from './ownership.js';
import { walk } from './files.js'; import { compareId, relativePath } from './utils.js';
export interface AnalyzeImpactOptions { root: string; consumers: string[]; packageName: string; diff: SemanticDiff; ownership?: OwnershipResolver }
export async function analyzeImpact(options: AnalyzeImpactOptions): Promise<ImpactReport> {
  const root = path.resolve(options.root); const files = new Set<string>();
  for (const consumer of options.consumers) for (const file of await walk(path.resolve(root, consumer), new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.scss']))) files.add(file);
  const impacts: Impact[] = [];
  for (const file of [...files].sort()) { const text = await readFile(file, 'utf8'); const rel = relativePath(root, file); const owner = options.ownership?.ownersFor(rel); const workspace = await workspaceFor(root, file);
    if (/\.[jt]sx?$/.test(file)) analyzeSource(file, text, rel, workspace, owner, options, impacts);
    for (const change of options.diff.changes.filter((item) => item.category === 'token' && item.subject.token)) { const token = change.subject.token!; let index = text.indexOf(token); while (index >= 0) { const loc = lineColumn(text, index); impacts.push({ id: impactId(change.id, rel, loc.line, loc.column), changeId: change.id, usage: 'token', subject: token, location: { file: rel, ...loc, ...(workspace ? { workspace } : {}), ...(owner?.length ? { owner } : {}) }, confidence: token.startsWith('--') ? 'high' : 'medium', automatic: false }); index = text.indexOf(token, index + token.length); } }
  }
  return { schemaVersion: 1, kind: 'design-system-impact-report', package: options.packageName, impacts: dedupe(impacts).sort(compareId), diagnostics: [] };
}
function analyzeSource(file: string, text: string, rel: string, workspace: string | undefined, owner: string[] | undefined, options: AnalyzeImpactOptions, out: Impact[]): void {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS); const imports = new Map<string, string>();
  source.forEachChild((node) => { if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === options.packageName && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) for (const element of node.importClause.namedBindings.elements) imports.set(element.name.text, element.propertyName?.text ?? element.name.text); });
  function visit(node: ts.Node): void {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) { const local = node.tagName.getText(source); const component = imports.get(local); if (component) for (const change of options.diff.changes) {
      if (change.subject.component !== component) continue; let target: ts.Node | undefined; let observedValue: string | undefined;
      if (change.category === 'component' && change.changeType === 'removed') target = node.tagName;
      if (change.category === 'component-prop' && change.subject.property) {
        const attribute = node.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.getText(source) === change.subject.property);
        observedValue = attribute && ts.isJsxAttribute(attribute) && attribute.initializer && ts.isStringLiteral(attribute.initializer) ? attribute.initializer.text : undefined;
        if (change.changeType === 'removed' || change.changeType === 'deprecated' || change.changeType === 'type-changed') target = attribute;
        else if (change.changeType === 'union-narrowed' && attribute && (!observedValue || !Array.isArray(change.after) || !change.after.includes(observedValue))) target = attribute;
        else if ((change.changeType === 'requiredness-changed' || change.changeType === 'added') && requiredAfter(change.after) && !attribute) target = node.tagName;
      }
      if (target) { const start = source.getLineAndCharacterOfPosition(target.getStart(source)); const location = { file: rel, line: start.line + 1, column: start.character + 1, ...(workspace ? { workspace } : {}), ...(owner?.length ? { owner } : {}) }; out.push({ id: impactId(change.id, rel, location.line, location.column), changeId: change.id, usage: change.category === 'component' ? 'jsx-component' : 'jsx-prop', subject: change.subject.property ? `${component}.${change.subject.property}` : component, ...(observedValue ? { observedValue } : {}), location, confidence: 'high', automatic: false }); }
    } }
    ts.forEachChild(node, visit);
  } visit(source);
}
function requiredAfter(after: unknown): boolean { return after === true || Boolean(after && typeof after === 'object' && 'required' in after && (after as { required?: unknown }).required === true); }
function lineColumn(text: string, index: number): { line: number; column: number } { const before = text.slice(0, index); const lines = before.split('\n'); return { line: lines.length, column: lines.at(-1)!.length + 1 }; }
function impactId(change: string, file: string, line: number, column: number): string { return `${change}@${file}:${line}:${column}`; }
function dedupe(values: Impact[]): Impact[] { return [...new Map(values.map((v) => [v.id, v])).values()]; }
async function workspaceFor(root: string, file: string): Promise<string | undefined> { let dir = path.dirname(file); while (dir.startsWith(root) && dir !== root) { try { const pkg = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8')) as { name?: string }; return pkg.name ?? relativePath(root, dir); } catch { dir = path.dirname(dir); } } return undefined; }
