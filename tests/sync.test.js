import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeData } from '../src/model.js';
import { createSyncStore, mergeSyncData, projectSyncData, SYNC_CHUNK_BYTES, SYNC_CHUNK_PREFIX } from '../src/sync.js';
import { memoryArea } from './helpers.js';

function fixture() {
  const data = normalizeData();
  data.categories[0].accesses.push({ id: 'saved', title: 'Documento', url: 'https://example.com/', tags: ['Trabajo'], thumbnail: 'https://example.com/image.png', matchType: 'document' });
  return data;
}

test('la proyección sync excluye imágenes, fondos remotos y estado derivado', () => {
  const projected = projectSyncData(fixture());
  const serialized = JSON.stringify(projected);
  assert.doesNotMatch(serialized, /data:image/);
  assert.doesNotMatch(serialized, /backgroundImageUrl/);
  assert.doesNotMatch(serialized, /bookmarkMissing/);
  assert.equal(projected.categories[0].accesses[0].title, 'Documento');
});

test('mergeSyncData conserva miniaturas locales al aplicar metadatos remotos', () => {
  const local = fixture();
  const remote = projectSyncData(local);
  remote.categories[0].accesses[0].title = 'Título remoto';
  const merged = mergeSyncData(local, remote);
  assert.equal(merged.categories[0].accesses[0].title, 'Título remoto');
  assert.equal(merged.categories[0].accesses[0].thumbnail, 'https://example.com/image.png');
});

test('mergeSyncData conserva un workspace/categoría/acceso creado localmente que remoto todavía no conoce', () => {
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
  const merged = mergeSyncData(local, remote);
  assert.ok(merged.workspaces.some(w => w.id === 'nuevo-ws'), 'el workspace nuevo no debe desaparecer');
  assert.ok(merged.categories.some(c => c.id === 'nueva-cat'), 'la categoría nueva no debe desaparecer');
  assert.ok(merged.categories.find(c => c.id === 'nueva-cat').accesses.some(a => a.id === 'nuevo-acceso'), 'el acceso de la categoría nueva no debe desaparecer');
  assert.ok(merged.categories[0].accesses.some(a => a.id === 'otro-acceso-existente-cat'), 'un acceso nuevo en una categoría ya existente en remoto no debe desaparecer');
});

test('createSyncStore guarda por fragmentos y recupera la proyección', async () => {
  const area = memoryArea(), store = createSyncStore(area), data = fixture();
  data.categories[0].accesses[0].title = 'x'.repeat(SYNC_CHUNK_BYTES * 2);
  const saved = await store.save(data);
  const loaded = await store.load();
  assert.ok(saved.bytes > SYNC_CHUNK_BYTES);
  assert.equal(loaded.data.categories[0].accesses[0].title, data.categories[0].accesses[0].title);
  assert.equal((await area.get(null))[SYNC_CHUNK_PREFIX + 1] !== undefined, true);
});

test('createSyncStore rechaza fragmentos ausentes sin borrar la copia local', async () => {
  const area = memoryArea(), store = createSyncStore(area);
  await store.save(fixture());
  await area.remove(SYNC_CHUNK_PREFIX + '0');
  await assert.rejects(store.load(), /Faltan datos sincronizados/);
});
