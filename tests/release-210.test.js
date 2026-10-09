import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeData, retainAccessMetadata } from '../src/model.js';
import { createRepository } from '../src/storage.js';
import { createSyncStore, projectSyncData, SyncQuotaError, SyncCorruptError } from '../src/sync.js';
import { createSyncController, mergeWithBase, SyncConflictError } from '../src/sync-controller.js';
import { compactImages, materializeImages, isImageRef } from '../src/image-store.js';
import { canDiscard, discardSelected, parseExcludedHosts } from '../src/memory.js';
import { syncRetryDelay } from '../src/retry.js';
import { captureStableTab } from '../src/capture.js';
import { openOrFocusMany } from '../src/tabs.js';
import { memoryArea, locks } from './helpers.js';

const thumbnail = 'data:image/webp;base64,aW1hZ2U=';
const reference = 'nexb-image:' + 'a'.repeat(64) + ':5';
function library() {
  const data = normalizeData();
  data.categories[0].accesses.push({ id: 'one', title: 'One', url: 'https://example.com/1', tags: [], matchType: 'exact', thumbnail });
  return data;
}
function images() {
  const blobs = new Map();
  return {
    puts: 0,
    fail: false,
    async put(value) { if (this.fail) throw new Error('Image disk full'); this.puts++; blobs.set(reference, new Blob(['image'], { type: 'image/webp' })); return reference; },
    async get(key) { if (!blobs.has(key)) throw new Error('Missing image'); return blobs.get(key); },
    async hasAll(refs) { return refs.every(ref => blobs.has(ref)); }
  };
}

test('migración conserva revisión, biblioteca y respaldo; los metadatos no contienen base64', async () => {
  const original = library(), backup = library(); backup.workspaces[0].name = 'Anterior';
  const area = memoryArea({ workspaceData: original, workspaceDataBackup: backup, workspaceRevision: 4 });
  const store = images(), repo = createRepository(area, locks(), store);
  await repo.migrate();
  const all = await area.get(null);
  assert.equal(all.workspaceRevision, 4);
  assert.equal(all.workspaceData.imageStorageVersion, 1);
  assert.ok(!JSON.stringify(all).includes('base64'));
  assert.deepEqual(await materializeImages((await repo.load()).data, store), original);
  assert.deepEqual(await materializeImages(await repo.loadBackup(), store), backup);
  const writes = area.writes; await repo.migrate(); assert.equal(area.writes, writes);
});

test('fallar al persistir blobs no cambia los datos de la versión anterior', async () => {
  const original = library(), area = memoryArea({ workspaceData: original, workspaceRevision: 4 });
  const before = await area.get(null), store = images(); store.fail = true;
  await assert.rejects(createRepository(area, locks(), store).migrate(), /Image disk full/);
  assert.deepEqual(await area.get(null), before);
});

test('editar metadatos no vuelve a escribir miniaturas y la carga no lee el respaldo', async () => {
  const area = memoryArea({ workspaceData: library() }), store = images(), repo = createRepository(area, locks(), store);
  await repo.migrate(); const puts = store.puts;
  const read = area.get, keys = [];
  area.get = async key => { keys.push(key); return read(key); };
  const snapshot = await repo.load(); snapshot.data.workspaces[0].name = 'Edited';
  await repo.save(snapshot.data, snapshot.revision, { markDirty: true });
  assert.equal(store.puts, puts);
  assert.ok(!keys.flat().includes('workspaceDataBackup'));
  assert.equal((await area.get('nexbSyncDirty')).nexbSyncDirty, true);
});

test('una imagen faltante provoca recuperación del respaldo, no un guardado silencioso', async () => {
  const bad = library(); bad.categories[0].accesses[0].thumbnail = reference;
  const area = memoryArea({ workspaceData: { imageStorageVersion: 1, data: bad }, workspaceDataBackup: normalizeData() });
  assert.equal((await createRepository(area, locks(), images()).load()).recovered, true);
  assert.equal(area.writes, 0);
});

test('la migración de imágenes y su exportación conservan los bytes y el MIME', async () => {
  const store = images(), data = library();
  const compact = await compactImages(data, store);
  assert.ok(isImageRef(compact.categories[0].accesses[0].thumbnail));
  assert.deepEqual(await materializeImages(compact, store), data);
});

test('liberar memoria excluye activas, audio, fijadas, navegación y dominios protegidos', () => {
  const tab = { id: 1, url: 'https://example.com', active: false, autoDiscardable: true };
  assert.equal(canDiscard(tab), true);
  for (const property of ['active', 'pinned', 'audible', 'discarded']) assert.equal(canDiscard({ ...tab, [property]: true }), false);
  assert.equal(canDiscard({ ...tab, pendingUrl: 'https://other.com' }), false);
  assert.equal(canDiscard({ ...tab, autoDiscardable: false }), false);
  assert.equal(canDiscard({ ...tab, url: 'chrome://settings' }), false);
  assert.equal(canDiscard({ ...tab, url: 'https://sub.example.com' }, ['example.com']), false);
  assert.deepEqual(parseExcludedHosts('docs.google.com\nhttps://figma.com/ docs.google.com'), ['docs.google.com', 'figma.com']);
});

