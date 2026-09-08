import test from 'node:test';
import assert from 'node:assert/strict';
import { collectTags, suggestTags, insertTag, tagToken } from '../src/tags.js';
import { normalizeData } from '../src/model.js';

test('reúne tags manuales y configurados, incluidos los creados después de otro guardado', () => {
  const data = normalizeData();
  data.categories[0].accesses.push({ tags: ['XXX', 'xxx', 'Cliente'] });
  assert.equal(collectTags(data).filter(tag => tag.toLowerCase() === 'xxx').length, 1);
  assert.ok(collectTags(data).includes('Gmail'));
  data.categories[0].accesses.push({ tags: ['Nuevo'] });
  assert.ok(collectTags(data).includes('Nuevo'));
});
test('sugiere XXX al escribir x después de una coma y excluye tags ya seleccionados', () => {
  assert.deepEqual(suggestTags(['XXX', 'Cliente', 'Personal'], 'Cliente, x'), ['XXX']);
  assert.deepEqual(suggestTags(['XXX', 'Cliente'], 'Cliente, '), ['XXX']);
});
test('seleccionar una sugerencia reemplaza el fragmento, no agrega un tag incompleto', () => {
  assert.deepEqual(insertTag('Cliente, x', 'XXX'), { value: 'Cliente, XXX, ', caret: 14 });
});
test('autocompleta en medio de una lista y conserva los tags posteriores', () => {
  const result = insertTag('Cliente, x, Personal', 'XXX', 10);
  assert.equal(result.value, 'Cliente, XXX, Personal');
  assert.equal(result.caret, 14);
});
test('deduplica al seleccionar y maneja cursor al principio', () => {
  assert.equal(insertTag('XXX, x', 'XXX').value, 'XXX, ');
  assert.deepEqual(tagToken(', XXX', 0), { start: 0, end: 0, query: '' });
});
