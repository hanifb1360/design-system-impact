import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
export function posixPath(value: string): string { return value.replaceAll('\\', '/').split(path.sep).join('/'); }
export function relativePath(root: string, value: string): string { return posixPath(path.relative(root, value)); }
export function stableStringify(value: unknown, space = 2): string { return JSON.stringify(sortValue(value), null, space) + '\n'; }
function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, sortValue(v)]));
  return value;
}
export async function readJson(file: string): Promise<unknown> { return JSON.parse(await readFile(file, 'utf8')) as unknown; }
export async function exists(file: string): Promise<boolean> { try { await stat(file); return true; } catch { return false; } }
export function compareId<T extends { id: string }>(a: T, b: T): number { return a.id.localeCompare(b.id); }
