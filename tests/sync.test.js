import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeData } from '../src/model.js';
import { createSyncStore, mergeThreeWay, applyRemoteData, decideSyncAction, projectSyncData, SyncCorruptError, SYNC_CHUNK_BYTES, SYNC_CHUNK_PREFIX, SYNC_MANIFEST_KEY } from '../src/sync.js';
import { memoryArea } from './helpers.js';

function fixture() {
  const data = normalizeData();
  data.categories[0].accesses.push({ id: 'saved', title: 'Documento', url: 'https://example.com/', tags: ['Trabajo'], thumbnail: 'https://example.com/image.png', matchType: 'document' });
  return data;
}

function makeDevice(area) {
  return {
    store: createSyncStore(area),
    data: normalizeData(),
    lastRevision: '',
    dirty: false,
    commit(candidate, { markDirty = true } = {}) {
      this.data = normalizeData(candidate);
      if (markDirty) this.dirty = true;
    },
    async sync() {
      const remote = await this.store.load();
      const action = decideSyncAction(remote?.revision ?? '', this.lastRevision, this.dirty);
      if (action === 'upload') {
        const saved = await this.store.save(this.data);
        this.lastRevision = saved.revision;
        this.dirty = false;
      } else if (action === 'apply') {
        this.data = applyRemoteData(this.data, remote.data);
        this.lastRevision = remote.revision;
      } else if (action === 'merge') {
        this.data = mergeThreeWay(this.data, remote.data, { preferLocal: true });
        const saved = await this.store.save(this.data);
        this.lastRevision = saved.revision;
        this.dirty = false;
      }
      return action;
    }
  };
}

function addAccess(device, id) {
  const candidate = structuredClone(device.data);
  candidate.categories[0].accesses.push({ id, title: 'Acceso ' + id, url: 'https://example.com/' + id, tags: [], matchType: 'document', thumbnail: '' });
  device.commit(candidate);
}
function accessIds(device) {
  return device.data.categories.flatMap(category => category.accesses).map(access => access.id).sort();
}

test('la proyección sync excluye imágenes, fondos remotos y estado derivado', () => {
  const projected = projectSyncData(fixture());
  const serialized = JSON.stringify(projected);
  assert.doesNotMatch(serialized, /data:image/);
  assert.doesNotMatch(serialized, /backgroundImageUrl/);
  assert.doesNotMatch(serialized, /bookmarkMissing/);
  assert.equal(projected.categories[0].accesses[0].title, 'Documento');
});

test('mergeThreeWay conserva miniaturas locales al aplicar metadatos remotos', () => {
  const local = fixture();
  const remote = projectSyncData(local);
  remote.categories[0].accesses[0].title = 'Título remoto';
  const merged = mergeThreeWay(local, remote, { preferLocal: false });
  assert.equal(merged.categories[0].accesses[0].title, 'Título remoto');
  assert.equal(merged.categories[0].accesses[0].thumbnail, 'https://example.com/image.png');
});

test('mergeThreeWay no revierte el tamaño de miniaturas local', () => {
  const local = fixture();
  local.settings.thumbnailSize = 'custom';
  local.settings.thumbnailHeight = 320;
  const remote = projectSyncData(local);
  remote.settings.thumbnailSize = 'medium';
  remote.settings.thumbnailHeight = 144;
  const merged = mergeThreeWay(local, remote);
  assert.equal(merged.settings.thumbnailSize, 'custom');
  assert.equal(merged.settings.thumbnailHeight, 320);
});

test('mergeThreeWay conserva un workspace/categoría/acceso creado localmente que remoto todavía no conoce', () => {
  const local = fixture();
  const remote = projectSyncData(local);
  // El remoto representa el estado de ANTES de crear el workspace nuevo
  // (el caso real: se crea localmente y, antes de que el próximo push a
  // sync lo suba, corre una sincronización que trae este remoto viejo).
  local.workspaces.push({ id: 'nuevo-ws', name: 'Nuevo Workspace', type: 'standard' });
  local.categories.push({ id: 'nueva-cat', name: 'Nueva Categoría', workspaceId: 'nuevo-ws', parentId: '', accesses: [
    { id: 'nuevo-acceso', title: 'Acceso nuevo', url: 'https://example.com/nuevo', tags: [], thumbnail: '', matchType: 'document' },
  ] });
  local.categories[0].accesses.push({ id: 'otro-acceso-existente-cat', title: 'Otro acceso', url: 'https://example.com/otro', tags: [], thumbnail: '', matchType: 'document' });
  const merged = mergeThreeWay(local, remote);
  assert.ok(merged.workspaces.some(w => w.id === 'nuevo-ws'), 'el workspace nuevo no debe desaparecer');
  assert.ok(merged.categories.some(c => c.id === 'nueva-cat'), 'la categoría nueva no debe desaparecer');
  assert.ok(merged.categories.find(c => c.id === 'nueva-cat').accesses.some(a => a.id === 'nuevo-acceso'), 'el acceso de la categoría nueva no debe desaparecer');
  assert.ok(merged.categories[0].accesses.some(a => a.id === 'otro-acceso-existente-cat'), 'un acceso nuevo en una categoría ya existente en remoto no debe desaparecer');
});