test('descargar 100 pestañas revalida cada una; si cambió URL o actividad se omite', async () => {
  const tabs = Array.from({ length: 100 }, (_, id) => ({ id, url: 'https://example.com/' + id }));
  const discarded = [];
  const api = { get: async id => id === 1 ? { ...tabs[id], active: true } : id === 2 ? { ...tabs[id], url: 'https://other.com' } : tabs[id], discard: async id => { discarded.push(id); return { id, discarded: true }; } };
  const result = await discardSelected(tabs, api);
  assert.deepEqual(result, { discarded: 98, skipped: 2, failed: 0 });
  assert.equal(discarded.includes(1) || discarded.includes(2), false);
});

test('abrir una sección de 100 accesos consulta una vez y no despierta las pestañas existentes', async () => {
  const accesses = Array.from({ length: 100 }, (_, id) => ({ url: 'https://example.com/' + id, matchType: 'exact' }));
  let queries = 0, creates = 0;
  const api = { tabs: {
    query: async () => { queries++; return accesses.slice(0, 80).map((a, id) => ({ id, url: a.url, discarded: true })); },
    create: async options => { assert.equal(options.active, false); return { id: 100 + creates++, pendingUrl: options.url }; },
    update: () => { throw new Error('No debe despertar pestañas'); }
  } };
  assert.deepEqual(await openOrFocusMany(accesses, api, locks()), { opened: 20, focused: 80, failed: 0 });
  assert.equal(queries, 1);
});

test('captura descarta la imagen si cambia la pestaña o URL durante la operación', async () => {
  const tab = { id: 1, windowId: 2, url: 'https://example.com' };
  for (const after of [{ ...tab, id: 2 }, { ...tab, url: 'https://private.com' }, { ...tab, pendingUrl: 'https://new.com' }]) {
    let calls = 0;
    const api = { query: async () => [calls++ ? after : tab], captureVisibleTab: async () => thumbnail };
    await assert.rejects(captureStableTab(api, tab), /cambió/);
  }
});

test('editar miniatura conserva el hash de la última imagen sincronizada para detectar conflictos', () => {
  const original = { id: 'one', thumbnail, driveImageId: 'drive-1', driveImageHash: 'f'.repeat(64), bookmarkId: 'b' };
  const edited = retainAccessMetadata({ id: 'one', title: 'Edited', thumbnail: 'data:image/webp;base64,bmV3' }, original);
  assert.equal(edited.driveImageHash, original.driveImageHash);
  assert.equal(edited.driveImageId, original.driveImageId);
  assert.notEqual(edited.thumbnail, original.thumbnail);
});

test('errores permanentes se pausan y errores temporales tienen reintentos espaciados y acotados', () => {
  assert.equal(syncRetryDelay(new SyncQuotaError(), 1), null);
  assert.equal(syncRetryDelay(new SyncCorruptError(), 1), null);
  const delays = Array.from({ length: 6 }, (_, i) => syncRetryDelay(new Error('offline'), i + 1));
  assert.deepEqual(delays, [5000, 10000, 20000, 40000, 80000, null]);
});

test('merge con base conserva un borrado y una edición independiente', () => {
  const initial = library();
  initial.categories[0].accesses.push({ ...initial.categories[0].accesses[0], id: 'two', url: 'https://example.com/2' });
  const base = projectSyncData(initial), local = structuredClone(initial), remote = structuredClone(base);
  local.categories[0].accesses.shift(); remote.categories[0].accesses[1].title = 'Remote title';
  const merged = mergeWithBase(base, local, remote);
  assert.equal(merged.categories[0].accesses.length, 1);
  assert.equal(merged.categories[0].accesses[0].title, 'Remote title');
  assert.equal(merged.categories[0].accesses[0].thumbnail, thumbnail);
});

test('merge con base detecta ediciones incompatibles y borrado frente a edición', () => {
  const initial = library(), base = projectSyncData(initial), local = structuredClone(initial), remote = structuredClone(base);
  local.categories[0].accesses[0].title = 'Local'; remote.categories[0].accesses[0].title = 'Remote';
  assert.throws(() => mergeWithBase(base, local, remote), SyncConflictError);
  local.categories[0].accesses = [];
  assert.throws(() => mergeWithBase(base, local, remote), SyncConflictError);
});

