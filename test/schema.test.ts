import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, test } from 'vitest';
import { analyzeImpact, createCodeownersResolver, createMigrationPlan, createSnapshot, diffSnapshots } from '../src/index.js';

const root = path.resolve(import.meta.dirname, '..'); const fixtures = path.join(root, 'test/fixtures');
async function schema(name: string): Promise<object> { return JSON.parse(await readFile(path.join(root, `schemas/${name}.schema.json`), 'utf8')) as object; }

describe('public artifact JSON Schemas', () => {
  test('accept every artifact produced by the vertical workflow', async () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true }); ajv.addSchema(await schema('common'));
    const before = await createSnapshot({ root: path.join(fixtures, 'v1'), packageName: '@acme/ui', packageVersion: '1.0.0', entry: 'src/index.ts', tokenPatterns: ['src/**/*.json', 'src/**/*.css'] });
    const after = await createSnapshot({ root: path.join(fixtures, 'v2'), packageName: '@acme/ui', packageVersion: '2.0.0', entry: 'src/index.ts', tokenPatterns: ['src/**/*.json', 'src/**/*.css'] });
    const diff = diffSnapshots(before, after); const consumerRoot = path.join(fixtures, 'consumer'); const ownership = await createCodeownersResolver(path.join(consumerRoot, 'CODEOWNERS'));
    const impact = await analyzeImpact({ root: consumerRoot, consumers: ['apps'], packageName: '@acme/ui', diff, ownership });
    const migration = createMigrationPlan(diff, impact, { schemaVersion: 1, componentProps: { Button: { tone: { replacedBy: 'variant', values: { critical: 'danger' } } } } });
    for (const [name, artifact] of [['snapshot', before], ['diff', diff], ['impact', impact], ['migration', migration]] as const) { const validate = ajv.compile(await schema(name)); expect(validate(artifact), `${name}: ${ajv.errorsText(validate.errors)}`).toBe(true); }
  });
  test('rejects incompatible schema versions', async () => { const ajv = new Ajv2020({ strict: true }); ajv.addSchema(await schema('common')); const validate = ajv.compile(await schema('snapshot')); expect(validate({ schemaVersion: 2, kind: 'design-system-snapshot' })).toBe(false); });
});
