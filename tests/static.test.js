import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { THEME_PRESETS, normalizeData } from '../src/model.js';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
test('tamaño usa bajo por defecto, tarjetas 20% más angostas y proporción 5:3', () => {
  const app = read('src/app.js'), css = read('src/styles.css');
  assert.match(app, /small: 168, medium: 240, large: 312/);
  assert.equal(normalizeData().settings.thumbnailSize, 'small');
  assert.match(css, /--card-min-width:168px/);
  assert.match(css, /minmax\(var\(--card-min-width\),1fr\)/);
  assert.match(css, /\.thumb \{[\s\S]*?aspect-ratio:5 \/ 3/);
  assert.match(css, /\.add-card \{[\s\S]*?aspect-ratio:5 \/ 3/);
  assert.match(read('newtab.html'), /title="Alto de miniaturas"/);
});
test('miniaturas se pueden ordenar al arrastrar dentro de su sección', () => {
  const app = read('src/app.js'), css = read('src/overrides.css');
  assert.match(app, /thumb\.draggable = viewMode === 'workspace'/);
  assert.match(app, /thumb\.ondragstart/);
  assert.match(app, /card\.ondrop/);
  assert.match(app, /moveAccessToPosition\(categoryId, draggedAccess\.accessId, access\.id, after\)/);
  assert.match(css, /\.thumb\[draggable=true\] \{ cursor: grab/);
  assert.doesNotMatch(app, /Mover miniatura a la izquierda|Mover miniatura a la derecha/);
});
test('vinculación y sincronización manual de Favoritos no exponen bajas en tarjetas', () => {
  const app = read('src/app.js'), html = read('newtab.html');
  assert.match(app, /syncCategoryBookmarks\(category\)/);
  assert.match(app, /syncWorkspaceBookmarks/);
  assert.match(app, /bookmarkState.hidden = !access\?\.bookmarkMissing/);
  assert.match(html, /id="bookmarkLink"/);
  assert.match(html, /id="syncWorkspaceBookmarks"/);
  assert.match(html, /id="bookmarkState"/);
  assert.doesNotMatch(app, /card-title[^\n]*bookmarkMissing/);
});
test('tarjetas sin imagen usan un fondo sólido sin cambiar capturas', () => {
  const css = read('src/overrides.css');
  assert.match(css, /\.card \.thumb:not\(\.has-thumbnail\) \{ background: var\(--empty-tile\); color: var\(--empty-ink\); \}/);
  assert.match(css, /\.thumb:not\(\.has-thumbnail\) \.card-overlay \{ background: none/);
  for (const theme of ['minimalista', 'papel', 'bosque', 'alegre', 'dunas', 'aurora', 'espacio']) {
    assert.ok(css.includes('[data-theme="' + theme + '"] { --empty-tile: #'));
  }
});
test('Papel conserva su textura local y selección al normalizar', () => {
  const preset = THEME_PRESETS.papel;
  assert.equal(preset.light, true);
  assert.match(preset.backgroundPattern, /repeating-linear-gradient/);
  assert.doesNotMatch(preset.backgroundPattern, /url\(/);
  const data = normalizeData();
  data.settings = { ...data.settings, ...preset, themeId: 'papel' };
  const saved = normalizeData(data);
  assert.equal(saved.settings.themeId, 'papel');
  assert.equal(saved.settings.backgroundPattern, preset.backgroundPattern);
  assert.equal(saved.settings.accentColor, '#c46746');
});
test('contadores numéricos, iconos sin borde y firma al final', () => {
  const app = read('src/app.js'), html = read('newtab.html');
  assert.match(app, /node\('span', 'count', String\(count\)\)/);
  assert.match(app, /accessCount\(items.length\)/);
  assert.match(app, /accessCount\(category.accesses.length\)/);
  assert.match(read('src/styles.css'), /\.category-icon \{[^}]*border:0;/);
  assert.match(html, /<footer class="signature">By.kilex<\/footer>\s*<\/main>/);
});
test('paletas de miniaturas y bordes coordinadas; editar discreto y accesible', () => {
  const css = read('src/overrides.css'), app = read('src/app.js');
  assert.match(app, /documentElement.dataset.theme = s.themeId/);
  for (const theme of ['minimalista', 'bosque']) {
    const palette = [...css.matchAll(new RegExp('\\[data-theme="' + theme + '"\\] \\{([^}]+)\\}', 'g'))].map(match => match[1]).join(' ');
    assert.match(palette, /--tile-gradient: radial-gradient/);
    assert.match(palette, /--tile-border:/);
    assert.match(palette, /--tile-ink:/);
  }
  assert.match(css, /\.card-edit \{[^}]*opacity: \.65/);
  assert.match(css, /\.card:focus-within \.card-edit \{ opacity: 1/);
  assert.match(css, /@media \(hover: none\)/);
  assert.match(css, /\.thumb:not\(\.has-thumbnail\) \.card-overlay \{ background: none/);
  assert.match(app, /thumb.classList.add\('has-thumbnail'\)/);
  assert.match(app, /img.onerror[^\n]*thumb.classList.remove\('has-thumbnail'\)/);
});
test('Estilos es la última sección antes de Guardar configuración', () => {
  const form = read('newtab.html').split('id="settingsForm"')[1].split('</form>')[0];
  assert.ok(form.indexOf('id="stylePresets"') > form.indexOf('id="restorePrevious"'));
  const after = form.slice(form.indexOf('id="stylePresets"'));
  assert.doesNotMatch(after, /<label|<input|<textarea/);
  assert.match(after, /Guardar configuración/);
});
test('Alegre es claro y Bosque se valida y conserva como estilo', () => {
  assert.equal(THEME_PRESETS.alegre.light, true);
  const data = normalizeData();
  data.settings = { ...data.settings, ...THEME_PRESETS.bosque, themeId: 'bosque' };
  assert.equal(normalizeData(data).settings.themeId, 'bosque');
  assert.equal(normalizeData(data).settings.backgroundPattern, THEME_PRESETS.bosque.backgroundPattern);
});
test('Aurora y Dunas usan fondos locales incluidos y válidos', () => {
  for (const themeId of ['aurora', 'dunas']) {
    const preset = THEME_PRESETS[themeId];
    assert.ok(existsSync(new URL('../' + preset.backgroundAsset, import.meta.url)));
    assert.match(preset.backgroundPattern, /assets\/backgrounds\//);
    const data = normalizeData();
    data.settings = { ...data.settings, themeId, accentColor: preset.accentColor, backgroundColor: preset.backgroundColor, backgroundPattern: preset.backgroundPattern };
    assert.equal(normalizeData(data).settings.backgroundPattern, preset.backgroundPattern);
  }
});
test('nombre a 13px, dos líneas, pie transparente y botón importar destacado', () => {
  const css = read('src/overrides.css');
  const title = css.match(/\.card-footer \.card-title \{([^}]+)\}/)[1];
  assert.match(title, /font-size: 13px/);
  assert.match(title, /-webkit-line-clamp: 2/);
  assert.match(title, /overflow: hidden/);
  assert.match(title, /text-overflow: ellipsis/);
  assert.match(css, /\.card, \.light-theme \.card \{ border: 0; background: transparent/);
  assert.match(css, /\.card-footer \{[^}]*background: transparent/);
  assert.match(css, /#openBookmarks \{ background: #ffb15c; color: #2a180c/);
});
test('manifest MV3: sin hosts, scripts remotos, recursos públicos ni evaluación dinámica', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.background.type, 'module');
  assert.deepEqual(manifest.permissions, ['tabs', 'storage', 'contextMenus', 'activeTab', 'unlimitedStorage', 'nativeMessaging']);
  assert.ok(existsSync(new URL('../native-host/install-macos.sh', import.meta.url)));
  assert.ok(existsSync(new URL('../native-host/nex_b_native_host.py', import.meta.url)));
  assert.deepEqual(manifest.optional_permissions, ['bookmarks']);
  for (const key of ['host_permissions', 'content_scripts', 'web_accessible_resources', 'externally_connectable']) assert.equal(manifest[key], undefined);
  assert.match(manifest.content_security_policy.extension_pages, /script-src 'self'; object-src 'none'/);
  assert.doesNotMatch(manifest.content_security_policy.extension_pages, /unsafe-eval/);
  for (const path of Object.values(manifest.icons)) assert.ok(existsSync(new URL('../' + path, import.meta.url)));
});
test('interfaz: todos los IDs usados existen y son únicos; módulo local sin innerHTML', () => {
  const html = read('newtab.html'), app = read('src/app.js');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const match of app.matchAll(/\$\('([^']+)'\)/g)) assert.ok(ids.includes(match[1]), 'Falta ' + match[1]);
  assert.match(html, /<script type="module" src="src\/app.js"><\/script>/);
  assert.doesNotMatch(app, /innerHTML|document\.write|eval\(/);
  assert.doesNotMatch(html, /id="rulesDialog"/);
  assert.match(app, /footer\.append\(status, title\)/);
  assert.match(app, /open\.append\(thumb, footer\)/);
  assert.doesNotMatch(app, /overlay\.append\(node\('div', 'card-title'/);
});
test('regresión de CSS: una base, hidden respetado y tag activo claro con contraste', () => {
  const css = read('src/styles.css'), overrides = read('src/overrides.css');
  assert.equal((css.match(/:root/g) || []).length, 1);
  assert.match(overrides, /\[hidden\] \{ display: none !important/);
  assert.match(overrides, /\.light-theme \.workspace-tab\.active:hover \{ background: #2f3437; border-color: #2f3437; color: #fff/);
  assert.match(overrides, /\.card \{ min-height: 0/);
});