test('dos paneles sincronizan con una sola escritura y conservan los cambios pendientes posteriores', async () => {
  const mutex = locks(), area = memoryArea({ workspaceData: library(), workspaceRevision: 0, nexbSyncEnabled: true, nexbSyncDirty: true });
  const repository = createRepository(area, mutex), cloud = memoryArea(), store = createSyncStore(cloud, mutex);
  const a = createSyncController({ repository, store, area, locks: mutex });
  const b = createSyncController({ repository, store, area, locks: mutex });
  await Promise.all([a.run(), b.run()]);
  assert.equal(cloud.writes, 1);
  await mutex.request('nex-b-state', async () => {
    const current = await repository.load(); current.data.workspaces[0].name = 'Pending';
    await repository.save(current.data, current.revision, { markDirty: true });
  });
  assert.equal((await area.get('nexbSyncDirty')).nexbSyncDirty, true);
  await b.run();
  assert.equal((await store.load()).data.workspaces[0].name, 'Pending');
});

test('un error de cuota conserva los cambios locales pendientes y la copia remota', async () => {
  const mutex = locks(), area = memoryArea({ workspaceData: library(), nexbSyncEnabled: true, nexbSyncDirty: true });
  const repository = createRepository(area, mutex), cloud = memoryArea(), actual = createSyncStore(cloud, mutex);
  const original = await actual.save(library());
  await area.set({ nexbSyncLastRevision: original.revision });
  const before = await cloud.get(null);
  const store = { load: () => actual.load(), save: async () => { throw new SyncQuotaError('quota'); } };
  const controller = createSyncController({ repository, store, area, locks: mutex });
  await assert.rejects(controller.run(), SyncQuotaError);
  assert.equal((await area.get('nexbSyncDirty')).nexbSyncDirty, true);
  assert.deepEqual(await cloud.get(null), before);
});

test('datos remotos corruptos nunca se reemplazan automáticamente', async () => {
  const mutex = locks(), area = memoryArea({ workspaceData: library(), nexbSyncEnabled: true });
  let writes = 0;
  const store = { load: async () => { throw new SyncCorruptError('corrupt'); }, save: async () => { writes++; } };
  const controller = createSyncController({ repository: createRepository(area, mutex), store, area, locks: mutex });
  await assert.rejects(controller.run(), SyncCorruptError);
  assert.equal(writes, 0); assert.equal(area.writes, 0);
});

test('Solo en este dispositivo excluye URL y miniatura, y conserva el acceso al aplicar la nube', async () => {
  const { applyRemoteData } = await import('../src/sync.js');
  const local = library(); local.categories[0].accesses[0].localOnly = true;
  const projection = projectSyncData(local);
  assert.equal(projection.categories[0].accesses.length, 0);
  assert.ok(!JSON.stringify(projection).includes('https://example.com/1'));
  const remote = normalizeData(); remote.workspaces = [{ id: 'other', name: 'Other', type: 'standard' }]; remote.categories = [];
  const applied = applyRemoteData(local, projectSyncData(remote));
  assert.ok(applied.workspaces.some(w => w.id === 'general'));
  assert.equal(applied.categories[0].accesses[0].localOnly, true);
  assert.equal(applied.categories[0].accesses[0].thumbnail, thumbnail);
});

test('dos equipos que publicaron desde la misma base combinan cambios sin perder ninguno', async () => {
  const initial = library(), base = projectSyncData(initial);
  const local = structuredClone(initial); local.workspaces[0].name = 'Local workspace';
  const remoteData = structuredClone(base); remoteData.categories[0].name = 'Remote category';
  const mutex = locks(), area = memoryArea({ workspaceData: local, nexbSyncEnabled: true, nexbSyncDirty: false, nexbSyncLastRevision: 'local-rev', nexbSyncBase: projectSyncData(local), nexbSyncParentRevision: 'base-rev', nexbSyncParentBase: base });
  let uploaded;
  const store = { load: async () => ({ revision: 'remote-rev', parentRevision: 'base-rev', data: remoteData }), save: async data => { uploaded = data; return { revision: 'merged-rev' }; } };
  const result = await createSyncController({ repository: createRepository(area, mutex), store, area, locks: mutex }).run();
  assert.equal(result.snapshot.data.workspaces[0].name, 'Local workspace');
  assert.equal(uploaded.categories[0].name, 'Remote category');
  assert.equal((await area.get('nexbSyncLastRevision')).nexbSyncLastRevision, 'merged-rev');
});

test('marcar localOnly elimina de la proyección remota un acceso que antes se sincronizaba', async () => {
  const publicData = library(), local = library(); local.categories[0].accesses[0].localOnly = true;
  const mutex = locks(), area = memoryArea({ workspaceData: local, nexbSyncEnabled: true, nexbSyncDirty: true, nexbSyncLastRevision: 'base' });
  let uploaded;
  const store = { load: async () => ({ revision: 'base', data: projectSyncData(publicData) }), save: async data => { uploaded = projectSyncData(data); return { revision: 'new' }; } };
  await createSyncController({ repository: createRepository(area, mutex), store, area, locks: mutex }).run();
  assert.equal(uploaded.categories[0].accesses.length, 0);
  assert.equal((await createRepository(area, mutex).load()).data.categories[0].accesses[0].localOnly, true);
});
