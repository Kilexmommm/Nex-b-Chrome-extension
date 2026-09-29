import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_DATA, accessUrl, normalizeData, normalizeNarrowColumns, matches, imageUrl, webUrl, validateRules, duplicateTabGroups, tabKey, THUMBNAIL_HEIGHTS, thumbnailHeightForSize, borderColorOverride } from '../src/model.js';

const fixture = () => structuredClone(DEFAULT_DATA);
test('no ofrece como duplicada una pestaña navegando a otro documento', () => {
  assert.deepEqual(duplicateTabGroups([
    { id: 1, url: 'https://example.com/a', active: true },
    { id: 2, url: 'https://example.com/a', pendingUrl: 'https://example.com/b' },
  ]), []);
});
const access = (url, matchType = 'document') => ({ url, matchType });

test('tabKey normaliza web y file, e ignora páginas internas del navegador', () => {
  assert.equal(tabKey('https://docs.google.com/document/u/0/d/ABC/edit?x=1'), tabKey('https://docs.google.com/document/d/ABC/view'));
  assert.equal(tabKey('file:///Users/test/a.html'), 'file:///Users/test/a.html');
  for (const url of ['chrome://newtab/', 'about:blank', 'chrome-extension://abc/newtab.html', 'no-es-url']) assert.equal(tabKey(url), '');
});
test('el inventario agrupa repetidas y conserva la activa, ignorando internas', () => {
  const tabs = [
    { id: 1, url: 'https://a.com/', active: false, windowId: 1 },
    { id: 2, url: 'https://a.com/', active: true, windowId: 2 },
    { id: 3, url: 'https://b.com/', active: false, windowId: 1 },
    { id: 4, url: 'chrome://newtab/', active: false, windowId: 1 },
  ];
  const groups = duplicateTabGroups(tabs);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].keep.id, 2);
  assert.deepEqual(groups[0].duplicates.map(t => t.id), [1]);
});
test('duplicateTabGroups tolera pestañas sin id o url inválida y entrada vacía', () => {
  assert.deepEqual(duplicateTabGroups([{ id: 1, url: 'https://a.com/' }, { url: 'https://a.com/' }, { id: 3, url: 'x' }]), []);
  assert.deepEqual(duplicateTabGroups(), []);
});

