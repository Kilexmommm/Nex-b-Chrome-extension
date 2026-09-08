import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeData } from '../src/model.js';
import { planBookmarkImport, readBookmarkFolder, placeAccess } from '../src/bookmarks.js';
let sequence = 0;
const uid = prefix => prefix + '-' + ++sequence;
const destination = { workspaceId: 'general', name: 'Clientes' };
const bookmark = (url = 'https://example.com/', title = 'Ejemplo') => ({ id: 'b1', url, title });

test('lee únicamente la carpeta elegida y sus hijos directos', async () => {
  const calls = [];
  const api = {
    async get(id) { calls.push(['get', id]); return [{ id, title: 'Clientes' }]; },
    async getChildren(id) { calls.push(['getChildren', id]); return [bookmark(), { id: 'nested', title: 'Subcarpeta' }]; }
  };
  const { children } = await readBookmarkFolder(api, '42');
  assert.deepEqual(calls, [['get', '42'], ['getChildren', '42']]);
  assert.equal(children.length, 2);
});
test('no importa recursivamente ni crea secciones para subcarpetas', () => {
  const result = planBookmarkImport(normalizeData(), [bookmark(), { id: 'sub', title: 'Sub', children: [bookmark('https://nested.test/')] }], destination, uid);
  assert.equal(result.stats.added, 1); assert.equal(result.stats.folders, 1);
  const imported = result.data.categories.find(c => c.name === 'Clientes');
  assert.equal(imported.accesses.length, 1);
  assert.equal(imported.accesses[0].url, 'https://example.com/');
});
test('reimportar añade solo nuevas URLs y no reemplaza imagen, nombre ni tags existentes', () => {
  const first = planBookmarkImport(normalizeData(), [bookmark()], destination, uid).data;
  const previous = first.categories.find(c => c.name === 'Clientes').accesses[0];
  previous.title = 'Nombre editado'; previous.tags = ['XXX']; previous.thumbnail = 'https://example.com/image.png';
  const second = planBookmarkImport(first, [bookmark(), bookmark('https://new.test/')], destination, uid);
  assert.deepEqual(second.stats, { added: 1, duplicates: 1, unsupported: 0, folders: 0 });
  assert.deepEqual(second.data.categories.find(c => c.name === 'Clientes').accesses[0], previous);
  assert.equal(second.data.categories.filter(c => c.name === 'Clientes').length, 1);
  const repeated = planBookmarkImport(second.data, [bookmark(), bookmark('https://new.test/')], destination, uid);
  assert.equal(repeated.stats.added, 0);
  assert.deepEqual(repeated.data, second.data);
});
test('ignora repetidos dentro de la misma carpeta y de todo el Workspace elegido', () => {
  const data = normalizeData();
  data.categories[0].accesses.push({ id: 'existing', title: 'Ya existe', url: 'https://example.com/', tags: [], thumbnail: '', matchType: 'exact' });
  const result = planBookmarkImport(data, [bookmark('https://example.com'), bookmark('https://new.test/'), bookmark('https://new.test/')], destination, uid);
  assert.equal(result.stats.duplicates, 2); assert.equal(result.stats.added, 1);
  assert.equal(data.categories.length, 1, 'no muta los datos originales');
});
test('no crea sección vacía ni importa protocolos ejecutables', () => {
  const result = planBookmarkImport(normalizeData(), [bookmark('javascript:alert(1)'), bookmark('chrome://settings/'), { id: 'folder', title: 'Sub' }], destination, uid);
  assert.equal(result.stats.added, 0); assert.equal(result.stats.unsupported, 2);
  assert.equal(result.data.categories.length, 1);
});
test('destino puede ser sección existente y query distinta no se confunde con duplicado', () => {
  const result = planBookmarkImport(normalizeData(), [bookmark('https://example.com/?id=1'), bookmark('https://example.com/?id=2')], { ...destination, categoryId: 'ypf' }, uid);
  assert.equal(result.stats.added, 2); assert.equal(result.data.categories.length, 1);
  assert.equal(result.data.categories[0].accesses.length, 2);
});
test('mover entre Workspaces conserva acceso, ID, tags e imagen y quita el original', () => {
  const data = normalizeData();
  const access = { id: 'saved', title: 'Documento', url: 'https://example.com/', tags: ['XXX'], thumbnail: 'https://example.com/image.png', matchType: 'document' };
  data.categories[0].accesses.push(access);
  data.workspaces.push({ id: 'personal', name: 'Personal', type: 'standard' });
  const candidate = structuredClone(data);
  placeAccess(candidate, structuredClone(access), { sourceCategoryId: 'ypf', workspaceId: 'personal', categoryId: '__new' }, uid);
  assert.equal(candidate.categories[0].accesses.length, 0);
  assert.deepEqual(candidate.categories.find(c => c.workspaceId === 'personal').accesses, [access]);
  assert.equal(data.categories[0].accesses.length, 1, 'cancelar antes de guardar no cambia el original');
  assert.doesNotThrow(() => normalizeData(candidate));
});
test('rechaza una sección perteneciente a otro Workspace', () => {
  const data = normalizeData(); data.workspaces.push({ id: 'personal', name: 'Personal', type: 'standard' });
  assert.throws(() => planBookmarkImport(data, [bookmark()], { ...destination, workspaceId: 'personal', categoryId: 'ypf' }, uid));
  assert.throws(() => placeAccess(data, { id: 'new' }, { workspaceId: 'personal', categoryId: 'ypf' }, uid));
});
