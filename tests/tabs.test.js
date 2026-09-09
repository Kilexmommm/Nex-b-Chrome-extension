import test from 'node:test';
import assert from 'node:assert/strict';
import { openOrFocusTab } from '../src/tabs.js';
import { locks } from './helpers.js';

function mock(tabs = []) {
  let nextId = 1;
  const state = { tabs, creates: 0, updates: [], windows: [] };
  return { state, tabs: {
    query: async () => [...state.tabs],
    create: async value => { state.creates++; const tab = { id: nextId++, windowId: 1, pendingUrl: value.url }; state.tabs.push(tab); return tab; },
    update: async id => { state.updates.push(id); }
  }, windows: { update: async id => { state.windows.push(id); } } };
}
const access = { url: 'https://example.com/', matchType: 'exact' };
test('doble clic simultáneo crea una sola pestaña incluso durante navegación pendiente', async () => {
  const api = mock(), mutex = locks();
  await Promise.all([openOrFocusTab(access, api, mutex), openOrFocusTab(access, api, mutex)]);
  assert.equal(api.state.creates, 1);
  assert.equal(api.state.updates.length, 1);
});
test('consulta actual y enfoca la ventana de la pestaña existente', async () => {
  const api = mock([{ id: 4, windowId: 9, url: access.url }]);
  await openOrFocusTab(access, api, locks());
  assert.deepEqual(api.state.updates, [4]); assert.deepEqual(api.state.windows, [9]);
  assert.equal(api.state.creates, 0);
});
test('fallo al enfocar no crea un duplicado', async () => {
  const api = mock([{ id: 4, windowId: 9, url: access.url }]);
  api.windows.update = async () => { throw new Error('Window unavailable'); };
  await assert.rejects(openOrFocusTab(access, api, locks()));
  assert.equal(api.state.creates, 0);
});
test('crea reemplazo solo si la pestaña coincidente se cerró', async () => {
  const api = mock([{ id: 4, windowId: 9, url: access.url }]);
  api.tabs.update = async () => { api.state.tabs = []; throw new Error('Closed'); };
  await openOrFocusTab(access, api, locks());
  assert.equal(api.state.creates, 1);
});

test('abre HTML y carpetas directamente en pestañas, sin asistente nativo', async () => {
  for (const url of ['file:///Users/test/pagina.html', 'file:///Users/test/Mi%20carpeta/', 'file:///Users/test/documento.pdf']) {
    const api = mock();
    api.extension = { isAllowedFileSchemeAccess: async () => true };
    const tab = await openOrFocusTab({ url, matchType: 'document' }, api, locks());
    assert.equal(tab.pendingUrl, url);
    assert.equal(api.state.creates, 1);
  }
});
test('permiso local desactivado: explica cómo activarlo y no abre ni enfoca pestañas', async () => {
  const url = 'file:///Users/test/pagina.html';
  const api = mock([{ id: 8, windowId: 1, url }]);
  api.extension = { isAllowedFileSchemeAccess: async () => false };
  api.tabs.query = async () => { throw new Error('No debe consultar pestañas sin permiso'); };
  await assert.rejects(openOrFocusTab({ url, matchType: 'exact' }, api, locks()), /Permitir acceso a URLs de archivo/);
  assert.equal(api.state.creates, 0);
  assert.deepEqual(api.state.updates, []);
});
test('doble clic local reutiliza la pestaña pendiente sin confundir otras rutas', async () => {
  const url = 'file:///Users/test/Mi%20carpeta/pagina.html';
  const api = mock([{ id: 50, windowId: 1, url: 'file:///Users/test/otra.html' }]);
  api.extension = { isAllowedFileSchemeAccess: async () => true };
  const mutex = locks();
  await Promise.all([
    openOrFocusTab({ url, matchType: 'domain' }, api, mutex),
    openOrFocusTab({ url, matchType: 'domain' }, api, mutex)
  ]);
  assert.equal(api.state.creates, 1);
  assert.deepEqual(api.state.updates, [1]);
});
test('rechaza destinos ejecutables, remotos e inválidos antes de consultar permisos', async () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,test', 'file://server/share', 'file:///tmp/a.html?x=1', 'finder:///tmp/']) {
    const api = mock();
    api.extension = { isAllowedFileSchemeAccess: async () => { throw new Error('No debe consultar permisos'); } };
    await assert.rejects(openOrFocusTab({ url, matchType: 'exact' }, api, locks()), error => !error.message.includes('No debe consultar'));
    assert.equal(api.state.creates, 0);
  }
});
test('conserva errores reales de Chrome sin intentar otro programa', async () => {
  const api = mock();
  api.extension = { isAllowedFileSchemeAccess: async () => true };
  api.tabs.create = async () => { throw new Error('File URL navigation is not allowed'); };
  await assert.rejects(openOrFocusTab({ url: 'file:///tmp/a.html', matchType: 'exact' }, api, locks()), /File URL navigation is not allowed/);
});
