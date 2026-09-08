import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryArea, locks } from './helpers.js';
import { webcrypto } from 'node:crypto';

test('worker: menús, borradores concurrentes, captura opcional y errores', async () => {
  const listeners = {}, session = memoryArea(), local = memoryArea({ captureEnabled: false });
  const mutex = locks(), created = [], menus = [], badges = [];
  let removedMenus = 0, captures = 0;
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const previousCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const previousBitmap = Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap');
  const previousCanvas = Object.getOwnPropertyDescriptor(globalThis, 'OffscreenCanvas');
  Object.defineProperty(globalThis, 'navigator', { value: { locks: mutex }, configurable: true });
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  globalThis.chrome = {
    runtime: { onInstalled: { addListener: fn => { listeners.install = fn; } }, getURL: path => 'chrome-extension://test/' + path },
    storage: { local, session },
    contextMenus: {
      removeAll: async () => { removedMenus++; }, create: (menu, callback) => { menus.push(menu); callback(); },
      onClicked: { addListener: fn => { listeners.menu = fn; } }
    },
    tabs: {
      onRemoved: { addListener: fn => { listeners.removed = fn; } },
      create: async tab => { created.push(tab); return tab; },
      query: async () => [],
      captureVisibleTab: async () => { captures++; throw new Error('No activeTab grant'); }
    },
    action: {
      onClicked: { addListener: fn => { listeners.action = fn; } },
      setBadgeText: async value => badges.push(value), setBadgeBackgroundColor: async () => {}, setTitle: async () => {}
    }
  };
  try {
    await import('../src/background.js');
    assert.equal(removedMenus, 0, 'evaluar el worker no reinstala menús');
    assert.deepEqual(Object.keys(listeners).sort(), ['action', 'install', 'menu', 'removed']);
    listeners.install();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(removedMenus, 1); assert.equal(menus.length, 4);
    assert.deepEqual(menus.find(menu => menu.id === 'workspace-update-capture').contexts, ['page', 'action']);
    assert.deepEqual(menus.find(menu => menu.id === 'workspace-add-site').contexts, ['action']);
    const tab = { id: 1, windowId: 1, title: 'Page', url: 'https://example.com/' };
    listeners.menu({ menuItemId: 'unrelated', pageUrl: tab.url }, tab);
    assert.equal(created.length, 0);
    listeners.menu({ menuItemId: 'workspace-add-link', linkUrl: 'https://example.com/a' }, tab);
    listeners.menu({ menuItemId: 'workspace-add-link', linkUrl: 'https://example.com/b' }, tab);
    await mutex.idle();
    const drafts = Object.values(await session.get(null));
    assert.equal(drafts.length, 2); assert.equal(created.length, 2);
    assert.notEqual(created[0].url, created[1].url);
    assert.deepEqual(drafts.map(d => d.url), ['https://example.com/a', 'https://example.com/b']);
    assert.equal(captures, 0, 'no captura la página de origen de un enlace');
    assert.equal(local.writes, 0, 'no guarda capturas temporales en almacenamiento persistente');
    listeners.action(tab);
    await mutex.idle();
    assert.equal(captures, 0, 'respeta el interruptor de captura');
    assert.equal(Object.keys(await session.get(null)).length, 3);
    listeners.menu({ menuItemId: 'workspace-add-link', linkUrl: 'javascript:alert(1)' }, tab);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(created.length, 3);
    assert.ok(badges.some(b => b.text === '!'));
    await session.set({ 'draft:expired': { createdAt: 0, thumbnail: 'private' } });
    listeners.menu({ menuItemId: 'workspace-add-link', linkUrl: 'https://example.com/c' }, tab);
    await mutex.idle();
    assert.equal((await session.get(null))['draft:expired'], undefined);
    chrome.tabs.create = async () => { throw new Error('Cannot open'); };
    listeners.menu({ menuItemId: 'workspace-add-link', linkUrl: 'https://example.com/fail' }, tab);
    await mutex.idle();
    assert.equal(Object.keys(await session.get(null)).length, 4, 'limpia el borrador si falla la apertura');
    chrome.tabs.create = async tab => { created.push(tab); return tab; };
    chrome.tabs.query = async () => [tab];
    await local.set({ captureEnabled: true });
    listeners.action(tab);
    await mutex.idle();
    assert.equal(captures, 1);
    const all = Object.values(await session.get(null));
    assert.equal(all.length, 5, 'permite agregar si Chrome niega la captura');
    assert.ok(all.some(d => d.notice.includes('No se pudo capturar')));
    listeners.menu({ menuItemId: 'workspace-add-site' }, { ...tab, url: 'https://www.google.com/', title: 'Google' });
    await mutex.idle();
    assert.ok(Object.values(await session.get(null)).some(d => d.url === 'https://www.google.com/' && d.title === 'Google'));
    // Codec is simulated; this verifies binding and worker flow, not native image decoding.
    Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, value: async () => ({ width: 100, height: 50, close() {} }) });
    Object.defineProperty(globalThis, 'OffscreenCanvas', { configurable: true, value: class {
      getContext() { return { drawImage() {} }; }
      async convertToBlob() { return new Blob(['mock-webp'], { type: 'image/webp' }); }
    } });
    chrome.tabs.captureVisibleTab = async () => { captures++; return 'data:image/jpeg;base64,bW9jaw=='; };
    await local.set({ captureEnabled: false });
    await session.set({ 'recapture:1': { accessId: 'original-access', url: tab.url, matchType: 'exact', createdAt: Date.now() } });
    listeners.menu({ menuItemId: 'workspace-update-capture' }, tab);
    await mutex.idle();
    const captured = Object.values(await session.get(null)).find(d => d.accessId === 'original-access');
    assert.equal(captured.targetUrl, tab.url);
    assert.ok(captured.thumbnail.startsWith('data:image/webp;base64,'));
    assert.equal((await session.get(null))['recapture:1'], undefined);
    const countBefore = created.length;
    listeners.menu({ menuItemId: 'workspace-update-capture' }, tab);
    await mutex.idle();
    assert.equal(created.length, countBefore, 'actualizar sin solicitud no crea otro acceso');
    await session.set({ 'recapture:1': { accessId: 'later', url: tab.url, createdAt: Date.now() } });
    listeners.removed(1);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal((await session.get(null))['recapture:1'], undefined);
  } finally {
    delete globalThis.chrome;
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
    else delete globalThis.navigator;
    if (previousCrypto) Object.defineProperty(globalThis, 'crypto', previousCrypto);
    else delete globalThis.crypto;
    if (previousBitmap) Object.defineProperty(globalThis, 'createImageBitmap', previousBitmap);
    else delete globalThis.createImageBitmap;
    if (previousCanvas) Object.defineProperty(globalThis, 'OffscreenCanvas', previousCanvas);
    else delete globalThis.OffscreenCanvas;
  }
});
