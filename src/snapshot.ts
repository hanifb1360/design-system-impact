import { readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import type { ComponentContract, DesignSystemSnapshot, Diagnostic, ImpactConfig, PropContract, SourceLocation, TokenContract } from './model.js';
import { walk, matchesPattern } from './files.js';
import { relativePath } from './utils.js';

export interface SnapshotOptions { root: string; packageName: string; packageVersion?: string; entry: string; tokenPatterns?: string[] }
export async function createSnapshot(options: SnapshotOptions): Promise<DesignSystemSnapshot> {
  const root = path.resolve(options.root); const entry = path.resolve(root, options.entry);
  const files = await walk(root, new Set(['.ts', '.tsx']));
  const program = ts.createProgram(files, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, jsx: ts.JsxEmit.ReactJSX, skipLibCheck: true });
  const checker = program.getTypeChecker(); const diagnostics: Diagnostic[] = [];
  const entrySource = program.getSourceFile(entry);
  if (!entrySource) throw new Error(`DSI1101: Design system entry was not found: ${options.entry}`);
  const moduleSymbol = checker.getSymbolAtLocation(entrySource);
  if (!moduleSymbol) throw new Error(`DSI1102: Could not inspect exports from: ${options.entry}`);
  const components: Record<string, ComponentContract> = {}; const exports = [] as DesignSystemSnapshot['exports'];
  for (const exported of checker.getExportsOfModule(moduleSymbol).sort((a, b) => a.name.localeCompare(b.name))) {
    const resolved = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
    const declaration = resolved.valueDeclaration ?? resolved.declarations?.[0];
    if (!declaration) continue;
    const type = checker.getTypeOfSymbolAtLocation(resolved, declaration);
    const signature = type.getCallSignatures()[0];
    const propsParameter = signature?.parameters[0];
    if (propsParameter) {
      const propsType = checker.getTypeOfSymbolAtLocation(propsParameter, declaration);
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
      components[exported.name] = { name: exported.name, importPath: options.packageName, props, ...(deprecated ? { deprecated } : {}), source: location(root, declaration) };
      exports.push({ name: exported.name, importPath: options.packageName, kind: 'component' });
    } else exports.push({ name: exported.name, importPath: options.packageName, kind: 'symbol' });
  }
  const tokens = await extractTokens(root, options.tokenPatterns ?? [], diagnostics);
  return { schemaVersion: 1, kind: 'design-system-snapshot', package: { name: options.packageName, ...(options.packageVersion ? { version: options.packageVersion } : {}) }, generatedBy: { name: 'design-system-impact', schemaVersion: 1 }, components, tokens, exports, diagnostics };
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
      try { flattenJson(JSON.parse(text) as unknown, '', rel, tokens); }
      catch { diagnostics.push({ code: 'DSI1201', severity: 'error', message: `Could not parse token JSON: ${rel}`, location: { file: rel, line: 1, column: 1 } }); }
    }
  }
  return Object.fromEntries(Object.entries(tokens).sort(([a], [b]) => a.localeCompare(b)));
}
function flattenJson(value: unknown, prefix: string, file: string, out: Record<string, TokenContract>): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) { if (prefix) out[prefix] = { name: prefix, kind: 'json', value, ...(typeof value === 'string' && /^\{.+\}$/.test(value) ? { alias: value.slice(1, -1) } : {}), source: { file, line: 1, column: 1 } }; return; }
  const object = value as Record<string, unknown>;
  if ('$value' in object || 'value' in object) { const tokenValue = object.$value ?? object.value; out[prefix] = { name: prefix, kind: 'json', value: tokenValue, ...(typeof tokenValue === 'string' && /^\{.+\}$/.test(tokenValue) ? { alias: tokenValue.slice(1, -1) } : {}), source: { file, line: 1, column: 1 } }; return; }
  for (const key of Object.keys(object).sort()) flattenJson(object[key], prefix ? `${prefix}.${key}` : key, file, out);
}
export async function snapshotFromConfig(root: string, config: ImpactConfig): Promise<DesignSystemSnapshot> {
  let version: string | undefined;
  try { const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as { version?: string }; version = pkg.version; } catch { /* package version is optional */ }
  return createSnapshot({ root, packageName: config.designSystem.package, ...(version ? { packageVersion: version } : {}), entry: config.designSystem.entry, ...(config.tokens ? { tokenPatterns: config.tokens } : {}) });
}