test('mergeThreeWay une accesos presentes en un solo lado y en conflicto gana el lado elegido', () => {
  const local = fixture();
  const remote = projectSyncData(local);
  remote.categories[0].accesses.push({ id: 'remoto', title: 'Solo remoto', url: 'https://example.com/remoto', tags: [], matchType: 'document' });
  remote.categories[0].accesses[0].title = 'Cambio remoto';
  const remoteWins = mergeThreeWay(local, remote, { preferLocal: false });
  assert.equal(remoteWins.categories[0].accesses.find(a => a.id === 'saved').title, 'Cambio remoto');
  assert.ok(remoteWins.categories[0].accesses.some(a => a.id === 'remoto'));
  const localWins = mergeThreeWay(local, remote, { preferLocal: true });
  assert.equal(localWins.categories[0].accesses.find(a => a.id === 'saved').title, 'Documento');
  assert.ok(localWins.categories[0].accesses.some(a => a.id === 'remoto'));
});

test('decideSyncAction elige la acción correcta', () => {
  assert.equal(decideSyncAction('', '', false), 'upload');
  assert.equal(decideSyncAction('', '', true), 'upload');
  assert.equal(decideSyncAction('r1', 'r1', false), 'none');
  assert.equal(decideSyncAction('r1', 'r1', true), 'upload');
  assert.equal(decideSyncAction('r2', 'r1', false), 'apply');
  assert.equal(decideSyncAction('r2', 'r1', true), 'merge');
  assert.equal(decideSyncAction('r1', '', false), 'merge');
});

test('una edición local no se revierte al sincronizar (regresión del bug)', async () => {
  const area = memoryArea();
  const device = makeDevice(area);
  await device.sync();
  addAccess(device, 'a');
  await device.sync();
  const edited = structuredClone(device.data);
  edited.categories[0].accesses.find(access => access.id === 'a').title = 'Editado';
  device.commit(edited);
  await device.sync();
  assert.equal(device.data.categories[0].accesses.find(access => access.id === 'a').title, 'Editado');
  assert.equal((await device.store.load()).data.categories[0].accesses.find(access => access.id === 'a').title, 'Editado');
});

test('dos dispositivos combinan accesos sin perder ninguno', async () => {
  const area = memoryArea();
  const A = makeDevice(area);
  const B = makeDevice(area);
  await A.sync();
  addAccess(A, 'X');
  await A.sync();
  addAccess(B, 'Y');
  await B.sync();
  await A.sync();
  assert.deepEqual(accessIds(A), ['X', 'Y']);
  assert.deepEqual(accessIds(B), ['X', 'Y']);
});

test('aplica cambios remotos sin cambios locales y conserva las miniaturas locales', async () => {
  const area = memoryArea();
  const A = makeDevice(area);
  const B = makeDevice(area);
  await A.sync();
  await B.sync();
  addAccess(A, 'x');
  await A.sync();
  await B.sync();
  const withThumb = structuredClone(B.data);
  withThumb.categories[0].accesses.find(access => access.id === 'x').thumbnail = 'https://example.com/thumb.png';
  B.commit(withThumb);
  await B.sync();
  const renamed = structuredClone(A.data);
  renamed.categories[0].accesses.find(access => access.id === 'x').title = 'Después';
  A.commit(renamed);
  await A.sync();
  await B.sync();
  const x = B.data.categories[0].accesses.find(access => access.id === 'x');
  assert.equal(x.title, 'Después');
  assert.equal(x.thumbnail, 'https://example.com/thumb.png');
});

test('applyRemoteData reconstruye desde la nube conservando miniaturas locales', () => {
  const local = fixture();
  const remote = projectSyncData(local);
  remote.categories[0].accesses[0].title = 'Desde la nube';
  const full = applyRemoteData(local, remote);
  assert.equal(full.categories[0].accesses[0].title, 'Desde la nube');
  assert.equal(full.categories[0].accesses[0].thumbnail, 'https://example.com/image.png');
});

