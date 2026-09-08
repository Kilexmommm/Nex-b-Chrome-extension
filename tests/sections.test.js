import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeData } from '../src/model.js';
import { moveSection, reorderSection } from '../src/sections.js';

function fixture() {
  const data = normalizeData();
  data.workspaces.push({ id: 'personal', name: 'Personal', type: 'standard' });
  const access = { id: 'saved', title: 'Texto', url: 'https://example.com/', tags: ['XXX'], thumbnail: 'https://example.com/image.png', matchType: 'exact' };
  data.categories.push({ id: 'child', name: 'Sub', workspaceId: 'general', parentId: 'ypf', accesses: [access] },
    { id: 'other', name: 'Otra', workspaceId: 'general', parentId: '', accesses: [] });
  return data;
}
test('mueve sección y subcategorías preservando IDs, enlaces, tags e imágenes', () => {
  const data = fixture(), next = moveSection(data, 'ypf', 'personal');
  assert.equal(next.categories.find(c => c.id === 'ypf').workspaceId, 'personal');
  const child = next.categories.find(c => c.id === 'child');
  assert.equal(child.workspaceId, 'personal'); assert.equal(child.parentId, 'ypf');
  assert.deepEqual(child.accesses, data.categories[1].accesses);
  assert.equal(data.categories[0].workspaceId, 'general');
  assert.equal(next.categories.find(c => c.id === 'other').workspaceId, 'general');
});
test('mover solo una subcategoría no arrastra al padre', () => {
  const next = moveSection(fixture(), 'child', 'personal');
  assert.equal(next.categories[0].workspaceId, 'general');
  assert.equal(next.categories.find(c => c.id === 'child').parentId, '');
});
test('sube y baja entre secciones hermanas sin desasociar los hijos', () => {
  const data = fixture();
  const down = reorderSection(data, 'ypf', 1);
  assert.deepEqual(down.categories.filter(c => !c.parentId).map(c => c.id), ['other', 'ypf']);
  assert.equal(down.categories.find(c => c.id === 'child').parentId, 'ypf');
  assert.deepEqual(reorderSection(down, 'ypf', -1), data);
});
test('los límites de movimiento no cruzan niveles ni Workspaces', () => {
  const data = fixture();
  assert.deepEqual(reorderSection(data, 'ypf', -1), data);
  assert.deepEqual(reorderSection(data, 'other', 1), data);
  assert.deepEqual(reorderSection(data, 'child', 1), data);
  assert.throws(() => moveSection(data, 'ypf', 'missing'));
  assert.throws(() => moveSection(data, 'ypf', 'general'));
});
