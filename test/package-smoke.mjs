import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const temp = await mkdtemp(path.join(tmpdir(), 'dsi-package-'));
try {
  const env = { ...process.env, npm_config_cache: path.join(temp, 'npm-cache') };
  const result = JSON.parse(execFileSync('npm', ['pack', '--json', '--pack-destination', temp], { cwd: root, encoding: 'utf8', env }));
  const tarball = path.join(temp, result[0].filename);
  execFileSync('tar', ['-xzf', tarball, '-C', temp], { stdio: 'pipe' });
  const installed = path.join(temp, 'package');
  await symlink(path.join(root, 'node_modules'), path.join(installed, 'node_modules'), 'junction');
  const api = await import(pathToFileURL(path.join(installed, 'dist/index.js')).href);
  if (typeof api.createSnapshot !== 'function' || typeof api.validateArtifact !== 'function') throw new Error('Published programmatic API is incomplete.');
  const help = execFileSync(process.execPath, [path.join(installed, 'dist/cli.js'), '--help'], { encoding: 'utf8' });
  if (!help.includes('design-system-impact') || !help.includes('snapshot')) throw new Error('Published CLI help is incomplete.');
  const manifest = JSON.parse(await readFile(path.join(installed, 'package.json'), 'utf8'));
  if (manifest.repository.url !== 'git+https://github.com/hanifb1360/design-system-impact.git') throw new Error('Published repository metadata is incorrect.');
  for (const name of ['snapshot', 'diff', 'impact', 'migration', 'common']) { const schema = JSON.parse(await readFile(path.join(installed, `schemas/${name}.schema.json`), 'utf8')); if (!schema.$id) throw new Error(`Published ${name} schema is missing its identifier.`); }
  process.stdout.write(`Package smoke test passed: ${result[0].filename}\n`);
} finally {
  await rm(temp, { recursive: true, force: true });
}
