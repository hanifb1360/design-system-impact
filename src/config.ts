import path from 'node:path';
import type { ImpactConfig } from './model.js';
import { exists, readJson } from './utils.js';
import { validateConfig } from './validation.js';
export function defineConfig(config: ImpactConfig): ImpactConfig { return config; }
export async function loadConfig(root: string, requested?: string): Promise<ImpactConfig> {
  const file = path.resolve(root, requested ?? 'design-system-impact.config.json');
  if (!(await exists(file))) throw new Error(`DSI1001: Configuration not found: ${file}. Run "design-system-impact init" or pass --config.`);
  return validateConfig(await readJson(file));
}
