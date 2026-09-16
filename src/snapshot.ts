import { readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import type { ComponentContract, DesignSystemSnapshot, Diagnostic, ImpactConfig, PropContract, SourceLocation, TokenContract } from './model.js';
import { walk, matchesPattern } from './files.js';
import { relativePath } from './utils.js';

export interface SnapshotOptions { root: string; packageName: string; packageVersion?: string; entry: string; tokenPatterns?: string[] }
export async function createSnapshot(options: SnapshotOptions): Promise<DesignSystemSnapshot> {
  const root = path.resolve(options.root); const entry = path.resolve(root, options.entry);
  const publicEntries = await packageExportEntries(root, options.packageName);
  const files = await walk(root, new Set(['.ts', '.tsx']));
  for (const publicEntry of publicEntries) if (analyzableCodeFile(publicEntry.file) && !files.includes(publicEntry.file)) files.push(publicEntry.file);
  const program = ts.createProgram(files, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, jsx: ts.JsxEmit.ReactJSX, allowJs: true, skipLibCheck: true });
  const checker = program.getTypeChecker(); const diagnostics: Diagnostic[] = [];
  const entrySource = program.getSourceFile(entry);
  if (!entrySource) throw new Error(`DSI1101: Design system entry was not found: ${options.entry}`);
  const moduleSymbol = checker.getSymbolAtLocation(entrySource);
  if (!moduleSymbol) throw new Error(`DSI1102: Could not inspect exports from: ${options.entry}`);
  const components: Record<string, ComponentContract> = {}; const exports = [] as DesignSystemSnapshot['exports'];
  inspectModule(checker, moduleSymbol, options.packageName, root, components, exports, diagnostics);
  for (const publicEntry of publicEntries) {
    if (publicEntry.importPath === options.packageName || !analyzableCodeFile(publicEntry.file)) continue;
    const source = program.getSourceFile(publicEntry.file); const symbol = source && checker.getSymbolAtLocation(source);
    if (!source || !symbol) { diagnostics.push({ code: 'DSI1104', severity: 'warning', message: `Could not inspect package export ${publicEntry.importPath} at ${relativePath(root, publicEntry.file)}.` }); continue; }
    inspectModule(checker, symbol, publicEntry.importPath, root, components, exports, diagnostics);
  }
  exports.sort((a, b) => a.name.localeCompare(b.name) || a.importPath.localeCompare(b.importPath));
  const tokens = await extractTokens(root, options.tokenPatterns ?? [], diagnostics);
  return { schemaVersion: 1, kind: 'design-system-snapshot', package: { name: options.packageName, ...(options.packageVersion ? { version: options.packageVersion } : {}) }, generatedBy: { name: 'design-system-impact', schemaVersion: 1 }, components, tokens, exports, diagnostics };
}
function analyzableCodeFile(file: string): boolean { return /(?:\.d)?\.[cm]?[jt]sx?$/.test(file); }
function inspectModule(checker: ts.TypeChecker, moduleSymbol: ts.Symbol, importPath: string, root: string, components: Record<string, ComponentContract>, exports: DesignSystemSnapshot['exports'], diagnostics: Diagnostic[]): void {
  for (const exported of checker.getExportsOfModule(moduleSymbol).sort((a, b) => a.name.localeCompare(b.name))) {
    const resolved = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
    const declaration = resolved.valueDeclaration ?? resolved.declarations?.[0];
    if (!declaration) continue;
    const propsInfo = componentProps(checker, resolved, declaration);
    if (propsInfo) {
      const { propsType } = propsInfo;
      const props: Record<string, PropContract> = {};
      for (const prop of checker.getPropertiesOfType(propsType).sort((a, b) => a.name.localeCompare(b.name))) {
        const propDecl = prop.valueDeclaration ?? prop.declarations?.[0];
        if (!propDecl) { diagnostics.push({ code: 'DSI1103', severity: 'warning', message: `Could not locate declaration for ${exported.name}.${prop.name}.` }); continue; }
        const propType = checker.getTypeOfSymbolAtLocation(prop, propDecl);
        const literals = literalValues(propType);
        const deprecated = jsDocDeprecated(prop);
        props[prop.name] = { required: !(prop.flags & ts.SymbolFlags.Optional), type: checker.typeToString(propType, propDecl, ts.TypeFormatFlags.NoTruncation), ...(literals.length ? { literals } : {}), ...(deprecated ? { deprecated } : {}) };
      }
      const deprecated = jsDocDeprecated(resolved);
      components[exported.name] ??= { name: exported.name, importPath, props, ...(deprecated ? { deprecated } : {}), source: location(root, declaration) };
      addExport(exports, { name: exported.name, importPath, kind: 'component' });
    } else addExport(exports, { name: exported.name, importPath, kind: 'symbol' });
  }
}
function addExport(exports: DesignSystemSnapshot['exports'], value: DesignSystemSnapshot['exports'][number]): void { if (!exports.some((item) => item.name === value.name && item.importPath === value.importPath)) exports.push(value); }
async function packageExportEntries(root: string, packageName: string): Promise<Array<{ importPath: string; file: string }>> {
  let manifest: { exports?: unknown };
  try { manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as { exports?: unknown }; } catch { return []; }
  if (!manifest.exports || typeof manifest.exports !== 'object' || Array.isArray(manifest.exports)) return [];
  const entries: Array<{ importPath: string; file: string }> = [];
  for (const [subpath, target] of Object.entries(manifest.exports as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) {
    if (subpath !== '.' && !subpath.startsWith('./')) continue;
    const file = exportTarget(target); if (!file || file.includes('*')) continue;
    entries.push({ importPath: subpath === '.' ? packageName : `${packageName}/${subpath.slice(2)}`, file: path.resolve(root, file) });
  }
  return entries;
}
function exportTarget(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const conditions = value as Record<string, unknown>;
  for (const key of ['types', 'import', 'default', 'require']) { const resolved = exportTarget(conditions[key]); if (resolved) return resolved; }
  return undefined;
}
function componentProps(checker: ts.TypeChecker, symbol: ts.Symbol, declaration: ts.Declaration): { propsType: ts.Type } | undefined {
  if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
    const wrapped = propsFromExpression(checker, declaration.initializer);
    if (wrapped) return wrapped;
  }
  return propsFromType(checker, checker.getTypeOfSymbolAtLocation(symbol, declaration), declaration);
}
function propsFromExpression(checker: ts.TypeChecker, expression: ts.Expression): { propsType: ts.Type } | undefined {
  if (ts.isCallExpression(expression)) {
    const wrapper = expression.expression.getText().split('.').at(-1);
    const inner = expression.arguments[0];
    if (inner && (wrapper === 'memo' || wrapper === 'forwardRef')) return propsFromExpression(checker, inner);
  }
  return propsFromType(checker, checker.getTypeAtLocation(expression), expression);
}
function propsFromType(checker: ts.TypeChecker, type: ts.Type, location: ts.Node): { propsType: ts.Type } | undefined {
  const parameter = type.getCallSignatures()[0]?.parameters[0];
  return parameter ? { propsType: checker.getTypeOfSymbolAtLocation(parameter, location) } : undefined;
}
function literalValues(type: ts.Type): string[] {
  const parts = type.isUnion() ? type.types : [type];
  return parts.filter((item) => item.isStringLiteral() || item.isNumberLiteral()).map((item) => String((item as ts.StringLiteralType | ts.NumberLiteralType).value)).sort();
}
function jsDocDeprecated(symbol: ts.Symbol): string | undefined {
  const tag = symbol.getJsDocTags().find((item) => item.name === 'deprecated');
  return tag ? tag.text?.map((part) => part.text).join('') || 'Deprecated' : undefined;
}
function location(root: string, node: ts.Node): SourceLocation {
  const start = node.getSourceFile().getLineAndCharacterOfPosition(node.getStart());
  return { file: relativePath(root, node.getSourceFile().fileName), line: start.line + 1, column: start.character + 1 };
}
async function extractTokens(root: string, patterns: string[], diagnostics: Diagnostic[]): Promise<Record<string, TokenContract>> {
  const all = await walk(root, new Set(['.json', '.css'])); const tokens: Record<string, TokenContract> = {};
  for (const file of all.filter((item) => patterns.some((pattern) => matchesPattern(item, root, pattern)))) {
    const text = await readFile(file, 'utf8'); const rel = relativePath(root, file);
    if (file.endsWith('.css')) {
      const regex = /(--[\w-]+)\s*:\s*([^;{}]+);/g; let match: RegExpExecArray | null;
      while ((match = regex.exec(text))) { const before = text.slice(0, match.index); const line = before.split('\n').length; const value = match[2]!.trim(); tokens[match[1]!] = { name: match[1]!, kind: 'css-custom-property', value, ...(value.match(/^var\((--[\w-]+)\)$/)?.[1] ? { alias: value.match(/^var\((--[\w-]+)\)$/)![1] } : {}), source: { file: rel, line, column: 1 } }; }
    } else {
      try { JSON.parse(text); extractJsonTokens(text, rel, tokens); }
      catch { diagnostics.push({ code: 'DSI1201', severity: 'error', message: `Could not parse token JSON: ${rel}`, location: { file: rel, line: 1, column: 1 } }); }
    }
  }
  return Object.fromEntries(Object.entries(tokens).sort(([a], [b]) => a.localeCompare(b)));
}
function extractJsonTokens(text: string, file: string, out: Record<string, TokenContract>): void {
  const source = ts.parseJsonText(file, text); const root = source.statements[0]?.expression;
  if (!root || !ts.isObjectLiteralExpression(root)) return;
  visitJsonObject(root, '', undefined);
  function visitJsonObject(node: ts.ObjectLiteralExpression, prefix: string, tokenNameNode: ts.Node | undefined): void {
    const properties = node.properties.filter(ts.isPropertyAssignment); const valueProperty = properties.find((property) => ['$value', 'value'].includes(jsonPropertyName(property.name)));
    if (valueProperty && prefix) { const tokenValue = JSON.parse(valueProperty.initializer.getText(source)) as unknown; addJsonToken(prefix, tokenValue, tokenNameNode ?? valueProperty.name); return; }
    for (const property of properties) { const key = jsonPropertyName(property.name); if (!key || key.startsWith('$')) continue; const name = prefix ? `${prefix}.${key}` : key;
      if (ts.isObjectLiteralExpression(property.initializer)) visitJsonObject(property.initializer, name, property.name);
      else { const tokenValue = JSON.parse(property.initializer.getText(source)) as unknown; addJsonToken(name, tokenValue, property.name); }
    }
  }
  function addJsonToken(name: string, value: unknown, node: ts.Node): void { const start = source.getLineAndCharacterOfPosition(node.getStart(source)); out[name] = { name, kind: 'json', value, ...(typeof value === 'string' && /^\{.+\}$/.test(value) ? { alias: value.slice(1, -1) } : {}), source: { file, line: start.line + 1, column: start.character + 1 } }; }
}
function jsonPropertyName(name: ts.PropertyName): string { return ts.isStringLiteral(name) || ts.isIdentifier(name) || ts.isNumericLiteral(name) ? name.text : ''; }
export async function snapshotFromConfig(root: string, config: ImpactConfig): Promise<DesignSystemSnapshot> {
  let version: string | undefined;
  try { const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as { version?: string }; version = pkg.version; } catch { /* package version is optional */ }
  return createSnapshot({ root, packageName: config.designSystem.package, ...(version ? { packageVersion: version } : {}), entry: config.designSystem.entry, ...(config.tokens ? { tokenPatterns: config.tokens } : {}) });
}
