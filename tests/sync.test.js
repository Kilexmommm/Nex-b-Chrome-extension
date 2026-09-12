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
