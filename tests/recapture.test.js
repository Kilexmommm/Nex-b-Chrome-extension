import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareRecapture, validateRecapture, findRecaptureTarget } from '../src/recapture.js';
import { normalizeData } from '../src/model.js';
import { memoryArea, locks } from './helpers.js';

const access = { id: 'saved', title: 'Mi documento', url: 'https://example.com/doc', matchType: 'exact', tags: ['XXX'], thumbnail: '' };
test('prepara la captura en una pestaña existente sin capturar en segundo plano', async () => {
  const session = memoryArea(), badges = [];
  const api = { storage: { session },
    tabs: { query: async () => [{ id: 42, windowId: 1, url: access.url }], update: async () => {},
      captureVisibleTab: () => assert.fail('No debe capturar sin clic en el icono') },
    windows: { update: async () => {} }, action: { setBadgeText: async value => badges.push(value), setTitle: async () => {} } };
  await prepareRecapture(access, api, locks());
  const request = (await session.get(null))['recapture:42'];
  assert.equal(request.accessId, access.id); assert.equal(request.url, access.url);
  assert.deepEqual(badges[0], { tabId: 42, text: '↻' });
});
test('rechaza solicitudes vencidas o de páginas equivocadas', () => {
  const request = { accessId: access.id, url: access.url, matchType: access.matchType, createdAt: 1000 };
  assert.equal(validateRecapture(request, { url: access.url }, 2000), request);
  assert.throws(() => validateRecapture(request, { url: 'https://example.com/login' }, 2000));
  assert.throws(() => validateRecapture(request, { url: access.url }, 2_000_000));
});
test('localiza el mismo acceso aunque se movió de sección, sin duplicarlo', () => {
  const data = normalizeData(); data.categories[0].accesses.push(access);
  const found = findRecaptureTarget(data, { accessId: access.id, targetUrl: access.url });
  assert.equal(found.access, access); assert.equal(found.category.id, 'ypf');
  assert.throws(() => findRecaptureTarget(data, { accessId: access.id, targetUrl: 'https://other.test/' }));
  assert.throws(() => findRecaptureTarget(data, { accessId: 'deleted', targetUrl: access.url }));
});
