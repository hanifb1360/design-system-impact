import { describe, expect, test } from 'vitest';
import { validateArtifact, validateConfig, ValidationError } from '../src/index.js';
import { posixPath } from '../src/utils.js';

describe('runtime validation', () => {
  test('rejects unsupported artifact versions', () => { expect(() => validateArtifact({ kind: 'design-system-snapshot', schemaVersion: 2 }, 'design-system-snapshot')).toThrowError(expect.objectContaining({ code: 'DSI1303' })); });
  test('rejects structurally incomplete nested artifact data', () => { expect(() => validateArtifact({ kind: 'design-system-diff', schemaVersion: 1, from: { name: 'a' }, to: { name: 'b' }, changes: [{ id: '', evidence: 'observed' }], diagnostics: [] }, 'design-system-diff')).toThrowError(expect.objectContaining({ code: 'DSI1305' })); });
  test('rejects incomplete configuration', () => { expect(() => validateConfig({ designSystem: { package: '@acme/ui' } })).toThrowError(ValidationError); });
  test('normalizes Windows separators independently of the host OS', () => { expect(posixPath('apps\\checkout\\Button.tsx')).toBe('apps/checkout/Button.tsx'); });
});