test('migra datos anteriores sin resucitar categorías ni reglas eliminadas', () => {
  const old = fixture(); old.categories = []; old.autoTagRules = {};
  const result = normalizeData(old);
  assert.deepEqual(result.categories, []);
  assert.deepEqual(result.autoTagRules, {});
  assert.equal(result.schemaVersion, 1);
});
test('las reglas iniciales reconocen GitHub Pages como GitHub', () => {
  assert.equal(DEFAULT_DATA.autoTagRules['github.com'], 'GitHub');
  assert.equal(DEFAULT_DATA.autoTagRules['github.io'], 'GitHub');
});
test('la categoría inicial no muestra una referencia específica del producto', () => {
  assert.equal(normalizeData().categories[0].name, 'General');
  const legacy = { ...fixture(), categories: [{ id: 'ypf', name: 'YPF', workspaceId: 'general', parentId: '', accesses: [] }] };
  assert.equal(normalizeData(legacy).categories[0].name, 'General');
});
test('acepta driveImageHash hexadecimal e ignora uno inválido sin romper la biblioteca', () => {
  const access = { id: 'saved', title: 'Imagen', url: 'https://example.com/', tags: [], thumbnail: '', matchType: 'document' };
  const valid = fixture();
  valid.categories[0].accesses.push({ ...access, driveImageId: 'drive-1', driveImageHash: 'a1b2c3d4' });
  assert.equal(normalizeData(valid).categories[0].accesses[0].driveImageHash, 'a1b2c3d4');
  for (const driveImageHash of ['XYZ', 'a'.repeat(129), 42]) {
    const invalid = fixture();
    invalid.categories[0].accesses.push({ ...access, driveImageId: 'drive-1', driveImageHash });
    const normalized = normalizeData(invalid).categories[0].accesses[0];
    assert.equal(normalized.driveImageId, 'drive-1');
    assert.equal(Object.hasOwn(normalized, 'driveImageHash'), false);
  }
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
test('en sitios desconocidos la ruta y las mayúsculas identifican el documento', () => {
  assert.equal(matches(access('https://example.com/doc/AbC'), 'https://example.com/doc/abc'), false);
  assert.equal(matches(access('https://example.com/'), 'https://example.com/private'), false);
});
test('query y fragmento no crean duplicados cuando el acceso no los define', () => {
  assert.equal(matches(access('https://example.com/page'), 'https://example.com/page?x=1'), true);
  assert.equal(matches(access('https://example.com/page'), 'https://example.com/page#seccion'), true);
  assert.equal(matches(access('https://example.com/page#uno'), 'https://example.com/page#otro'), true);
  assert.equal(matches(access('https://example.com/?id=1'), 'https://example.com/?id=2'), true);
});
test('una redireccion con www. no duplica el acceso', () => {
  assert.equal(matches(access('https://example.com/pagina'), 'https://www.example.com/pagina'), true);
  assert.equal(matches(access('https://www.example.com/', 'domain'), 'https://example.com/ruta'), true);
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
test('showWorkspaceTabs se conserva y por defecto es visible', () => {
  assert.equal(DEFAULT_DATA.settings.showWorkspaceTabs, true);
  assert.equal(normalizeData().settings.showWorkspaceTabs, true);
  const hidden = fixture();
  hidden.settings.showWorkspaceTabs = false;
  assert.equal(normalizeData(hidden).settings.showWorkspaceTabs, false);
  const invalid = fixture();
  invalid.settings.showWorkspaceTabs = 'sí';
  assert.equal(normalizeData(invalid).settings.showWorkspaceTabs, true);
});
test('las columnas del ancho reducido solo admiten 1 o 2 y por defecto son 1', () => {
  assert.equal(normalizeNarrowColumns(2), 2);
  for (const value of [1, 3, 0, '2', '1', null, undefined, true, {}, []]) assert.equal(normalizeNarrowColumns(value), 1);
});
test('el ajuste de alto de miniaturas deriva del tamaño elegido y respeta Personalizado', () => {
  assert.deepEqual({ ...THUMBNAIL_HEIGHTS }, { small: 101, medium: 144, large: 187 });
  assert.equal(thumbnailHeightForSize('small', 999), 101);
  assert.equal(thumbnailHeightForSize('medium', 999), 144);
  assert.equal(thumbnailHeightForSize('large', 999), 187);
  assert.equal(thumbnailHeightForSize('custom', 137), 137);
  assert.equal(thumbnailHeightForSize('desconocido', 137), 137);
});
test('el color de borde elegido por el usuario solo se aplica si difiere del predeterminado', () => {
  assert.equal(borderColorOverride('#ff0000'), '#ff0000');
  assert.equal(borderColorOverride('#4a4a4a'), '');
  assert.equal(borderColorOverride('#4A4A4A'), '');
  assert.equal(borderColorOverride(''), '');
  assert.equal(borderColorOverride(undefined), '');
  assert.equal(borderColorOverride(null), '');
  assert.equal(borderColorOverride('#123456', '#123456'), '');
  assert.equal(borderColorOverride('#123457', '#123456'), '#123457');
});
test('guardar y recargar conserva todos los ajustes de Diseño', () => {
  const saved = fixture();
  saved.settings = { ...saved.settings, fontFamily: 'serif', cardStyle: 'glass', cardBorder: 'strong', cardBorderColor: '#ff0000', cardSpacing: 'wide', iconStyle: 'round', thumbnailSize: 'large', thumbnailHeight: thumbnailHeightForSize('large', 101) };
  const reloaded = normalizeData(JSON.parse(JSON.stringify(saved))).settings;
  assert.equal(reloaded.fontFamily, 'serif');
  assert.equal(reloaded.cardStyle, 'glass');
  assert.equal(reloaded.cardBorder, 'strong');
  assert.equal(reloaded.cardBorderColor, '#ff0000');
  assert.equal(reloaded.cardSpacing, 'wide');
  assert.equal(reloaded.iconStyle, 'round');
  assert.equal(reloaded.thumbnailSize, 'large');
  assert.equal(reloaded.thumbnailHeight, 187);
});
