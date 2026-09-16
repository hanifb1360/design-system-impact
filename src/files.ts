import { readdir } from 'node:fs/promises';
import path from 'node:path';
const IGNORED = new Set(['node_modules', 'dist', 'build', 'coverage', '.next', '.git']);
export async function walk(root: string, extensions?: Set<string>): Promise<string[]> {
  const output: string[] = [];
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.storybook') continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) { if (!IGNORED.has(entry.name)) await visit(full); }
      else if (!extensions || extensions.has(path.extname(entry.name))) output.push(full);
    }
  }
  await visit(root);
  return output;
}
export function matchesPattern(file: string, root: string, pattern: string): boolean {
  const normalized = file.slice(root.length + 1).split(path.sep).join('/');
  const clean = pattern.replace(/^\.\//, '').replaceAll('\\', '/');
  let escaped = clean.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  escaped = escaped.replaceAll('**/', '::DIRECTORIES::').replaceAll('**', '::DOUBLE::').replaceAll('*', '[^/]*').replaceAll('::DIRECTORIES::', '(?:.*/)?').replaceAll('::DOUBLE::', '.*');
  return new RegExp(`^${escaped}$`).test(normalized);
}
