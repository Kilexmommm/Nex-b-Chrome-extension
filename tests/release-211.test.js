import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { openSectionInNewWindow } from '../src/tabs.js';
import { normalizeData } from '../src/model.js';
import { createRepository } from '../src/storage.js';
import { projectSyncData } from '../src/sync.js';
import { createBackupZip, readStoredZip } from '../src/backup.js';
import { memoryArea, locks } from './helpers.js';
const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const access = url => ({ url, matchType: 'exact' });
function browser() {
  const calls = { windows: [], groups: [], titles: [], queries: [] };
  return { calls,
    extension: { isAllowedFileSchemeAccess: async () => true },
    windows: { create: async options => { calls.windows.push(options); return { id: 7, tabs: options.url.map((url, i) => ({ id: i + 20, windowId: 7, url })) }; } },
    tabs: { query: async options => { calls.queries.push(options); return [{ id: 20, windowId: 7 }]; }, group: async options => { calls.groups.push(options); return 3; } },
    tabGroups: { update: async (id, options) => { calls.titles.push({ id, ...options }); } }
  };
}
test('sección: crea una ventana nueva, deduplica URLs y titula el grupo sin mover pestañas existentes', async () => {
  const api = browser();
  const result = await openSectionInNewWindow([access('https://example.com'), access('https://example.com/'), access('https://other.test/')], 'Proyecto · Recursos', api, locks());
  assert.equal(result.opened, 2); assert.equal(result.failed, 0);
  assert.equal(result.grouped, true); assert.equal(result.titled, true);
  assert.deepEqual(api.calls.windows, [{ url: ['https://example.com/', 'https://other.test/'], focused: true }]);
  assert.deepEqual(api.calls.groups, [{ tabIds: [20, 21], createProperties: { windowId: 7 } }]);
  assert.deepEqual(api.calls.titles, [{ id: 3, title: 'Proyecto · Recursos' }]);
  assert.deepEqual(api.calls.queries, []);
});
test('sección: sin permiso local omite archivos y URLs peligrosas, pero abre enlaces web', async () => {
  const api = browser(); api.extension.isAllowedFileSchemeAccess = async () => false;
  const result = await openSectionInNewWindow([access('file:///tmp/a.html'), access('javascript:alert(1)'), access('https://example.com/')], 'Grupo', api, locks());
  assert.equal(result.opened, 1); assert.equal(result.failed, 2);
  assert.deepEqual(api.calls.windows[0].url, ['https://example.com/']);
});
test('sección vacía o completamente inválida no crea una ventana', async () => {
  for (const accesses of [[], [access('data:text/html,test')]]) {
    const api = browser(), result = await openSectionInNewWindow(accesses, 'Grupo', api, locks());
    assert.equal(result.opened, 0); assert.equal(result.grouped, false); assert.equal(api.calls.windows.length, 0);
  }
});
test('sección: permite archivos locales cuando el permiso existe', async () => {
  const api = browser(), result = await openSectionInNewWindow([access('file:///tmp/a.html')], 'Locales', api, locks());
  assert.equal(result.opened, 1); assert.deepEqual(api.calls.windows[0].url, ['file:///tmp/a.html']);
});
test('fallo de agrupación conserva la ventana y no confirma un grupo ni un título', async () => {
  const api = browser(); api.tabs.group = async () => { throw new Error('group failed'); };
  const result = await openSectionInNewWindow([access('https://example.com/')], 'Grupo', api, locks());
  assert.equal(result.opened, 1); assert.equal(result.grouped, false); assert.equal(result.titled, false);
  assert.equal(api.calls.windows.length, 1); assert.equal(api.calls.titles.length, 0);
});
test('fallo al titular conserva el grupo y reporta el fallo parcial', async () => {
  const api = browser(); api.tabGroups.update = async () => { throw new Error('title failed'); };
  const result = await openSectionInNewWindow([access('https://example.com/')], 'Grupo', api, locks());
  assert.equal(result.opened, 1); assert.equal(result.grouped, true); assert.equal(result.titled, false);
  assert.equal(api.calls.windows.length, 1);
});
test('si Chrome omite tabs en la respuesta, consulta solo la ventana creada', async () => {
  const api = browser(); api.windows.create = async () => ({ id: 7 });
  const result = await openSectionInNewWindow([access('https://example.com/')], 'Grupo', api, locks());
  assert.deepEqual(api.calls.queries, [{ windowId: 7 }]); assert.equal(result.grouped, true);
});
test('si crear la ventana falla no intenta agrupar ni titular', async () => {
  const api = browser(); api.windows.create = async () => { throw new Error('window failed'); };
  await assert.rejects(openSectionInNewWindow([access('https://example.com/')], 'Grupo', api, locks()), /window failed/);
  assert.equal(api.calls.groups.length, 0); assert.equal(api.calls.titles.length, 0);
});
test('sombra, colores y borde persisten tras guardar y volver a cargar y en un respaldo portable', async () => {
  const area = memoryArea(), repo = createRepository(area, locks());
  const snapshot = await repo.load();
  Object.assign(snapshot.data.settings, { thumbnailShadow: false, cardStyle: 'flat', cardBorder: 'none', cardBorderColor: '#123456', backgroundColor: '#654321' });
  await repo.save(snapshot.data, snapshot.revision);
  const reloaded = (await createRepository(area, locks()).load()).data;
  assert.equal(reloaded.settings.thumbnailShadow, false);
  assert.equal(reloaded.settings.cardBorderColor, '#123456');
  assert.equal(reloaded.settings.backgroundColor, '#654321');
  assert.equal(reloaded.settings.cardBorder, 'none');
  const restored = readStoredZip(new Uint8Array(await createBackupZip(reloaded).arrayBuffer()));
  assert.equal(restored.settings.thumbnailShadow, false);
  assert.equal(projectSyncData(reloaded).settings.thumbnailShadow, false);
  assert.equal(normalizeData().settings.thumbnailShadow, true);
});
function preferences(area) {
  const pressed = {}, context = vm.createContext({ chrome: { storage: { local: area } }, document: { documentElement: { dataset: {} }, querySelectorAll: () => [{ setAttribute: (name, value) => { pressed[name] = value; } }] }, render: () => {} });
  const source = app.slice(app.indexOf('async function restoreCollapsedSections()'), app.indexOf('function closeMainMenu('));
  vm.runInContext('let collapsedSections = new Set(); let titlesOnly = false;\n' + source, context);
  return { context, pressed, run: source => vm.runInContext(source, context) };
}
test('solo títulos y secciones plegadas se recuperan al reabrir y permanecen fuera de la biblioteca sincronizada', async () => {
  const area = memoryArea(), first = preferences(area);
  await first.run("setSectionCollapsed('ypf', true)"); await first.run('setTitlesOnly(true)');
  const reopened = preferences(area);
  await reopened.run('restoreCollapsedSections()'); await reopened.run('restoreTitlesOnly()');
  assert.equal(reopened.run("collapsedSections.has('ypf')"), true);
  assert.equal(reopened.context.document.documentElement.dataset.titlesOnly, 'true');
  assert.equal(reopened.pressed['aria-pressed'], 'true');
  await reopened.run("setSectionCollapsed('ypf', false)"); await reopened.run('setTitlesOnly(false)');
  assert.equal(reopened.run("collapsedSections.has('ypf')"), false);
  assert.equal(reopened.pressed['aria-pressed'], 'false');
  const sync = JSON.stringify(projectSyncData(normalizeData()));
  assert.ok(!sync.includes('collapsedSections')); assert.ok(!sync.includes('titlesOnly'));
});
test('preferencias locales antiguas o malformadas no impiden abrir el panel', async () => {
  const session = preferences(memoryArea({ 'nexb.collapsedSections': [null, 1, 'ypf'], 'nexb.titlesOnly': 'true' }));
  await session.run('restoreCollapsedSections()'); await session.run('restoreTitlesOnly()');
  assert.equal(session.run('collapsedSections.size'), 1);
  assert.equal(session.context.document.documentElement.dataset.titlesOnly, 'false');
});
test('inventario limita el título conservando el nombre completo para buscar y mostrar en tooltip', () => {
  const source = app.slice(app.indexOf('const INVENTORY_TITLE_MAX ='), app.indexOf('function inventoryBoxes()'));
  const shorten = vm.runInNewContext(source + '\nshortInventoryTitle');
  assert.equal(shorten('Título corto'), 'Título corto');
  assert.equal(shorten('x'.repeat(30)), 'x'.repeat(30));
  assert.equal(shorten('x'.repeat(50)), 'x'.repeat(29) + '…');
  assert.equal(shorten(''), 'Pestaña sin título');
  assert.equal(shorten('😀'.repeat(40)), '😀'.repeat(29) + '…');
});