test('applyRemoteData conserva el Workspace activo y la imagen de fondo locales', () => {
  const local = fixture();
  local.workspaces.push({ id: 'segundo', name: 'Segundo', type: 'standard' });
  local.activeWorkspaceId = 'segundo';
  local.settings.backgroundImageUrl = 'https://example.com/fondo.jpg';
  const remote = projectSyncData(local);
  const full = applyRemoteData(local, remote);
  assert.equal(full.activeWorkspaceId, 'segundo');
  assert.equal(full.settings.backgroundImageUrl, 'https://example.com/fondo.jpg');
});

test('un borrado se propaga al aplicar remoto sin cambios locales', async () => {
  const area = memoryArea();
  const A = makeDevice(area);
  const B = makeDevice(area);
  await A.sync();
  await B.sync();
  addAccess(A, 'X');
  await A.sync();
  await B.sync();
  assert.ok(B.data.categories[0].accesses.some(access => access.id === 'X'));
  const deleted = structuredClone(A.data);
  deleted.categories[0].accesses = deleted.categories[0].accesses.filter(access => access.id !== 'X');
  A.commit(deleted);
  await A.sync();
  await B.sync();
  assert.equal(B.data.categories[0].accesses.some(access => access.id === 'X'), false);
});

test('createSyncStore guarda por fragmentos y recupera la proyección', async () => {
  const area = memoryArea(), store = createSyncStore(area), data = fixture();
  data.categories[0].accesses[0].title = 'x'.repeat(SYNC_CHUNK_BYTES * 2);
  const saved = await store.save(data);
  const loaded = await store.load();
  assert.ok(saved.bytes > SYNC_CHUNK_BYTES);
  assert.equal(loaded.data.categories[0].accesses[0].title, data.categories[0].accesses[0].title);
  assert.equal((await area.get(null))[SYNC_CHUNK_PREFIX + saved.revision + '.1'] !== undefined, true);
});

test('createSyncStore rechaza fragmentos ausentes sin borrar la copia local', async () => {
  const area = memoryArea(), store = createSyncStore(area);
  const saved = await store.save(fixture());
  await area.remove(SYNC_CHUNK_PREFIX + saved.revision + '.0');
  await assert.rejects(store.load(), /Faltan datos sincronizados/);
});

test('exceder la cuota total lanza error en español y no escribe nada', async () => {
  const area = memoryArea();
  area.QUOTA_BYTES = 500;
  const store = createSyncStore(area);
  await assert.rejects(store.save(fixture()), /demasiado grande/);
  assert.equal(area.writes, 0);
  assert.equal((await area.get(SYNC_MANIFEST_KEY))[SYNC_MANIFEST_KEY], undefined);
});

test('exceder la cuota por elemento lanza error sin escribir nada', async () => {
  const area = memoryArea();
  area.QUOTA_BYTES_PER_ITEM = 100;
  const store = createSyncStore(area);
  await assert.rejects(store.save(fixture()), /por elemento/);
  assert.equal(area.writes, 0);
});

test('limpia fragmentos huérfanos de revisiones anteriores y no los mezcla', async () => {
  const area = memoryArea();
  const store = createSyncStore(area);
  await store.save(fixture());
  await area.set({ [SYNC_CHUNK_PREFIX + 'vieja.0']: 'fragmento-huérfano' });
  const saved = await store.save(fixture());
  const chunks = Object.keys(await area.get(null)).filter(key => key.startsWith(SYNC_CHUNK_PREFIX));
  assert.equal(chunks.some(key => key.includes('vieja')), false);
  assert.ok(chunks.every(key => key.startsWith(SYNC_CHUNK_PREFIX + saved.revision + '.')));
});

test('detecta fragmentos dañados mediante el checksum del manifiesto', async () => {
  const area = memoryArea();
  const store = createSyncStore(area);
  const saved = await store.save(fixture());
  await area.set({ [SYNC_CHUNK_PREFIX + saved.revision + '.0']: 'corrupto' });
  await assert.rejects(store.load(), /dañados/);
});

function quotaEnforcedArea(quotaBytes) {
  let state = {};
  return {
    QUOTA_BYTES: quotaBytes,
    writes: 0,
    async get(keys) {
      if (keys === null) return structuredClone(state);
      return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(key => key in state).map(key => [key, structuredClone(state[key])]));
    },
    async set(values) {
      const next = { ...state, ...structuredClone(values) };
      const total = Object.entries(next).reduce((sum, [key, value]) => sum + key.length + JSON.stringify(value).length, 0);
      if (total > this.QUOTA_BYTES) throw new Error('QUOTA_BYTES exceeded');
      state = next;
      this.writes++;
    },
    async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete state[key]; },
    async setAccessLevel() {},
  };
}

