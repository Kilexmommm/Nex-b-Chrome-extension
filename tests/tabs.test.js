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
