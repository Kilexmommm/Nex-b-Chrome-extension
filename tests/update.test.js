import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkForUpdate, compareVersions, shouldShowUpdateDialog, UPDATE_CHECK_INTERVAL, UPDATE_CHECK_KEY, UPDATE_COMMAND, UPDATE_SNOOZE_MS } from '../src/update.js';
import { memoryArea } from './helpers.js';

test('el modal de versión nueva sale salvo que se haya pospuesto esa misma versión', () => {
  const now = 1_000_000;
  assert.equal(shouldShowUpdateDialog('', undefined, now), false);
  assert.equal(shouldShowUpdateDialog('2.0.3', undefined, now), true);
  assert.equal(shouldShowUpdateDialog('2.0.3', { version: '2.0.3', until: now + UPDATE_SNOOZE_MS }, now), false);
  assert.equal(shouldShowUpdateDialog('2.0.3', { version: '2.0.3', until: now }, now), true);
  // Una versión aún más nueva vuelve a avisar aunque la anterior esté pospuesta.
  assert.equal(shouldShowUpdateDialog('2.0.4', { version: '2.0.3', until: now + UPDATE_SNOOZE_MS }, now), true);
});

test('el modal de actualización explica los pasos y no tapa formularios abiertos', () => {
  const html = readFileSync(new URL('../newtab.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(html, /<dialog id="updateDialog"[\s\S]*Hay una versión nueva de nex\.b[\s\S]*id="dialogCopyUpdate"[\s\S]*id="dialogReload"/);
  assert.match(html, /id="updateLater"[^>]*>Recordármelo mañana/);
  assert.match(app, /if \(!shouldShowUpdateDialog\(latest, snooze\) \|\| document\.querySelector\('dialog\[open\]'\)\) return;/);
  assert.match(app, /showAvailableUpdate\(chrome\.runtime\.getManifest\(\)\.version\)\.catch/);
});

const manifestResponse = version => async () => new Response(JSON.stringify({ tag_name: 'v' + version }), { status: 200 });

test('compareVersions ordena versiones de Chrome por número', () => {
  assert.equal(compareVersions('2.0.1', '2.0.0'), 1);
  assert.equal(compareVersions('2.0', '2.0.0'), 0);
  assert.equal(compareVersions('1.10.0', '1.9.2'), 1);
  assert.equal(compareVersions('2.0.0', '2.0.1'), -1);
});

test('checkForUpdate avisa solo si hay una release con una versión mayor', async () => {
  assert.equal(await checkForUpdate('2.0.1', { storage: memoryArea(), fetch: manifestResponse('2.0.2') }), '2.0.2');
  assert.equal(await checkForUpdate('2.0.2', { storage: memoryArea(), fetch: manifestResponse('2.0.2') }), '');
  assert.equal(await checkForUpdate('2.1.0', { storage: memoryArea(), fetch: manifestResponse('2.0.2') }), '');
});

test('checkForUpdate consulta GitHub como mucho una vez por intervalo', async () => {
  const storage = memoryArea();
  let calls = 0;
  const request = async () => { calls++; return new Response(JSON.stringify({ tag_name: 'v9.0.0' }), { status: 200 }); };
  await checkForUpdate('2.0.1', { storage, fetch: request, now: 1000 });
  await checkForUpdate('2.0.1', { storage, fetch: request, now: 1000 + UPDATE_CHECK_INTERVAL - 1 });
  assert.equal(calls, 1);
  await checkForUpdate('2.0.1', { storage, fetch: request, now: 1000 + UPDATE_CHECK_INTERVAL });
  assert.equal(calls, 2);
});

test('checkForUpdate ignora fallos de red y versiones inválidas', async () => {
  const storage = memoryArea();
  assert.equal(await checkForUpdate('2.0.1', { storage, fetch: async () => { throw new Error('offline'); } }), '');
  assert.equal(await checkForUpdate('2.0.1', { storage, fetch: manifestResponse('<script>') }), '');
  assert.equal(await checkForUpdate('2.0.1', { storage, fetch: async () => new Response('', { status: 404 }) }), '');
  assert.equal((await storage.get(UPDATE_CHECK_KEY))[UPDATE_CHECK_KEY].latest, '2.0.1');
});

test('actualizar ofrece releases y el instalador exige un commit explícito', () => {
  const script = readFileSync(new URL('../install.sh', import.meta.url), 'utf8');
  assert.equal(UPDATE_COMMAND, 'https://github.com/Kilexmommm/Nex-b-Chrome-extension/releases');
  assert.match(script, /set -euo pipefail/);
  assert.match(script, /no es una carpeta de nex\.b; no se reemplaza/);
  assert.match(script, /\^\[0-9a-f\]\{40\}\$/);
  assert.doesNotMatch(script, /git .*pull|curl[^\n]*\|.*bash/);
  const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
  assert.match(manifest.content_security_policy.extension_pages, /https:\/\/api\.github\.com;/);
});
