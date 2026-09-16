import path from 'node:path';
import type { ImpactConfig } from './model.js';
import { exists, readJson } from './utils.js';
export function defineConfig(config: ImpactConfig): ImpactConfig { return config; }
export async function loadConfig(root: string, requested?: string): Promise<ImpactConfig> {
  const file = path.resolve(root, requested ?? 'design-system-impact.config.json');
  if (!(await exists(file))) throw new Error(`DSI1001: Configuration not found: ${file}. Run "design-system-impact init" or pass --config.`);
  const value = await readJson(file);
  if (!value || typeof value !== 'object') throw new Error('DSI1002: Configuration must be a JSON object.');
  const config = value as Partial<ImpactConfig>;
  if (!config.designSystem?.package || !config.designSystem.entry) throw new Error('DSI1003: designSystem.package and designSystem.entry are required.');
  return config as ImpactConfig;
}