test('conserva la última revisión si actualizar excede la cuota total', async () => {
  const area = quotaEnforcedArea(100000);
  const store = createSyncStore(area);
  const data = fixture();
  data.categories[0].accesses[0].title = 'x'.repeat(SYNC_CHUNK_BYTES);
  await store.save(data);
  const first = await area.get(null);
  const singleSize = Object.entries(first).reduce((sum, [key, value]) => sum + key.length + JSON.stringify(value).length, 0);
  area.QUOTA_BYTES = Math.floor(singleSize * 1.5);
  const updated = structuredClone(data);
  updated.categories[0].accesses[0].title = 'y'.repeat(SYNC_CHUNK_BYTES);
  await assert.rejects(store.save(updated), /sin eliminar la copia anterior/);
  const loaded = await store.load();
  assert.equal(loaded.data.categories[0].accesses[0].title, 'x'.repeat(SYNC_CHUNK_BYTES));
  assert.deepEqual(await area.get(null), first);
  const after = Object.entries(await area.get(null)).reduce((sum, [key, value]) => sum + key.length + JSON.stringify(value).length, 0);
  assert.ok(after <= area.QUOTA_BYTES);
});

test('load lee el formato de 1.9.1 y save lo migra al formato nuevo', async () => {
  const area = memoryArea(), data = fixture();
  const encoded = Buffer.from(JSON.stringify(projectSyncData(data))).toString('base64');
  await area.set({
    [SYNC_MANIFEST_KEY]: { schemaVersion: 1, count: 1, revision: 'antigua' },
    [SYNC_CHUNK_PREFIX + '0']: encoded
  });
  const store = createSyncStore(area);
  const loaded = await store.load();
  assert.equal(loaded.revision, 'antigua');
  assert.equal(loaded.data.categories[0].accesses[0].title, 'Documento');
  const saved = await store.save(data);
  const all = await area.get(null);
  assert.equal(SYNC_CHUNK_PREFIX + '0' in all, false);
  assert.equal((await store.load()).revision, saved.revision);
});

test('un tag borrado en este equipo no reaparece al sincronizar', () => {
  const local = fixture();
  const remote = projectSyncData(local);
  local.categories[0].accesses[0].tags = [];
  const merged = mergeThreeWay(local, remote, { preferLocal: true });
  assert.deepEqual(merged.categories[0].accesses[0].tags, []);
});

for (const preferLocal of [true, false]) {
  test('mergeThreeWay no duplica un acceso movido de categoría (preferLocal=' + preferLocal + ')', () => {
    const local = fixture();
    local.categories.push({ id: 'destino', name: 'Destino', workspaceId: local.workspaces[0].id, parentId: '', accesses: [] });
    const remote = projectSyncData(local);
    local.categories[1].accesses.push(local.categories[0].accesses.pop());
    const merged = mergeThreeWay(local, remote, { preferLocal });
    const holders = merged.categories.filter(c => c.accesses.some(a => a.id === 'saved')).map(c => c.id);
    assert.deepEqual(holders, [preferLocal ? 'destino' : local.categories[0].id]);
  });
}

test('una copia remota con ids duplicados se marca como dañada', () => {
  const local = fixture();
  const remote = projectSyncData(local);
  remote.categories.push({ ...remote.categories[0], id: 'otra', accesses: [remote.categories[0].accesses[0]] });
  assert.throws(() => applyRemoteData(local, remote), SyncCorruptError);
});

test('fragmentos con suma de control distinta se marcan como dañados', async () => {
  const area = memoryArea(), store = createSyncStore(area);
  await store.save(fixture());
  const all = await area.get(null);
  const key = Object.keys(all).find(k => k.startsWith(SYNC_CHUNK_PREFIX));
  await area.set({ [key]: all[key].slice(0, -4) + 'AAAA' });
  await assert.rejects(store.load(), SyncCorruptError);
});
test('la posición del título y de las etiquetas viaja por Chrome Sync', () => {
  const local = normalizeData();
  local.settings = { ...local.settings, titlePosition: 'above', tagsPosition: 'above' };
  const projected = projectSyncData(local);
  assert.equal(projected.settings.titlePosition, 'above');
  assert.equal(projected.settings.tagsPosition, 'above');
  assert.equal(normalizeData(projected).settings.titlePosition, 'above');
});
