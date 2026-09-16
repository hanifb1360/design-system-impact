import { readFile } from 'node:fs/promises';
export interface OwnershipResolver { ownersFor(file: string): string[] }
export async function createCodeownersResolver(file: string): Promise<OwnershipResolver> {
  const rules = (await readFile(file, 'utf8')).split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).map((line) => { const [pattern, ...owners] = line.split(/\s+/); return { pattern: pattern!, owners }; });
  return { ownersFor(target) { let result: string[] = []; for (const rule of rules) if (matches(rule.pattern, target)) result = rule.owners; return result; } };
}
function matches(pattern: string, file: string): boolean {
  let value = pattern.replace(/^\//, ''); if (value.endsWith('/')) value += '**';
  if (!value.includes('/')) value = `**/${value}`;
  const escaped = value.replace(/[.+^${}()|[\]\\]/g, '\\$&').replaceAll('**', '::DOUBLE::').replaceAll('*', '[^/]*').replaceAll('::DOUBLE::', '.*');
  return new RegExp(`^(?:${escaped}|${escaped.replace(/^\.\*\//, '')})$`).test(file);
}
