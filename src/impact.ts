import { readFile } from 'node:fs/promises'; import path from 'node:path'; import ts from 'typescript';
import type { Diagnostic, Impact, ImpactReport, SemanticDiff } from './model.js'; import type { OwnershipResolver } from './ownership.js';
import { walk } from './files.js'; import { compareId, relativePath } from './utils.js';
export interface AnalyzeImpactOptions { root: string; consumers: string[]; packageName: string; diff: SemanticDiff; ownership?: OwnershipResolver }
export async function analyzeImpact(options: AnalyzeImpactOptions): Promise<ImpactReport> {
  const root = path.resolve(options.root); const files = new Set<string>();
  for (const consumer of options.consumers) for (const file of await walk(path.resolve(root, consumer), new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.scss']))) files.add(file);
  const orderedFiles = [...files].sort(); const texts = new Map<string, string>(); const sources = new Map<string, ts.SourceFile>();
  for (const file of orderedFiles) { const text = await readFile(file, 'utf8'); texts.set(file, text); if (/\.[jt]sx?$/.test(file)) sources.set(file, ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)); }
  const reexports = buildReexportMap(sources, options.packageName, new Set(options.diff.changes.flatMap((item) => item.subject.component ? [item.subject.component] : [])));
  const impacts: Impact[] = []; const diagnostics: Diagnostic[] = [];
  for (const file of orderedFiles) { const text = texts.get(file)!; const rel = relativePath(root, file); const owner = options.ownership?.ownersFor(rel); const workspace = await workspaceFor(root, file);
    const source = sources.get(file); if (source) analyzeSource(file, source, rel, workspace, owner, options, reexports, impacts, diagnostics);
    for (const change of options.diff.changes.filter((item) => item.category === 'token' && item.subject.token)) { const token = change.subject.token!; let index = text.indexOf(token); while (index >= 0) { const loc = lineColumn(text, index); impacts.push({ id: impactId(change.id, rel, loc.line, loc.column), changeId: change.id, usage: 'token', subject: token, location: { file: rel, ...loc, ...(workspace ? { workspace } : {}), ...(owner?.length ? { owner } : {}) }, confidence: token.startsWith('--') ? 'high' : 'medium', automatic: false }); index = text.indexOf(token, index + token.length); } }
  }
  return { schemaVersion: 1, kind: 'design-system-impact-report', package: options.packageName, impacts: dedupe(impacts).sort(compareId), diagnostics: dedupeDiagnostics(diagnostics) };
}
function analyzeSource(file: string, source: ts.SourceFile, rel: string, workspace: string | undefined, owner: string[] | undefined, options: AnalyzeImpactOptions, reexports: Map<string, Map<string, string>>, out: Impact[], diagnostics: Diagnostic[]): void {
  const imports = new Map<string, string>();
  source.forEachChild((node) => { if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) { const specifier = node.moduleSpecifier.text; const direct = isDesignSystemModule(specifier, options.packageName); const localExports = direct ? undefined : reexports.get(resolveLocalModule(file, specifier, reexports.keys())); for (const element of node.importClause.namedBindings.elements) { const imported = element.propertyName?.text ?? element.name.text; const component = direct ? imported : localExports?.get(imported); if (component) imports.set(element.name.text, component); } } });
  function visit(node: ts.Node): void {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) { const local = node.tagName.getText(source); const component = imports.get(local); if (component) {
      const spreads = node.attributes.properties.filter(ts.isJsxSpreadAttribute); const uncertainChanges = options.diff.changes.filter((change) => change.subject.component === component && change.category === 'component-prop' && change.severity !== 'non-breaking');
      if (spreads.length && uncertainChanges.length) for (const spread of spreads) { const start = source.getLineAndCharacterOfPosition(spread.getStart(source)); diagnostics.push({ code: 'DSI2101', severity: 'warning', message: `Could not determine whether JSX spread on <${local}> contains affected props: ${[...new Set(uncertainChanges.map((change) => change.subject.property).filter((value): value is string => Boolean(value)))].sort().join(', ')}.`, location: { file: rel, line: start.line + 1, column: start.character + 1 }, related: uncertainChanges.map((change) => change.id).sort() }); }
      for (const change of options.diff.changes) {
      if (change.subject.component !== component) continue; let target: ts.Node | undefined; let observedValue: string | undefined;
      if (change.category === 'component' && change.changeType === 'removed') target = node.tagName;
      if (change.category === 'component-prop' && change.subject.property) {
        const attribute = node.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.getText(source) === change.subject.property);
        observedValue = attribute && ts.isJsxAttribute(attribute) && attribute.initializer && ts.isStringLiteral(attribute.initializer) ? attribute.initializer.text : undefined;
        if (change.changeType === 'removed' || change.changeType === 'deprecated' || change.changeType === 'type-changed') target = attribute;
        else if (change.changeType === 'union-narrowed' && attribute && (!observedValue || !Array.isArray(change.after) || !change.after.includes(observedValue))) target = attribute;
        else if ((change.changeType === 'requiredness-changed' || change.changeType === 'added') && requiredAfter(change.after) && !attribute && spreads.length === 0) target = node.tagName;
      }
      if (target) { const start = source.getLineAndCharacterOfPosition(target.getStart(source)); const location = { file: rel, line: start.line + 1, column: start.character + 1, ...(workspace ? { workspace } : {}), ...(owner?.length ? { owner } : {}) }; out.push({ id: impactId(change.id, rel, location.line, location.column), changeId: change.id, usage: change.category === 'component' ? 'jsx-component' : 'jsx-prop', subject: change.subject.property ? `${component}.${change.subject.property}` : component, ...(observedValue ? { observedValue } : {}), location, confidence: 'high', automatic: false }); }
    } } }
    ts.forEachChild(node, visit);
  } visit(source);
}
function buildReexportMap(sources: Map<string, ts.SourceFile>, packageName: string, knownComponents: Set<string>): Map<string, Map<string, string>> {
  const result = new Map<string, Map<string, string>>([...sources.keys()].map((file) => [file, new Map<string, string>()]));
  for (let pass = 0; pass <= sources.size; pass++) { let changed = false;
    for (const [file, source] of sources) for (const statement of source.statements) {
      if (!ts.isExportDeclaration(statement) || !statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const specifier = statement.moduleSpecifier.text; const direct = isDesignSystemModule(specifier, packageName); const target = direct ? undefined : result.get(resolveLocalModule(file, specifier, result.keys())); const current = result.get(file)!;
      if (!statement.exportClause) { const available = direct ? new Map([...knownComponents].map((name) => [name, name])) : target; if (available) for (const [name, component] of available) if (!current.has(name)) { current.set(name, component); changed = true; } }
      else if (ts.isNamedExports(statement.exportClause)) for (const element of statement.exportClause.elements) { const imported = element.propertyName?.text ?? element.name.text; const component = direct ? imported : target?.get(imported); if (component && current.get(element.name.text) !== component) { current.set(element.name.text, component); changed = true; } }
    }
    if (!changed) break;
  }
  return result;
}
function isDesignSystemModule(specifier: string, packageName: string): boolean { return specifier === packageName || specifier.startsWith(`${packageName}/`); }
function resolveLocalModule(fromFile: string, specifier: string, files: Iterable<string>): string {
  if (!specifier.startsWith('.')) return '';
  const base = path.resolve(path.dirname(fromFile), specifier); const withoutJs = base.replace(/\.[cm]?js$/, '');
  const candidates = [base, ...['.ts', '.tsx', '.js', '.jsx'].map((extension) => `${withoutJs}${extension}`), ...['.ts', '.tsx', '.js', '.jsx'].map((extension) => path.join(withoutJs, `index${extension}`))];
  const available = new Set(files); return candidates.find((candidate) => available.has(candidate)) ?? '';
}
function requiredAfter(after: unknown): boolean { return after === true || Boolean(after && typeof after === 'object' && 'required' in after && (after as { required?: unknown }).required === true); }
function lineColumn(text: string, index: number): { line: number; column: number } { const before = text.slice(0, index); const lines = before.split('\n'); return { line: lines.length, column: lines.at(-1)!.length + 1 }; }
function impactId(change: string, file: string, line: number, column: number): string { return `${change}@${file}:${line}:${column}`; }
function dedupe(values: Impact[]): Impact[] { return [...new Map(values.map((v) => [v.id, v])).values()]; }
function dedupeDiagnostics(values: Diagnostic[]): Diagnostic[] { return [...new Map(values.map((value) => [`${value.code}:${value.location?.file}:${value.location?.line}:${value.location?.column}`, value])).values()].sort((a, b) => `${a.location?.file}:${a.location?.line}:${a.location?.column}:${a.code}`.localeCompare(`${b.location?.file}:${b.location?.line}:${b.location?.column}:${b.code}`)); }
async function workspaceFor(root: string, file: string): Promise<string | undefined> { let dir = path.dirname(file); while (dir.startsWith(root) && dir !== root) { try { const pkg = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8')) as { name?: string }; return pkg.name ?? relativePath(root, dir); } catch { dir = path.dirname(dir); } } return undefined; }
