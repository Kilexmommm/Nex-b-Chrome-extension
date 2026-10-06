import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_DATA, normalizeData } from '../src/model.js';
import { deleteWorkspace, workspaceDeletionImpact, workspaceDeletionSummary } from '../src/workspaces.js';
import { createRepository } from '../src/storage.js';
import { memoryArea, locks } from './helpers.js';

const fixture = () => {
  const data = normalizeData(DEFAULT_DATA);
  data.workspaces.push({ id: 'personal', name: 'Personal', type: 'standard' },
    { id: 'proyectos', name: 'Proyectos', type: 'standard' });
  data.categories.push(
    { id: 'cat-a', name: 'A', workspaceId: 'personal', parentId: '', accesses: [{ id: 'acc-a', title: 'A', url: 'https://a.com/', matchType: 'document', tags: [], thumbnail: '' }] },
    { id: 'cat-b', name: 'B', workspaceId: 'personal', parentId: 'cat-a', accesses: [{ id: 'acc-b', title: 'B', url: 'https://b.com/', matchType: 'document', tags: [], thumbnail: '' }] },
    { id: 'cat-c', name: 'C', workspaceId: 'proyectos', parentId: '', accesses: [] });
  return normalizeData(data);
};

test('el resumen informa nombre y conteo de categorías, subcategorías y accesos', () => {
  const data = fixture();
  assert.deepEqual(workspaceDeletionImpact(data, 'personal'), {
    workspace: { id: 'personal', name: 'Personal', type: 'standard' },
    categories: 2, subcategories: 1, accesses: 2
  });
  const summary = workspaceDeletionSummary(data, 'personal');
  assert.match(summary, /Personal/);
  assert.match(summary, /2 categorías/);
  assert.match(summary, /1 subcategoría/);
  assert.match(summary, /2 accesos/);
});

test('no permite eliminar el último Workspace', () => {
  const data = normalizeData(DEFAULT_DATA);
  assert.throws(() => deleteWorkspace(data, 'general', true), /último Workspace/);
  assert.equal(deleteWorkspace(data, 'general', false), null);
  assert.equal(data.workspaces.length, 1);
});

test('una confirmación cancelada no elimina datos ni referencias', () => {
  const data = fixture();
  const before = JSON.stringify(data);
  assert.equal(deleteWorkspace(data, 'personal', false), null);
  assert.equal(JSON.stringify(data), before);
});

test('elimina el Workspace con sus categorías y accesos, conservando el resto', () => {
  const next = deleteWorkspace(fixture(), 'personal', true);
  assert.deepEqual(next.workspaces.map(w => w.id), ['general', 'proyectos']);
  assert.ok(!next.categories.some(c => c.workspaceId === 'personal'));
  assert.deepEqual(next.categories.map(c => c.id), ['ypf', 'cat-c']);
  assert.ok(next.categories.every(c => !c.parentId || next.categories.some(p => p.id === c.parentId)));
});

test('tras eliminar el Workspace activo navega a otro existente', () => {
  const active = fixture();
  active.activeWorkspaceId = 'personal';
  const next = deleteWorkspace(active, 'personal', true);
  assert.equal(next.activeWorkspaceId, 'proyectos');
  assert.ok(next.workspaces.some(w => w.id === next.activeWorkspaceId));

  const last = fixture();
  last.activeWorkspaceId = 'proyectos';
  const previous = deleteWorkspace(last, 'proyectos', true);
  assert.equal(previous.activeWorkspaceId, 'personal');

  const untouched = fixture();
  untouched.activeWorkspaceId = 'general';
  assert.equal(deleteWorkspace(untouched, 'personal', true).activeWorkspaceId, 'general');
});

test('conserva la copia anterior local al guardar la eliminación', async () => {
  const area = memoryArea(), repo = createRepository(area, locks());
  await repo.load();
  const withPersonal = fixture();
  await repo.save(withPersonal, 0);
  const deleted = deleteWorkspace(withPersonal, 'personal', true);
  await repo.save(deleted, 1);
  const stored = await area.get(null);
  assert.ok(!stored.workspaceData.workspaces.some(w => w.id === 'personal'));
  assert.ok(stored.workspaceDataBackup.workspaces.some(w => w.id === 'personal'));
  assert.ok(stored.workspaceDataBackup.categories.some(c => c.workspaceId === 'personal'));
});

test('la acción destructiva vive en Editar Workspace y exige confirmación', () => {
  const html = readFileSync(new URL('../newtab.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const editForm = html.split('id="editWorkspaceForm"')[1].split('</form>')[0];
  assert.match(editForm, /id="deleteWorkspace"[^>]*>Eliminar Workspace/);
  assert.match(html, /id="deleteWorkspaceDialog"/);
  assert.match(html, /id="deleteWorkspaceSummary"/);
  assert.match(app, /onSubmit\('deleteWorkspaceForm'/);
  assert.match(app, /deleteWorkspace\(data, \$\('deleteWorkspaceDialog'\)\.dataset\.workspaceId, true\)/);
  assert.match(app, /workspaceDeletionSummary\(data, workspaceId\)/);
});
