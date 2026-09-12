import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { THEME_PRESETS, normalizeData } from '../src/model.js';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
test('configuración separa los ajustes generales del diseño visual', () => {
  const html = read('newtab.html'), app = read('src/app.js'), css = read('src/overrides.css'), baseCss = read('src/styles.css');
  const form = html.split('id="settingsForm"')[1].split('</form>')[0];
  assert.match(form, /id="settingsGeneralTab"/);
  assert.match(form, /id="settingsDesignTab"/);
  assert.match(form, /id="settingsGeneralPanel"/);
  assert.match(form, /id="settingsDesignPanel"/);
  assert.ok(form.indexOf('id="settingsGeneralPanel"') < form.indexOf('id="settingsDesignPanel"'));
  for (const id of ['fontFamily', 'cardStyle', 'cardBorder', 'cardBorderColor', 'cardSpacing', 'iconStyle']) assert.match(form, new RegExp('id="' + id + '"'));
  assert.match(app, /function selectSettingsTab\(tab\)/);
  assert.match(app, /dataset\.cardStyle = s\.cardStyle/);
  assert.match(app, /dataset\.iconStyle = s\.iconStyle/);
  assert.match(css, /--card-border-width/);
  assert.match(baseCss, /--card-gap/);
});
test('las miniaturas nuevas no tienen borde por defecto', () => {
  assert.equal(normalizeData().settings.cardBorder, 'none');
});
test('Gris Nex es el estilo predeterminado con un azul de prioridad sutil', () => {
  const defaults = normalizeData().settings;
  assert.equal(defaults.themeId, 'gris-nex');
  assert.equal(THEME_PRESETS['gris-nex'].name, 'Gris Nex');
  assert.equal(defaults.accentColor, '#4d8dff');
  assert.match(read('src/overrides.css'), /\.dialog-form \{[^}]*background: #212121/);
});
test('editar y capturar usan la misma regla Gris Nex de los ajustes', () => {
  const css = read('src/overrides.css');
  assert.match(css, /\.dialog-form \{[^}]*border-color: #454545/);
  assert.match(css, /\.dialog-form input, \.dialog-form select, \.dialog-form textarea \{[^}]*background: #2a2a2a/);
  assert.match(css, /\.dialog-form \.button:not\(\.secondary\) \{[^}]*background: #4d8dff/);
  assert.match(css, /\.dialog-form \.paste-box \{[^}]*background: #262626/);
});
test('los formularios ordenan contexto y controles en dos columnas, con estilos en cuatro columnas', () => {
  const app = read('src/app.js'), css = read('src/overrides.css');
  assert.match(app, /function arrangeDialogFields\(\)/);
  assert.match(app, /field-copy/);
  assert.match(css, /\.dialog-form \.field-row \{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(220px, 290px\)/);
  assert.match(css, /\.style-presets \{[^}]*repeat\(4, minmax\(0, 1fr\)\)/);
});
test('las acciones de los diálogos usan peso normal y capturar se alinea a la derecha', () => {
  const css = read('src/overrides.css');
  assert.match(css, /\.dialog-form \.button \{ font-weight: 500; \}/);
  assert.match(css, /\.dialog-form #recaptureStart \{ margin-left: auto; text-align: right; \}/);
});
test('la apertura local usa pestañas y ofrece la configuración de archivos', () => {
  const app = read('src/app.js'), worker = read('src/background.js');
  assert.doesNotMatch(app + worker, /sendNativeMessage|connectNative|nex-b-open-local/);
  assert.match(app, /openOrFocusTab\(access, chrome, navigator\.locks\)/);
  assert.match(read('newtab.html'), /id="openLocalSettings"/);
  assert.doesNotMatch(read('newtab.html'), /Instalar asistente macOS/);
});
test('captura por lote usa permiso opcional y conserva miniaturas existentes', () => {
  const app = read('src/app.js'), html = read('newtab.html');
  assert.match(html, /id="captureAllImages"/);
  assert.match(app, /chrome\.permissions\.request\(\{ origins: \['http:\/\/\*\/\*', 'https:\/\/\*\/\*'\] \}\)/);
  assert.match(app, /!access\.thumbnail && \/\^https\?:\//);
  assert.match(app, /chrome\.tabs\.captureVisibleTab/);
  assert.match(app, /chrome\.tabs\.remove\(temporary\.id\)/);
});
test('la sincronización global recorre todas las secciones vinculadas y muestra errores', () => {
  const app = read('src/app.js'), html = read('newtab.html');
  assert.match(app, /const linkedCategories = data\.categories\.filter\(item => item\.bookmarkFolderId\)/);
  assert.match(app, /unavailable\.push\(category\.name/);
  assert.match(html, /id="syncWorkspaceBookmarks"[^>]*>↻ Sincronizar favoritos importados/);
});
test('la actualización asistida abre el ZIP de GitHub y muestra la versión instalada', () => {
  const app = read('src/app.js'), html = read('newtab.html');
  assert.match(html, /id="openUpdate"[^>]*>Actualizar desde GitHub/);
  assert.match(html, /id="extensionVersion"/);
  assert.match(app, /const GITHUB_ARCHIVE_URL = 'https:\/\/github\.com\/Kilexmommm\/Nex-b-Chrome-extension\/archive\/refs\/heads\/main\.zip'/);
  assert.match(app, /chrome\.runtime\.getManifest\(\)\.version/);
  assert.match(app, /chrome\.tabs\.create\(\{ url: GITHUB_ARCHIVE_URL \}\)/);
});
test('la configuración incluye una pestaña de sincronización sin imágenes en Chrome Sync', () => {
  const app = read('src/app.js'), html = read('newtab.html'), sync = read('src/sync.js');
  assert.match(html, /id="settingsSyncTab"/);
  assert.match(html, /id="settingsSyncPanel"/);
  assert.match(html, /id="syncEnabled"/);
  assert.match(html, /id="syncNow"/);
  assert.match(app, /createSyncStore\(chrome\.storage\.sync\)/);
  assert.match(app, /chrome\.storage\.sync\.setAccessLevel/);
  assert.match(sync, /const \{ backgroundImageUrl, \.\.\.settings \}/);
  assert.match(sync, /const \{ thumbnail, bookmarkMissing, \.\.\.metadata \}/);
});
test('Drive usa OAuth privado y la pestaña ofrece subida y descarga de imágenes', () => {
  const manifest = JSON.parse(read('manifest.json')), app = read('src/app.js'), drive = read('src/drive.js'), html = read('newtab.html');
  assert.deepEqual(manifest.oauth2.scopes, ['https://www.googleapis.com/auth/drive.appdata']);
  assert.ok(manifest.oauth2.client_id.endsWith('.apps.googleusercontent.com'));
  assert.ok(manifest.permissions.includes('identity'));
  assert.deepEqual(manifest.host_permissions, ['https://www.googleapis.com/']);
  assert.match(app, /syncDriveImages\(data\)/);
  assert.match(drive, /appDataFolder/);
  assert.match(html, /id="syncDriveNow"/);
});
test('el inventario prioriza grupos repetidos con miniatura, contador y cierre pasivo', () => {
  const app = read('src/app.js'), css = read('src/styles.css');
  assert.match(app, /const groups = duplicateTabGroups\(tabs\)/);
  assert.match(app, /for \(const group of groups\)/);
  assert.match(app, /title \+ ' \(' \+ total \+ '\)'/);
  assert.match(app, /inventoryThumbnail\(access\)/);
  assert.match(app, /await refreshDuplicates\(group\.key\)/);
  assert.match(app, /checkbox\.dataset\.tabIds = JSON\.stringify\(group\.duplicates/);
  assert.match(css, /\.inventory-group-row \{/);
  assert.match(css, /\.inventory-thumbnail-image \{/);
});
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
  assert.match(css, /\.thumb, \.thumb\[draggable=true\] \{ cursor: default/);
  assert.match(css, /\.card\.holding-thumbnail \.thumb, \.card\.dragging \.thumb \{ cursor: grabbing/);
  assert.doesNotMatch(app, /Mover miniatura a la izquierda|Mover miniatura a la derecha/);
});
test('la URL aparece al posar el cursor sobre una miniatura y se limita a dos líneas', () => {
  const app = read('src/app.js'), css = read('src/overrides.css');
  assert.match(app, /thumb\.title = access\.url/);
  assert.match(app, /img\.title = access\.url/);
  assert.match(app, /thumb\.onpointerdown/);
  assert.doesNotMatch(css, /\.card-url/);
});
test('los accesos locales muestran un identificador visual diferente', () => {
  const app = read('src/app.js'), css = read('src/overrides.css');
  assert.match(app, /access\.url\.startsWith\('file:'\)/);
  assert.match(app, /'tag link-type local-link', '⌂ Archivo local'/);
  assert.match(css, /\.tag\.link-type\.local-link \{[^}]*background: #4b3a25/);
});
test('capturar imagen es un enlace discreto y alineado a la derecha', () => {
  const app = read('src/app.js'), css = read('src/overrides.css');
  assert.match(app, /node\('a', 'card-recapture', 'Capturar imagen'\)/);
  assert.match(css, /\[data-theme\] \.card-recapture \{[^}]*margin: 8px 2px 0 auto[^}]*font-weight: 400/);
});
test('los Workspaces se ordenan al arrastrar sus etiquetas, sin flechas de orden', () => {
  const app = read('src/app.js'), html = read('newtab.html'), css = read('src/overrides.css');
  assert.match(app, /b\.draggable = true/);
  assert.match(app, /b\.ondrop = event/);
  assert.match(app, /moveWorkspaceToPosition\(sourceId, workspace\.id/);
  assert.match(app, /candidate\.workspaces\.splice\(destinationIndex/);
  assert.match(css, /\.workspace-tab\[draggable=true\] \{ cursor: grab/);
  assert.doesNotMatch(html, /moveWorkspaceLeft|moveWorkspaceRight/);
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
test('manifest MV3: sin scripts remotos, recursos públicos ni evaluación dinámica', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.background.type, 'module');
  assert.deepEqual(manifest.permissions, ['tabs', 'storage', 'contextMenus', 'activeTab', 'unlimitedStorage', 'identity', 'identity.email', 'clipboardRead']);
  assert.deepEqual(manifest.optional_host_permissions, ['http://*/*', 'https://*/*']);
  assert.deepEqual(manifest.optional_permissions, ['bookmarks']);
  assert.deepEqual(manifest.host_permissions, ['https://www.googleapis.com/']);
  for (const key of ['content_scripts', 'web_accessible_resources', 'externally_connectable']) assert.equal(manifest[key], undefined);
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
  assert.match(app, /open\.append\(thumb\)/);
  assert.match(app, /card\.append\(open, footer, edit, recapture\)/);
  assert.doesNotMatch(app, /overlay\.append\(node\('div', 'card-title'/);
});
test('regresión de CSS: una base, hidden respetado y tag activo claro con contraste', () => {
  const css = read('src/styles.css'), overrides = read('src/overrides.css');
  assert.equal((css.match(/:root/g) || []).length, 1);
  assert.match(overrides, /\[hidden\] \{ display: none !important/);
  assert.match(overrides, /\.light-theme \.workspace-tab\.active:hover \{ background: #2f3437; border-color: #2f3437; color: #fff/);
  assert.match(overrides, /\.card \{ min-height: 0/);
});
