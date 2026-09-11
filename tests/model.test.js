import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_DATA, accessUrl, normalizeData, matches, imageUrl, webUrl, validateRules } from '../src/model.js';

const fixture = () => structuredClone(DEFAULT_DATA);
const access = (url, matchType = 'document') => ({ url, matchType });

test('migra datos anteriores sin resucitar categorías ni reglas eliminadas', () => {
  const old = fixture(); old.categories = []; old.autoTagRules = {};
  const result = normalizeData(old);
  assert.deepEqual(result.categories, []);
  assert.deepEqual(result.autoTagRules, {});
  assert.equal(result.schemaVersion, 1);
});
test('conserva el estado pineado de un acceso y lo omite cuando es falso', () => {
  const value = fixture();
  value.categories[0].accesses = [
    { id: 'a1', title: 'Uno', url: 'https://a.com/', tags: [], matchType: 'document', thumbnail: '', pinned: true },
    { id: 'a2', title: 'Dos', url: 'https://b.com/', tags: [], matchType: 'document', thumbnail: '' },
  ];
  const [one, two] = normalizeData(value).categories[0].accesses;
  assert.equal(one.pinned, true);
  assert.equal('pinned' in two, false);
});
test('las reglas iniciales reconocen GitHub Pages como GitHub', () => {
  assert.equal(DEFAULT_DATA.autoTagRules['github.com'], 'GitHub');
  assert.equal(DEFAULT_DATA.autoTagRules['github.io'], 'GitHub');
});
test('rechaza tipos corruptos, esquemas futuros e identificadores duplicados', () => {
  for (const value of [null, [], {}, { categories: null }, { ...fixture(), schemaVersion: 4 }]) assert.throws(() => normalizeData(value));
  const value = fixture(); value.workspaces.push(value.workspaces[0]);
  assert.throws(() => normalizeData(value), /duplicado/);
});
test('rechaza referencias rotas y ciclos de categorías', () => {
  const value = fixture(); value.categories[0].parentId = value.categories[0].id;
  assert.throws(() => normalizeData(value), /Subcategoría/);
  value.categories[0].parentId = ''; value.categories[0].workspaceId = 'missing';
  assert.throws(() => normalizeData(value), /inexistente/);
});
test('rechaza URLs ejecutables, credenciales e imágenes no permitidas', () => {
  for (const url of ['javascript:alert(1)', 'file:///tmp/test', 'data:text/html,test', 'https://user:password@example.com']) assert.throws(() => webUrl(url));
  for (const url of ['http://example.com/image.png', 'data:image/svg+xml;base64,AAAA', 'data:image/png;base64,?']) assert.throws(() => imageUrl(url));
  assert.equal(imageUrl('https://example.com/image.png'), 'https://example.com/image.png');
});
test('acepta solo rutas file:// locales para accesos del navegador', () => {
  assert.equal(accessUrl('file:///Users/test/archivo.html'), 'file:///Users/test/archivo.html');
  for (const url of ['file://server/share', 'file:///Users/test/a.html?x=1', 'file:///Users/test/a.html#x']) assert.throws(() => accessUrl(url));
});
test('descarta CSS arbitrario y claves no definidas sin contaminar prototipos', () => {
  const value = fixture(); value.settings.backgroundPattern = 'url(https://tracking.invalid)';
  Object.assign(value, JSON.parse('{"__proto__":{"polluted":true}}'));
  const result = normalizeData(value);
  assert.equal(result.settings.backgroundPattern, '');
  assert.equal({}.polluted, undefined);
  assert.equal(Object.hasOwn(result, '__proto__'), false);
  assert.throws(() => validateRules(JSON.parse('{"__proto__":"evil"}')));
});
test('conserva mayúsculas, query y fragmento en aplicaciones desconocidas', () => {
  assert.equal(matches(access('https://example.com/doc/AbC'), 'https://example.com/doc/abc'), false);
  assert.equal(matches(access('https://example.com/?id=1'), 'https://example.com/?id=2'), false);
  assert.equal(matches(access('https://example.com/#one'), 'https://example.com/#two'), false);
  assert.equal(matches(access('https://example.com/'), 'https://example.com/private'), false);
});
test('reconoce IDs de Google Docs, Drive, Figma y Miro', () => {
  for (const [a, b] of [
    ['https://docs.google.com/document/d/AbC/edit', 'https://docs.google.com/document/u/1/d/AbC/view#heading'],
    ['https://drive.google.com/file/d/AbC/view', 'https://drive.google.com/open?id=AbC'],
    ['https://www.figma.com/design/AbC/name?node-id=1', 'https://figma.com/file/AbC/other'],
    ['https://miro.com/app/board/AbC=/?moveToWidget=1', 'https://miro.com/app/board/AbC=/']
  ]) assert.equal(matches(access(a), b), true);
  assert.equal(matches(access('https://docs.google.com/document/d/AbC/edit'), 'https://docs.google.com/document/d/abc/edit'), false);
});
test('dominio exige el mismo origen y exacta conserva parámetros', () => {
  assert.equal(matches(access('https://mail.google.com/', 'domain'), 'https://mail.google.com/mail/u/1'), true);
  for (const url of ['http://mail.google.com/', 'https://mail.google.com:8443/', 'https://mail.google.com.evil.test/', 'chrome://newtab/']) assert.equal(matches(access('https://mail.google.com/', 'domain'), url), false);
  assert.equal(matches(access('https://example.com/?x=1', 'exact'), 'https://example.com/?x=2'), false);
});

test('rutas locales: coincidencia exacta incluso con detección por dominio o documento', () => {
  for (const matchType of ['domain', 'document', 'exact']) {
    const local = access('file:///Users/test/Mi carpeta/pagina.html', matchType);
    assert.equal(matches(local, 'file:///Users/test/Mi%20carpeta/pagina.html'), true);
    assert.equal(matches(local, 'file:///Users/test/otra.html'), false);
    assert.equal(matches(local, 'file:///Users/test/Mi%20carpeta/Pagina.html'), false);
    assert.equal(matches(local, 'https://example.com/pagina.html'), false);
    assert.equal(matches(local, 'file://server/Users/test/Mi%20carpeta/pagina.html'), false);
    assert.equal(matches(local, 'chrome://newtab/'), false);
    assert.equal(matches(local, undefined), false);
  }
  const folder = access('file:///Users/test/carpeta/', 'domain');
  assert.equal(matches(folder, 'file:///Users/test/carpeta/'), true);
  assert.equal(matches(folder, 'file:///Users/test/carpeta/hijo.html'), false);
});
