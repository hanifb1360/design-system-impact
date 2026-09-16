import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, test } from 'vitest';
import { stableStringify } from '../src/utils.js';

const cli = path.resolve(import.meta.dirname, '../dist/cli.js');
function run(args: string[]) { return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' }); }

describe('compiled CLI behavior', () => {
  test('uses exit code 2 for invalid commands and artifacts', async () => {
    expect(run(['unknown']).status).toBe(2);
    const root = await mkdtemp(path.join(tmpdir(), 'dsi-cli-'));
    await writeFile(path.join(root, 'bad.json'), '{"kind":"design-system-diff","schemaVersion":99}');
    const invalid = run(['check', 'bad.json', '--root', root]);
    expect(invalid.status).toBe(2); expect(invalid.stderr).toContain('DSI1303'); expect(invalid.stdout).toBe('');
  });
  test('keeps JSON parseable while returning 1 for blocking changes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'dsi-cli-'));
    const diff = { schemaVersion: 1, kind: 'design-system-diff', from: { name: '@acme/ui', version: '1' }, to: { name: '@acme/ui', version: '2' }, changes: [{ id: 'component.Button.removed', category: 'component', changeType: 'removed', severity: 'breaking', subject: { component: 'Button' }, evidence: 'observed' }], diagnostics: [] };
    await writeFile(path.join(root, 'diff.json'), stableStringify(diff));
    const result = run(['check', 'diff.json', '--root', root, '--format', 'json']);
    expect(result.status).toBe(1); expect(() => JSON.parse(result.stdout)).not.toThrow(); expect(result.stderr).toBe(''); expect(result.stdout).not.toContain('\u001b');
  });
  test('init refuses replacement unless --force is supplied', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'dsi-init-'));
    expect(run(['init', '--root', root]).status).toBe(0);
    expect(run(['init', '--root', root]).status).toBe(2);
    expect(run(['init', '--root', root, '--force']).status).toBe(0);
    expect(JSON.parse(await readFile(path.join(root, 'design-system-impact.config.json'), 'utf8'))).toHaveProperty('designSystem.package', '@acme/ui');
  });
});
