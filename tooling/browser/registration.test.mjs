import test from 'node:test';
import assert from 'node:assert/strict';
import { makeManifest, registrationKeys, hostName } from './registration.mjs';

test('host manifests allow only explicit Chromium extension identities', () => {
  assert.throws(() => makeManifest('host.exe', []));
  for (const id of ['*', '../escape', 'z'.repeat(32), 'a'.repeat(31)])
    assert.throws(() => makeManifest('host.exe', [id]));
  const id = 'a'.repeat(32);
  const manifest = makeManifest('host.exe', [id, id]);
  assert.deepEqual(manifest.allowed_origins, [`chrome-extension://${id}/`]);
  assert.equal(manifest.name, hostName);
  assert.equal(manifest.type, 'stdio');
});
test('registration is per-user and isolated from future production registration', () => {
  const keys = registrationKeys(['chrome', 'edge']);
  assert.ok(keys.every((key) => key.startsWith('HKCU\\') && key.endsWith('.dev')));
  assert.match(keys[0], /Google\\Chrome/);
  assert.match(keys[1], /Microsoft\\Edge/);
  assert.throws(() => registrationKeys(['firefox']));
});
