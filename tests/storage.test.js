import test from 'node:test';
import assert from 'node:assert/strict';
import { createRepository, ConflictError } from '../src/storage.js';
import { normalizeData } from '../src/model.js';
import { memoryArea, locks } from './helpers.js';

test('mantiene la versión anterior como respaldo real', async () => {
  const area = memoryArea(), repo = createRepository(area, locks());
  const initial = await repo.load();
  const candidate = structuredClone(initial.data); candidate.workspaces[0].name = 'Nuevo';
  await repo.save(candidate, 0);
  const saved = await area.get(null);
  assert.equal(saved.workspaceData.workspaces[0].name, 'Nuevo');
  assert.equal(saved.workspaceDataBackup.workspaces[0].name, 'General');
  assert.equal(saved.workspaceRevision, 1);
});
test('dos escritores simultáneos no sobrescriben cambios de otra pestaña', async () => {
  const area = memoryArea(), mutex = locks();
  const a = createRepository(area, mutex), b = createRepository(area, mutex);
  const dataA = normalizeData(), dataB = normalizeData();
  dataA.workspaces[0].name = 'A'; dataB.workspaces[0].name = 'B';
  const result = await Promise.allSettled([a.save(dataA, 0), b.save(dataB, 0)]);
  assert.equal(result[0].status, 'fulfilled');
  assert.ok(result[1].reason instanceof ConflictError);
  assert.equal((await a.load()).data.workspaces[0].name, 'A');
  assert.equal(area.writes, 1);
});
test('error de disco no anuncia éxito ni modifica copia o revisión', async () => {
  const area = memoryArea({ workspaceData: normalizeData(), workspaceRevision: 7 });
  const before = await area.get(null); area.fail = true;
  await assert.rejects(createRepository(area, locks()).save(normalizeData(), 7), /Disk failure/);
  assert.deepEqual(await area.get(null), before);
});
test('recupera respaldo válido sin sobrescribir el original corrupto', async () => {
  const area = memoryArea({ workspaceData: { bad: true }, workspaceDataBackup: normalizeData() });
  const result = await createRepository(area, locks()).load();
  assert.equal(result.recovered, true);
  assert.equal(area.writes, 0);
  assert.deepEqual((await area.get(null)).workspaceData, { bad: true });
});
test('dos copias corruptas bloquean guardado sin reiniciar los datos', async () => {
  const area = memoryArea({ workspaceData: {}, workspaceDataBackup: [] });
  const repo = createRepository(area, locks());
  await assert.rejects(repo.load(), /No se han sobrescrito/);
  await assert.rejects(repo.save(normalizeData(), 0));
  assert.equal(area.writes, 0);
});
