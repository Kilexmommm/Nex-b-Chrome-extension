import { proposeTabGroups, planGroupActions, groupingSummary } from './grouping.js';
import { DEFAULT_DATA, THEME_PRESETS, domainOf, normalizeData, normalizeNarrowColumns, validateRules, imageUrl, LIMITS, webUrl, accessUrl, duplicateTabGroups, tabKey, matchOrigin, documentMatchKey, thumbnailHeightForSize, borderColorOverride, filePathLabel, retainAccessMetadata } from './model.js';
import { createRepository } from './storage.js';
import { createImageStore, isImageRef } from './image-store.js';
import { createImageView } from './image-view.js';
import { backupTask } from './backup-client.js';
import { discardSelected, parseExcludedHosts } from './memory.js';
import { syncRetryDelay } from './retry.js';
import { createSyncController, SyncConflictError } from './sync-controller.js';
import { openOrFocusTab, openOrFocusMany, openSectionInNewWindow } from './tabs.js';
import { resizeImage } from './images.js';
import { collectTags, suggestTags, insertTag } from './tags.js';
import { planBookmarkImport, readBookmarkFolder, placeAccess, syncBookmarkSection } from './bookmarks.js';
import { moveSection, reorderSection, sectionSiblings } from './sections.js';
import { deleteWorkspace, workspaceDeletionSummary } from './workspaces.js';
import { prepareRecapture, findRecaptureTarget } from './recapture.js';
import { waitForCaptureTab, createBatchCommitter, createCaptureThrottle, delay, CAPTURE_PAINT_DELAY_MS, captureStableTab } from './capture.js';
import { checkForUpdate, shouldShowUpdateDialog, UPDATE_COMMAND, UPDATE_SNOOZE_KEY, UPDATE_SNOOZE_MS } from './update.js';
import { createSyncStore, projectSyncData } from './sync.js';
import { cleanupDriveOrphans, syncDriveImages } from './drive.js';

const $ = id => document.getElementById(id);
const uid = prefix => prefix + '-' + crypto.randomUUID();
const imageStore = createImageStore();
const imageView = createImageView(imageStore, () => data.settings.remoteImagesEnabled);
const repository = createRepository(chrome.storage.local, navigator.locks, imageStore);
const syncStore = createSyncStore(chrome.storage.sync);
const syncController = createSyncController({ repository, store: syncStore, area: chrome.storage.local, locks: navigator.locks });
let data = normalizeData(DEFAULT_DATA), revision = 0;
let viewMode = 'workspace', pastedImage = '', pasteGeneration = 0, imageBusy = false;
let saving = false, reloadPending = false, ready = false, pendingKey = '';
let openIndex = { exact: new Set(), domain: new Set(), document: new Set() };
let cardStatuses = [], tagCache = new Map();
let searchQuery = '', searchTimer = null;
let duplicateCounts = new Map();
let draggedAccess = null, draggedWorkspaceId = '';
let localThumbnailPreference = null;
let collapsedSections = new Set();
let titlesOnly = false;
let narrowColumns = 1;
const narrowMedia = window.matchMedia('(max-width: 600px)');
let syncEnabled = false, syncBusy = false, syncTimer = null, syncDirty = false, syncLastRevision = '';
let syncFailures = 0, syncPaused = false;
let captureBusy = false, captureCancelled = false;
let backgroundObjectUrl = '', backgroundGeneration = 0;
const captureThrottle = createCaptureThrottle();

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function arrangeDialogFields() {
  const descriptions = {
    categoryName: 'El nombre que verás dentro de este Workspace.',
    categoryParent: 'Puedes dejarla como sección principal.',
    moveSectionWorkspace: 'La sección y sus accesos se moverán a este destino.',
    accessTitle: 'Un nombre breve para reconocer este acceso.',
    accessUrl: 'La dirección que se abrirá al seleccionar la tarjeta.',
    accessThumbnailUrl: 'Opcional: usa una imagen remota para identificarlo.',
    accessWorkspace: 'Elige dónde quieres guardar este acceso.',
    accessCategory: 'Selecciona la sección dentro del Workspace.',
    accessTags: 'Sepáralos por comas para encontrarlo más rápido.',
    matchType: 'Evita abrir una pestaña que ya está disponible.',
    workspaceName: 'El nombre que aparecerá en su etiqueta.',
    workspaceKind: 'Principal para lo importante; estándar para el resto.',
    editWorkspaceName: 'Actualiza el nombre que aparece en la etiqueta.',
    editWorkspaceKind: 'Define la prioridad de este Workspace.',
    bookmarkWorkspace: 'Elige dónde guardar los favoritos importados.',
    bookmarkCategory: 'Usa una sección existente o crea una nueva.',
    bookmarkSectionName: 'Nombre para la sección creada desde favoritos.',
    accentColor: 'Color reservado para selección y acciones prioritarias.',
    backgroundColor: 'Color base del espacio de trabajo.',
    backgroundImageUrl: 'Opcional: añade una imagen de fondo remota.',
    thumbnailSize: 'Define la altura de todas las miniaturas.',
    fontFamily: 'Fuente usada en toda la interfaz.',
    cardStyle: 'Tratamiento visual de las tarjetas.',
    cardBorder: 'Las miniaturas nuevas no llevan borde por defecto.',
    cardBorderColor: 'Solo se usa si activas un borde.',
    cardSpacing: 'Espacio entre tarjetas del Workspace.',
    iconStyle: 'Aspecto de los controles con icono.',
    titlePosition: 'Dónde se muestra el título de cada miniatura.',
    tagsPosition: 'Dónde se muestran el chip de archivo local y las etiquetas.',
    showWorkspaceTabs: 'Muestra la fila de pestañas para cambiar de Workspace.',
    imageShade: 'Oscurece el borde de la miniatura para que las etiquetas se lean mejor.',
    settingsTagRules: 'Una regla por línea para etiquetar accesos automáticamente.',
    captureEnabled: 'Crea una miniatura al agregar un acceso.',
    bookmarkLink: 'Mantiene la sección vinculada a esa carpeta de Chrome.'
  };
  document.querySelectorAll('.dialog-form label').forEach(label => {
    const control = [...label.children].find(child => child.matches('input, select, textarea'));
    if (!control || label.classList.contains('field-row')) return;
    const copy = node('span', 'field-copy');
    [...label.childNodes].filter(child => child !== control).forEach(child => copy.append(child));
    const title = [...copy.childNodes].find(child => child.nodeType === Node.TEXT_NODE && child.textContent.trim());
    if (title) {
      const heading = node('span', 'field-label', title.textContent.trim());
      title.replaceWith(heading);
    }
    if (!copy.querySelector('small')) copy.append(node('small', '', descriptions[control.id] || 'Completa este valor para continuar.'));
    label.replaceChildren(copy, control);
    label.classList.add('field-row');
  });
}
arrangeDialogFields();
function accessCount(count) {
  const element = node('span', 'count', String(count));
  element.setAttribute('aria-label', count + (count === 1 ? ' acceso' : ' accesos'));
  return element;
}
function button(text, label, action, className = 'button secondary') {
  const element = node('button', className, text);
  element.type = 'button';
  element.title = label;
  element.setAttribute('aria-label', label);
  element.onclick = () => run(action);
  return element;
}
function showMessage(message, error = false) {
  const dialog = document.querySelector('dialog[open]');
  const target = dialog?.querySelector('.feedback') || $('appFeedback');
  target.textContent = message;
  target.hidden = false;
  target.classList.toggle('error', error);
}
async function run(action) {
  try { await action(); } catch (error) { showMessage(error.message || 'No se pudo completar la operación.', true); }
}
function currentWorkspace() {
  return data.workspaces.find(w => w.id === data.activeWorkspaceId) || data.workspaces[0];
}
function currentCategories() {
  return data.categories.filter(c => c.workspaceId === currentWorkspace().id);
}
function validThumbnailPreference(value) {
  if (!value || !['small', 'medium', 'large', 'custom'].includes(value.size)) return null;
  const height = Number(value.height);
  if (!Number.isInteger(height) || height < 80 || height > 480) return null;
  return { size: value.size, height };
}
async function restoreLocalThumbnailPreference() {
  const stored = await chrome.storage.local.get('nexbThumbnailPreference');
  localThumbnailPreference = validThumbnailPreference(stored.nexbThumbnailPreference);
}
function applyLocalThumbnailPreference() {
  if (!localThumbnailPreference) return;
  data.settings.thumbnailSize = localThumbnailPreference.size;
  data.settings.thumbnailHeight = localThumbnailPreference.height;
}
async function persistLocalThumbnailPreference(settings) {
  localThumbnailPreference = { size: settings.thumbnailSize, height: settings.thumbnailHeight };
  await chrome.storage.local.set({ nexbThumbnailPreference: localThumbnailPreference });
}
function applyNarrowColumns() {
  document.documentElement.dataset.narrowColumns = String(narrowColumns);
  document.documentElement.style.setProperty('--narrow-columns', String(narrowColumns));
  document.querySelectorAll('[data-narrow-columns]').forEach(item => {
    item.setAttribute('aria-pressed', String(Number(item.dataset.narrowColumns) === narrowColumns));
  });
}
async function restoreNarrowColumns() {
  const stored = await chrome.storage.local.get('nexb.narrowColumns');
  narrowColumns = normalizeNarrowColumns(stored['nexb.narrowColumns']);
  applyNarrowColumns();
}
async function setNarrowColumns(value) {
  narrowColumns = normalizeNarrowColumns(value);
  await chrome.storage.local.set({ 'nexb.narrowColumns': narrowColumns });
  applyNarrowColumns();
}
// Preferencias de vista por dispositivo (no viajan en la sincronización):
// el estado de secciones contraídas y el modo «solo títulos».
async function restoreCollapsedSections() {
  const stored = await chrome.storage.local.get('nexb.collapsedSections');
  const list = Array.isArray(stored['nexb.collapsedSections']) ? stored['nexb.collapsedSections'] : [];
  collapsedSections = new Set(list.filter(id => typeof id === 'string'));
}
async function setSectionCollapsed(id, collapsed) {
  if (collapsed) collapsedSections.add(id); else collapsedSections.delete(id);
  await chrome.storage.local.set({ 'nexb.collapsedSections': [...collapsedSections] });
  render();
}
function applyTitlesOnly() {
  document.documentElement.dataset.titlesOnly = String(titlesOnly);
  document.querySelectorAll('[data-main-action="titlesOnly"]').forEach(item => item.setAttribute('aria-pressed', String(titlesOnly)));
}
async function restoreTitlesOnly() {
  const stored = await chrome.storage.local.get('nexb.titlesOnly');
  titlesOnly = stored['nexb.titlesOnly'] === true;
  applyTitlesOnly();
}
async function setTitlesOnly(value) {
  titlesOnly = value === true;
  await chrome.storage.local.set({ 'nexb.titlesOnly': titlesOnly });
  applyTitlesOnly();
}
function closeMainMenu(restoreFocus = false) {
  const menu = $('mainMenu');
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  $('mainMenuToggle').setAttribute('aria-expanded', 'false');
  if (restoreFocus) $('mainMenuToggle').focus();
}
function setNarrow(matches) {
  document.documentElement.dataset.narrow = String(matches);
  const toggle = $('mainMenuToggle');
  if (toggle) toggle.hidden = !matches;
  if (!matches) closeMainMenu();
  if (ready) render();
}
function adopt(snapshot) {
  const selected = sessionStorage.getItem('activeWorkspace');
  data = snapshot.data;
  if (data.workspaces.some(w => w.id === selected)) data.activeWorkspaceId = selected;
  applyLocalThumbnailPreference();
  revision = snapshot.revision;
  applySettings();
  render();
}
async function reload() {
  if (saving || document.querySelector('dialog[open]')) { reloadPending = true; return; }
  const snapshot = await repository.load();
  if (saving || document.querySelector('dialog[open]')) { reloadPending = true; return; }
  if (snapshot.revision >= revision) adopt(snapshot);
  reloadPending = false;
}
async function commit(candidate, options = {}) {
  const { markDirty = true, underStateLock = false, expectedRevision = revision } = options;
  if (!underStateLock) return navigator.locks.request('nex-b-state', () => commit(candidate, { ...options, underStateLock: true, expectedRevision }));
  if (!ready) throw new Error('Los datos no están listos para guardar.');
  if (saving) throw new Error('Espera a que termine el guardado.');
  saving = true;
  document.querySelectorAll('dialog[open] button, dialog[open] input, dialog[open] select, dialog[open] textarea').forEach(b => { b.disabled = true; });
  try {
    const snapshot = await repository.save(candidate, expectedRevision, { markDirty });
    data = snapshot.data;
    revision = snapshot.revision;
    sessionStorage.setItem('activeWorkspace', data.activeWorkspaceId);
    await persistLocalThumbnailPreference(data.settings);
    applySettings();
    render();
    if (markDirty) {
      syncDirty = true;
      syncFailures = 0; syncPaused = false;
      scheduleSync();
    }
  } finally {
    saving = false;
    document.querySelectorAll('dialog button, dialog input, dialog select, dialog textarea').forEach(b => { b.disabled = false; });
  }
}
function openDialog(id) {
  if (!ready) throw new Error('La configuración no está disponible; no se modificó el almacenamiento.');
  const dialog = $(id);
  dialog.querySelector('.feedback').hidden = true;
  dialog.showModal();
}
function automaticTags(url) {
  const host = domainOf(url);
  return Object.entries(data.autoTagRules).filter(([domain]) => host === domain || host.endsWith('.' + domain)).map(([, tag]) => tag);
}
function allTags(access) {
  if (!tagCache.has(access.id)) tagCache.set(access.id, [...new Set([...access.tags, ...automaticTags(access.url)])]);
  return tagCache.get(access.id);
}
function parseRules(value) {
  const rules = {};
  for (const line of value.split('\n').map(s => s.trim()).filter(Boolean)) {
    const parts = line.split('=');
    if (parts.length !== 2) throw new Error('Usa una regla por línea: dominio.com = Tag.');
    const domain = parts[0].trim().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '').toLowerCase();
    Object.defineProperty(rules, domain, { value: parts[1].trim(), enumerable: true, configurable: true });
  }
  return validateRules(rules);
}
function selectSettingsTab(tab) {
  const panelByTab = { general: 'settingsGeneralPanel', design: 'settingsDesignPanel', sync: 'settingsSyncPanel', data: 'settingsDataPanel' };
  const tabByPanel = Object.fromEntries(Object.entries(panelByTab).map(([key, panel]) => [panel, 'settings' + key[0].toUpperCase() + key.slice(1) + 'Tab']));
  const selected = panelByTab[tab] ? tab : 'general';
  for (const [key, panelId] of Object.entries(panelByTab)) {
    const active = key === selected;
    const tabElement = $(tabByPanel[panelId]);
    $(panelId).hidden = !active;
    tabElement.setAttribute('aria-selected', String(active));
    tabElement.classList.toggle('active', active);
    tabElement.tabIndex = active ? 0 : -1;
  }
}
function applySettings() {
  const s = data.settings;
  document.documentElement.dataset.theme = s.themeId;
  document.documentElement.dataset.cardStyle = s.cardStyle;
  document.documentElement.dataset.iconStyle = s.iconStyle;
  // Posición del título y de las etiquetas de las miniaturas (issue #37); el CSS lee estos atributos.
  document.documentElement.dataset.titlePosition = s.titlePosition;
  document.documentElement.dataset.tagsPosition = s.tagsPosition;
  document.documentElement.dataset.imageShade = String(s.imageShade !== false);
  document.documentElement.dataset.thumbnailShadow = String(s.thumbnailShadow !== false);
  document.documentElement.style.setProperty('--accent-color', s.accentColor);
  const rgb = s.accentColor.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  document.documentElement.style.setProperty('--accent-ink', luminance > 0.179 ? '#000000' : '#ffffff');
  // La relación 5:3 se calcula en CSS desde el ancho de cada tarjeta.
  document.documentElement.style.setProperty('--card-min-width', Math.round(s.thumbnailHeight * 5 / 3) + 'px');
  document.documentElement.style.setProperty('--ui-font', ({ system: 'Inter,ui-sans-serif,system-ui,-apple-system,sans-serif', rounded: 'ui-rounded,"Arial Rounded MT Bold",system-ui,sans-serif', serif: 'ui-serif,Georgia,serif', mono: 'ui-monospace,SFMono-Regular,Menlo,monospace' }[s.fontFamily]));
  const borderOverride = borderColorOverride(s.cardBorderColor);
  if (borderOverride) document.documentElement.style.setProperty('--card-border-color', borderOverride);
  else document.documentElement.style.removeProperty('--card-border-color');
  document.documentElement.style.setProperty('--card-border-width', ({ none: '0px', soft: '1px', strong: '2px' }[s.cardBorder]));
  document.documentElement.style.setProperty('--card-gap', ({ compact: '9px', normal: '16px', wide: '25px' }[s.cardSpacing]));
  document.documentElement.classList.toggle('light-theme', Boolean(THEME_PRESETS[s.themeId]?.light));
  document.body.style.backgroundColor = s.backgroundColor;
  applyBackground(s);
  const preset = THEME_PRESETS[s.themeId];
  const hasImage = Boolean(s.backgroundImageUrl || (preset?.backgroundAsset && s.backgroundPattern === preset.backgroundPattern));
  document.body.style.backgroundSize = hasImage ? 'cover' : '';
  document.body.style.backgroundPosition = hasImage ? 'center' : '';
  document.body.style.backgroundAttachment = hasImage ? 'fixed' : '';
}
function applyBackground(settings) {
  const generation = ++backgroundGeneration;
  if (backgroundObjectUrl) URL.revokeObjectURL(backgroundObjectUrl);
  backgroundObjectUrl = '';
  document.body.style.backgroundImage = settings.backgroundPattern || 'none';
  const value = settings.backgroundImageUrl;
  if (!value || (value.startsWith('https:') && !settings.remoteImagesEnabled)) return;
  run(async () => {
    const url = isImageRef(value) ? URL.createObjectURL(await imageStore.get(value)) : value;
    if (generation !== backgroundGeneration) { if (url.startsWith('blob:')) URL.revokeObjectURL(url); return; }
    if (url.startsWith('blob:')) backgroundObjectUrl = url;
    document.body.style.backgroundImage = 'linear-gradient(rgba(10,14,25,.66),rgba(10,14,25,.86)), url(' + JSON.stringify(url) + ')';
  });
}
function applyPresetToForm(themeId) {
  const preset = THEME_PRESETS[themeId];
  if (!preset) return;
  $('accentColor').value = preset.accentColor;
  $('backgroundColor').value = preset.backgroundColor;
  $('backgroundImageUrl').value = '';
  $('settingsDialog').dataset.storedBackground = '';
  $('settingsDialog').dataset.themeId = themeId;
  $('settingsDialog').dataset.pattern = preset.backgroundPattern;
  document.querySelectorAll('.style-preset').forEach(b => b.classList.toggle('selected', b.dataset.themeId === themeId));
}
function renderStylePresets(themeId) {
  $('stylePresets').replaceChildren();
  for (const [id, preset] of Object.entries(THEME_PRESETS)) {
    const b = button('', preset.name, () => applyPresetToForm(id), 'style-preset');
    b.dataset.themeId = id;
    const swatch = node('span'); swatch.style.backgroundColor = preset.backgroundColor;
    swatch.style.backgroundImage = preset.backgroundPattern;
    if (preset.backgroundAsset) { swatch.style.backgroundSize = 'cover'; swatch.style.backgroundPosition = 'center'; }
    b.append(swatch, node('strong', '', preset.name));
    b.classList.toggle('selected', id === themeId);
    $('stylePresets').append(b);
  }
}

function isOpen(access) {
  try {
    if (access.url.startsWith('file:')) return openIndex.exact.has(accessUrl(access.url));
    const key = access.matchType === 'domain' ? matchOrigin(access.url) : access.matchType === 'exact' ? webUrl(access.url) : documentMatchKey(access.url);
    return openIndex[access.matchType].has(key);
  } catch { return false; }
}
function updateStatuses() {
  for (const { access, status, duplicateBadge } of cardStatuses) {
    const count = duplicateCounts.get(tabKey(access.url)) || 0;
    duplicateBadge.hidden = count === 0;
    duplicateBadge.textContent = count + (count === 1 ? ' repetida' : ' repetidas');
    duplicateBadge.title = count + ' copias adicionales abiertas. Ver este documento en el inventario.';
    const open = isOpen(access);
    status.classList.toggle('open', open);
    status.title = open ? 'Abierto' : 'Cerrado';
    status.setAttribute('aria-label', status.title);
  }
}
async function refreshTabs() {
  const tabs = await chrome.tabs.query({});
  duplicateCounts = new Map(duplicateTabGroups(tabs).map(group => [group.key, group.duplicates.length]));
  openIndex = { exact: new Set(), domain: new Set(), document: new Set() };
  for (const tab of tabs) {
    try {
      const url = accessUrl(tab.pendingUrl || tab.url);
      openIndex.exact.add(url);
      if (url.startsWith('file:')) continue;
      openIndex.domain.add(matchOrigin(url));
      openIndex.document.add(documentMatchKey(url));
    } catch { /* Internal browser pages cannot match saved accesses. */ }
  }
  updateStatuses();
}
let tabRefreshTimer, tabRefreshPending = false;
// Con nex.b en segundo plano no se recalcula nada: se marca como pendiente y se hace una
// sola vez al volver a la pestaña. Con muchas pestañas cargando, se agrupan los avisos.
function scheduleTabRefresh() {
  clearTimeout(tabRefreshTimer);
  if (document.hidden) { tabRefreshPending = true; return; }
  tabRefreshTimer = setTimeout(() => run(refreshTabs), 300);
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && tabRefreshPending) { tabRefreshPending = false; scheduleTabRefresh(); }
});
async function openAccess(access) {
  await openOrFocusTab(access, chrome, navigator.locks);
  scheduleTabRefresh();
}
async function openCategoryAccesses(category) {
  const { opened, focused, failed } = await openOrFocusMany(category.accesses, chrome, navigator.locks);
  scheduleTabRefresh();
  let message = 'Se abrieron ' + opened + ' y ya estaban abiertas ' + focused + '.';
  if (failed) message += ' ' + failed + ' no se pudieron abrir.';
  showMessage(message, failed > 0 && !opened && !focused);
}
// Título del grupo de Chrome: Workspace · sección (issue #46).
function sectionGroupTitle(category) {
  const workspace = data.workspaces.find(w => w.id === category.workspaceId);
  return (workspace?.name || 'Workspace') + ' · ' + category.name;
}
async function openCategoryInNewWindow(category) {
  const title = sectionGroupTitle(category);
  const { opened, failed, grouped, titled } = await openSectionInNewWindow(category.accesses, title, chrome, navigator.locks);
  scheduleTabRefresh();
  let message;
  if (!opened) {
    message = 'No hay enlaces compatibles para abrir en una ventana nueva.';
  } else if (grouped && titled) {
    message = 'Se abrieron ' + opened + ' en una ventana nueva, con el grupo «' + title + '».';
  } else if (grouped) {
    message = 'Se abrieron ' + opened + ' en una ventana nueva y se agruparon, pero no se pudo poner el título «' + title + '».';
  } else {
    message = 'Se abrieron ' + opened + ' en una ventana nueva, pero no se pudieron agrupar.';
  }
  if (failed) message += ' ' + failed + ' no se pudieron abrir.';
  showMessage(message, !opened || failed > 0 || (opened > 0 && (!grouped || !titled)));
}
let sidePanelWindowId = null;
if (chrome.windows?.getCurrent) chrome.windows.getCurrent().then(window => { sidePanelWindowId = window?.id ?? null; }).catch(() => {});
async function openSidePanel() {
  if (!chrome.sidePanel || typeof chrome.sidePanel.open !== 'function') throw new Error('El panel lateral no está disponible en esta versión de Chrome.');
  if (!Number.isInteger(sidePanelWindowId)) sidePanelWindowId = (await chrome.windows.getCurrent()).id;
  if (!Number.isInteger(sidePanelWindowId)) throw new Error('No se pudo identificar la ventana actual.');
  const options = typeof chrome.sidePanel.setOptions === 'function' ? chrome.sidePanel.setOptions({ path: 'newtab.html', enabled: true }).catch(() => {}) : Promise.resolve();
  await chrome.sidePanel.open({ windowId: sidePanelWindowId });
  await options;
}
function render() {
  cardStatuses = [];
  tagCache = new Map();
  $('workspaceTabs').replaceChildren();
  for (const workspace of data.workspaces) {
    const b = button(workspace.name, workspace.name, () => {
      data.activeWorkspaceId = workspace.id;
      sessionStorage.setItem('activeWorkspace', workspace.id);
      viewMode = 'workspace';
      render();
    }, 'workspace-tab' + (workspace.id === currentWorkspace().id && viewMode === 'workspace' ? ' active' : ''));
    b.setAttribute('aria-pressed', String(workspace.id === currentWorkspace().id && viewMode === 'workspace'));
    b.draggable = true;
    b.ondragstart = event => {
      draggedWorkspaceId = workspace.id;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', workspace.id);
      b.classList.add('dragging');
    };
    b.ondragover = event => {
      if (!draggedWorkspaceId || draggedWorkspaceId === workspace.id) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      b.classList.add('workspace-drag-over');
    };
    b.ondragleave = () => b.classList.remove('workspace-drag-over');
    b.ondragend = () => {
      draggedWorkspaceId = '';
      document.querySelectorAll('.workspace-tab').forEach(tab => tab.classList.remove('dragging', 'workspace-drag-over'));
    };
    b.ondrop = event => {
      event.preventDefault();
      b.classList.remove('workspace-drag-over');
      const sourceId = draggedWorkspaceId;
      if (!sourceId || sourceId === workspace.id) return;
      const bounds = b.getBoundingClientRect();
      run(() => moveWorkspaceToPosition(sourceId, workspace.id, event.clientX > bounds.left + bounds.width / 2));
    };
    $('workspaceTabs').append(b);
  }
  const narrow = document.documentElement.dataset.narrow === 'true';
  const workspaceTabsHidden = narrow || data.settings.showWorkspaceTabs === false;
  $('workspaceTabs').hidden = workspaceTabsHidden;
  $('workspacePicker').hidden = !workspaceTabsHidden;
  $('workspacePicker').replaceChildren(...data.workspaces.map(workspace => new Option(workspace.name, workspace.id, false, workspace.id === currentWorkspace().id && viewMode === 'workspace')));
  $('workspacePicker').onchange = () => {
    data.activeWorkspaceId = $('workspacePicker').value;
    sessionStorage.setItem('activeWorkspace', data.activeWorkspaceId);
    viewMode = 'workspace';
    render();
  };
  document.querySelectorAll('[data-thumbnail-size]').forEach(control => control.setAttribute('aria-pressed', String(control.dataset.thumbnailSize === data.settings.thumbnailSize)));
  $('thumbnailCustomHeight').value = data.settings.thumbnailHeight;
  $('thumbnailHeightRange').value = data.settings.thumbnailHeight;
  $('thumbnailHeightValue').textContent = data.settings.thumbnailHeight + ' px';
  $('tagRules').textContent = 'Tags';
  $('tagRules').setAttribute('aria-pressed', String(viewMode === 'tags'));
  imageView.clear($('workspace'));
  $('workspace').replaceChildren();
  $('emptyState').textContent = searchQuery ? 'Ningún acceso coincide con «' + $('accessSearch').value.trim() + '».'
    : viewMode === 'tags' ? 'Aún no hay accesos con tags en tus Workspaces.' : 'Agrega una categoría para empezar a organizar tus accesos.';
  if (viewMode === 'tags') renderTagView();
  else {
    const categories = currentCategories();
    const visible = category => category.accesses.filter(matchesSearch);
    let shown = 0;
    for (const category of categories.filter(c => !c.parentId)) {
      const children = categories.filter(c => c.parentId === category.id).map(child => [child, visible(child)]);
      const own = visible(category);
      // Al buscar, se ocultan las secciones sin coincidencias propias ni en sus subsecciones.
      if (searchQuery && !own.length && !children.some(([, items]) => items.length)) continue;
      renderCategory(category, false, own); shown++;
      for (const [child, items] of children) if (!searchQuery || items.length) renderCategory(child, true, items);
    }
    $('emptyState').hidden = shown > 0;
  }
  updateStatuses();
}
// Sin acentos ni mayúsculas: «diseno» encuentra «Diseño».
const searchText = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const matchesSearch = access => !searchQuery || searchText(access.title).includes(searchQuery);
function setSearch(value) {
  const query = searchText(value);
  if (query === searchQuery) return;
  searchQuery = query;
  render();
}
function closeSearch() {
  clearTimeout(searchTimer);
  $('accessSearch').value = '';
  $('accessSearch').hidden = true;
  $('searchToggle').setAttribute('aria-expanded', 'false');
  setSearch('');
}
function renderTagView() {
  const groups = new Map();
  // Los archivos locales no tienen dominio ni tags automáticos: se agrupan aparte
  // para que no desaparezcan de esta vista.
  let localFiles = [];
  for (const category of data.categories) for (const access of category.accesses) {
    if (access.url.startsWith('file:')) localFiles.push({ access, category });
    for (const tag of allTags(access)) {
      if (!groups.has(tag)) groups.set(tag, []);
      groups.get(tag).push({ access, category });
    }
  }
  if (searchQuery) for (const [tag, items] of groups) {
    const matching = items.filter(({ access }) => matchesSearch(access));
    if (matching.length) groups.set(tag, matching); else groups.delete(tag);
  }
  if (searchQuery) localFiles = localFiles.filter(({ access }) => matchesSearch(access));
  $('emptyState').hidden = groups.size > 0 || localFiles.length > 0;
  const entries = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  if (localFiles.length) entries.unshift(['', localFiles, true]);
  let shownGroups = 0;
  const moreGroups = button('Mostrar más tags', 'Mostrar otros 20 tags', appendGroups);
  function appendGroups() {
    moreGroups.remove();
    for (const [tag, items, local] of entries.slice(shownGroups, shownGroups + 20)) {
    const section = node('section', 'category');
    const heading = node('div', 'category-heading');
    heading.append(node('h2', local ? 'local-files-heading' : '', local ? '⌂ Archivos locales' : '# ' + tag), accessCount(items.length));
    const cards = node('div', 'cards');
    // Large tag groups are rendered incrementally to avoid creating thousands of image nodes.
    let shown = 0;
    const more = button('Mostrar más', 'Mostrar otros 40 accesos', appendPage, 'button secondary');
    function appendPage() {
      more.remove();
      items.slice(shown, shown + 40).forEach(({ access, category }) => cards.append(makeCard(access, category.id)));
      shown += 40;
      if (shown < items.length) cards.append(more);
      updateStatuses();
    }
    appendPage();
    section.append(heading, cards);
    $('workspace').append(section);
    }
    shownGroups += 20;
    if (shownGroups < entries.length) $('workspace').append(moreGroups);
  }
  appendGroups();
}
function renderCategory(category, subcategory, accesses = category.accesses) {
  const section = node('section', 'category' + (subcategory ? ' subcategory' : ''));
  const heading = node('div', 'category-heading');
  const actions = node('div', 'category-actions');
  actions.append(button('+', 'Nuevo acceso', () => openAccessDialog(category.id), 'button quiet category-icon'),
    button('⧉', 'Abrir todas las ventanas de esta sección', () => openCategoryAccesses(category), 'button quiet category-icon'),
    button('⊞', 'Abrir esta sección en una ventana nueva con grupo', () => openCategoryInNewWindow(category), 'button quiet category-icon'),
    button('✎', 'Editar categoría', () => renameCategory(category), 'button quiet category-icon'),
    button('⇥', 'Mover sección a otro Workspace', () => openMoveSectionDialog(category), 'button quiet category-icon'));
  if (category.bookmarkFolderId) actions.append(button('↻', 'Sincronizar sección con Favoritos de Chrome', () => syncCategoryBookmarks(category), 'button quiet category-icon'));
  const siblings = sectionSiblings(data, category);
  const position = siblings.findIndex(c => c.id === category.id);
  for (const [label, title, direction] of [['↑', 'Subir sección', -1], ['↓', 'Bajar sección', 1]]) {
    const control = button(label, title, () => commit(reorderSection(data, category.id, direction)), 'button quiet category-icon');
    control.disabled = position + direction < 0 || position + direction >= siblings.length;
    actions.append(control);
  }
  const collapsed = collapsedSections.has(category.id);
  const collapseToggle = button(collapsed ? '▸' : '▾', (collapsed ? 'Expandir' : 'Contraer') + ' sección ' + category.name, () => setSectionCollapsed(category.id, !collapsedSections.has(category.id)), 'button quiet category-icon category-collapse');
  collapseToggle.setAttribute('aria-expanded', String(!collapsed));
  heading.append(collapseToggle, node('h2', '', category.name), accessCount(accesses.length), actions);
  const cards = node('div', 'cards');
  let shown = 0;
  const more = button('Mostrar más', 'Mostrar otros 40 accesos', appendPage, 'button secondary');
  function appendPage() {
    more.remove();
    const fragment = document.createDocumentFragment();
    accesses.slice(shown, shown + 40).forEach(access => fragment.append(makeCard(access, category.id)));
    cards.append(fragment); shown += 40;
    if (shown < accesses.length) cards.append(more);
    updateStatuses();
  }
  appendPage();
  if (!searchQuery) cards.append(button('+', 'Nuevo acceso', () => openAccessDialog(category.id), 'add-card'));
  cards.hidden = collapsed && !searchQuery;
  section.append(heading, cards);
  $('workspace').append(section);
}
function makeCard(access, categoryId) {
  const card = node('article', 'card');
  const open = button('', 'Abrir o enfocar: ' + access.title, () => openAccess(access), 'card-open');
  const thumb = node('div', 'thumb');
  thumb.title = access.url;
  thumb.draggable = viewMode === 'workspace';
  if (access.thumbnail) {
    thumb.classList.add('has-thumbnail');
    const img = node('img', 'thumbnail-image'); imageView.set(img, access.thumbnail); img.alt = ''; img.title = access.url;
    img.loading = 'lazy'; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
    img.onerror = () => { img.remove(); thumb.classList.remove('has-thumbnail'); thumb.prepend(node('span', 'image-error', 'Imagen no disponible')); };
    thumb.append(img);
  } else thumb.append(node('span', 'image-error visually-hidden', 'Sin miniatura'));
  const overlay = node('div', 'card-overlay');
  overlay.title = access.url;
  if (viewMode === 'tags') {
    const category = data.categories.find(item => item.id === categoryId);
    const workspace = data.workspaces.find(item => item.id === category?.workspaceId);
    if (workspace) overlay.append(node('span', 'tag workspace-tag', workspace.name));
  }
  const tags = node('div', 'tags');
  if (access.url.startsWith('file:')) {
    const local = node('span', 'tag link-type local-link', '⌂ Archivo local');
    local.title = 'Acceso a archivo o carpeta local';
    tags.append(local);
    // Abajo a la izquierda: última carpeta y archivo, para saber dónde está.
    // La ruta completa ya aparece en el tooltip de la miniatura (thumb.title).
    thumb.append(node('span', 'file-path', filePathLabel(access.url)));
    thumb.classList.add('has-file-path');
  }
  const automatic = new Set(automaticTags(access.url));
  allTags(access).forEach(tag => tags.append(node('span', 'tag' + (automatic.has(tag) ? ' auto' : ''), tag)));
  overlay.append(tags);
  // Siempre sobre la imagen; «arriba» (tagsPosition) solo cambia la esquina por CSS.
  thumb.append(overlay);
  const status = node('span', 'status');
  status.setAttribute('role', 'img');
  const footer = node('div', 'card-footer');
  const title = button(access.title, 'Abrir o enfocar: ' + access.title, () => openAccess(access), 'card-title card-title-link'); title.title = access.title;
  const duplicateBadge = button('', 'Ver pestañas repetidas de ' + access.title, async () => {
    await openInventoryDialog();
    selectInventoryTab('dup');
    await refreshDuplicates(tabKey(access.url));
  }, 'card-duplicates');
  duplicateBadge.hidden = true;
  footer.append(status, title);
  footer.append(duplicateBadge);
  open.append(thumb);
  cardStatuses.push({ access, status, duplicateBadge });
  const edit = button('✎', 'Editar ' + access.title, () => openAccessDialog(categoryId, access), 'card-edit');
  card.append(open, footer, edit);
  thumb.ondragstart = event => {
    if (viewMode !== 'workspace') return;
    draggedAccess = { categoryId, accessId: access.id };
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', access.id);
    card.classList.add('dragging');
  };
  thumb.onpointerdown = () => { if (viewMode === 'workspace') card.classList.add('holding-thumbnail'); };
  thumb.onpointerup = thumb.onpointercancel = () => card.classList.remove('holding-thumbnail');
  thumb.ondragend = () => { draggedAccess = null; document.querySelectorAll('.card.drag-over, .card.dragging, .card.holding-thumbnail').forEach(item => item.classList.remove('drag-over', 'dragging', 'holding-thumbnail')); };
  card.ondragover = event => {
    if (!draggedAccess || draggedAccess.categoryId !== categoryId || draggedAccess.accessId === access.id) return;
    event.preventDefault(); event.dataTransfer.dropEffect = 'move'; card.classList.add('drag-over');
  };
  card.ondragleave = () => card.classList.remove('drag-over');
  card.ondrop = event => {
    if (!draggedAccess || draggedAccess.categoryId !== categoryId || draggedAccess.accessId === access.id) return;
    event.preventDefault();
    const after = event.clientX > card.getBoundingClientRect().left + card.getBoundingClientRect().width / 2;
    run(() => moveAccessToPosition(categoryId, draggedAccess.accessId, access.id, after));
  };
  card.oncontextmenu = event => { event.preventDefault(); showCardMenu(event, access, categoryId); };
  card.onkeydown = event => {
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      event.preventDefault();
      const rect = card.getBoundingClientRect();
      showCardMenu({ clientX: rect.left, clientY: rect.top }, access, categoryId);
      $('cardMenu').querySelector('button').focus();
    }
  };
  return card;
}
async function moveAccessToPosition(categoryId, accessId, targetId, after) {
  const candidate = structuredClone(data);
  const category = candidate.categories.find(item => item.id === categoryId);
  const sourceIndex = category?.accesses.findIndex(item => item.id === accessId) ?? -1;
  const targetIndex = category?.accesses.findIndex(item => item.id === targetId) ?? -1;
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
  const [access] = category.accesses.splice(sourceIndex, 1);
  const updatedTarget = category.accesses.findIndex(item => item.id === targetId);
  category.accesses.splice(updatedTarget + (after ? 1 : 0), 0, access);
  await commit(candidate);
}
function fillTagSuggestions() {
  const input = $('accessTags');
  const suggestions = suggestTags(collectTags(data), input.value, input.selectionStart ?? input.value.length);
  $('tagSuggestions').replaceChildren();
  $('tagSuggestions').hidden = !suggestions.length;
  if (suggestions.length) $('tagSuggestions').append(node('span', '', 'Tags existentes:'));
  suggestions.forEach(tag => $('tagSuggestions').append(button(tag, 'Agregar tag ' + tag, () => {
    const selected = insertTag(input.value, tag, input.selectionStart ?? input.value.length);
    input.value = selected.value;
    input.focus(); input.setSelectionRange(selected.caret, selected.caret);
    fillTagSuggestions();
  }, 'tag-suggestion')));
}
function fillAccessCategories(workspaceId, selectedId = '') {
  const categories = data.categories.filter(c => c.workspaceId === workspaceId);
  const options = categories.map(c => {
    const parent = categories.find(p => p.id === c.parentId);
    return new Option((parent ? parent.name + ' › ' : '') + c.name, c.id, false, c.id === selectedId);
  });
  if (!options.length) options.push(new Option('General (se creará al guardar)', '__new'));
  $('accessCategory').replaceChildren(...options);
}
function openAccessDialog(categoryId = '', access = null) {
  pasteGeneration++;
  imageBusy = false;
  const original = data.categories.find(c => c.id === categoryId);
  const workspaceId = original?.workspaceId || currentWorkspace().id;
  $('accessDialog').dataset.categoryId = categoryId;
  $('accessDialog').dataset.workspaceId = workspaceId;
  $('accessDialogTitle').textContent = access ? 'Editar acceso' : 'Nuevo acceso';
  $('accessId').value = access?.id || '';
  $('accessTitle').value = access?.title || '';
  $('accessUrl').value = access?.url || '';
  $('accessThumbnailUrl').value = access?.thumbnail?.startsWith('https:') ? access.thumbnail : '';
  $('accessTags').value = (access?.tags || []).join(', ');
  $('accessLocalOnly').checked = access?.localOnly === true;
  $('matchType').value = access?.matchType || 'document';
  const bookmarkState = $('bookmarkState');
  bookmarkState.hidden = !access?.bookmarkMissing;
  if (access?.bookmarkMissing) bookmarkState.textContent = '⚠ Ya no está en Favoritos de Chrome. Se conserva en NEX.B.';
  $('accessWorkspace').replaceChildren(...data.workspaces.map(w => new Option(w.name, w.id, false, w.id === workspaceId)));
  fillAccessCategories(workspaceId, categoryId);
  $('accessTags').setSelectionRange($('accessTags').value.length, $('accessTags').value.length);
  fillTagSuggestions();
  pastedImage = access?.thumbnail || '';
  showPreview();
  openDialog('accessDialog');
}
function showPreview() {
  $('preview').hidden = !pastedImage;
  imageView.set($('preview'), pastedImage);
  $('pasteBox').textContent = pastedImage ? 'Miniatura lista · haz clic y pega otra para reemplazarla' : 'Haz clic aquí y pega una captura (⌘V / Ctrl+V)';
}
async function renameCategory(category) {
  const name = prompt('Nombre de la categoría', category.name)?.trim();
  if (!name) return;
  const candidate = structuredClone(data);
  candidate.categories.find(c => c.id === category.id).name = name;
  await commit(candidate);
}
function hideCardMenu() { $('cardMenu').hidden = true; }
function openMoveSectionDialog(category) {
  const destinations = data.workspaces.filter(w => w.id !== category.workspaceId);
  $('moveSectionDialog').dataset.sectionId = category.id;
  const children = data.categories.filter(c => c.parentId === category.id);
  const count = category.accesses.length + children.reduce((sum, c) => sum + c.accesses.length, 0);
  $('moveSectionSummary').textContent = 'Se moverá “' + category.name + '” con ' + count + ' accesos y ' + children.length + ' subcategorías.' +
    (category.parentId ? ' Quedará como sección principal en el destino.' : '') +
    (!destinations.length ? ' Primero crea otro Workspace con + Workspace.' : '');
  $('moveSectionWorkspace').replaceChildren(...destinations.map(w => new Option(w.name, w.id)));
  $('moveSectionSubmit').disabled = !destinations.length;
  openDialog('moveSectionDialog');
}
function openRecaptureDialog(access) {
  $('recaptureDialog').dataset.accessId = access.id;
  $('recaptureSummary').textContent = 'Preparar una nueva miniatura para “' + access.title + '”.';
  openDialog('recaptureDialog');
}
function tabLabel(tab) {
  return (tab.title && tab.title.trim()) || tab.url || tab.pendingUrl || 'Pestaña sin título';
}
// Issue #27: en el inventario el nombre se muestra recortado a 30 caracteres; el nombre
// completo queda en el atributo title (tooltip y texto accesible) y en la búsqueda.
const INVENTORY_TITLE_MAX = 30;
function shortInventoryTitle(text) {
  const full = String(text || '').trim() || 'Pestaña sin título';
  const characters = Array.from(full);
  if (characters.length <= INVENTORY_TITLE_MAX) return full;
  return characters.slice(0, INVENTORY_TITLE_MAX - 1).join('').trimEnd() + '…';
}
function inventoryBoxes() {
  return [...$('inventoryList').querySelectorAll('input[type=checkbox]')];
}
async function currentInventorySelection(fallbackVisible = false) {
  const visible = inventoryBoxes().filter(box => !box.closest('.inventory-row').hidden);
  const checked = visible.filter(box => box.checked);
  const selected = (checked.length || !fallbackVisible ? checked : visible).flatMap(inventorySelectionEntries);
  const expected = new Map(selected.map(entry => [entry.id, entry.url]));
  return (await chrome.tabs.query({})).filter(tab => expected.has(tab.id) && !tab.pendingUrl && expected.get(tab.id) === tab.url);
}
function fillInventoryCategories(workspaceId, selectedId = '') {
  const categories = data.categories.filter(c => c.workspaceId === workspaceId);
  const options = categories.map(c => {
    const parent = categories.find(p => p.id === c.parentId);
    return new Option((parent ? parent.name + ' › ' : '') + c.name, c.id, false, c.id === selectedId);
  });
  if (!options.length) options.push(new Option('General (se creará al guardar)', '__new'));
  $('inventoryCategory').replaceChildren(...options);
}
// Índice clave de documento → acceso guardado, construido una vez por refresco: antes cada
// grupo de repetidas recorría (y analizaba la URL de) toda la biblioteca.
function savedAccessIndex() {
  const index = new Map();
  for (const category of data.categories) for (const access of category.accesses) {
    const key = tabKey(access.url);
    if (key && !index.has(key)) index.set(key, access);
  }
  return index;
}
function inventoryThumbnail(access) {
  const thumbnail = node('span', 'inventory-thumbnail');
  const placeholder = node('span', 'inventory-thumbnail-placeholder', '◌');
  thumbnail.append(placeholder);
  if (!access?.thumbnail) return thumbnail;
  const image = node('img', 'inventory-thumbnail-image');
  imageView.set(image, access.thumbnail);
  image.alt = '';
  image.loading = 'lazy';
  image.decoding = 'async';
  image.referrerPolicy = 'no-referrer';
  image.onerror = () => image.replaceWith(placeholder);
  thumbnail.replaceChildren(image);
  return thumbnail;
}
function inventorySelectionEntries(box) {
  if (box.dataset.tabIds) {
    const ids = JSON.parse(box.dataset.tabIds);
    const urls = JSON.parse(box.dataset.tabUrls || '[]');
    return ids.map((id, index) => ({ id, url: urls[index] || '' }));
  }
  return [{ id: Number(box.dataset.tabId), url: box.dataset.url || '' }];
}
async function refreshInventory() {
  const tabs = (await chrome.tabs.query({})).filter(tab => tabKey(tab.url || tab.pendingUrl || ''));
  const groups = duplicateTabGroups(tabs);
  const duplicateIds = new Set(groups.flatMap(group => [group.keep, ...group.duplicates].map(tab => tab.id)));
  const list = $('inventoryList');
  const fragment = document.createDocumentFragment();
  const saved = groups.length ? savedAccessIndex() : new Map();
  for (const group of groups) {
    const access = saved.get(group.key) || null;
    const total = group.duplicates.length + 1;
    const fullTitle = access?.title || tabLabel(group.keep);
    const title = shortInventoryTitle(fullTitle);
    const row = node('div', 'inventory-row inventory-group-row');
    const checkbox = node('input');
    checkbox.type = 'checkbox';
    checkbox.setAttribute('aria-label', 'Seleccionar copias repetidas de ' + fullTitle);
    checkbox.dataset.tabIds = JSON.stringify(group.duplicates.map(tab => tab.id));
    checkbox.dataset.tabUrls = JSON.stringify(group.duplicates.map(tab => tab.url));
    checkbox.dataset.search = (fullTitle + ' ' + group.keep.url).toLowerCase();
    const open = node('button', 'inventory-group-open');
    open.type = 'button';
    open.title = 'Abrir repetidas y preparar cierre pasivo';
    open.setAttribute('aria-label', 'Ver ' + total + ' pestañas repetidas de ' + fullTitle);
    open.onclick = () => run(async () => {
      selectInventoryTab('dup');
      await refreshDuplicates(group.key);
      $('inventoryDupClose').focus();
    });
    const info = node('span', 'inventory-row-info');
    info.title = group.keep.url;
    const heading = node('span', 'inventory-row-title', title + ' (' + total + ')');
    heading.title = fullTitle;
    info.append(heading);
    info.append(node('small', 'inventory-group-meta', group.duplicates.length + (group.duplicates.length === 1 ? ' copia cerrable' : ' copias cerrables')));
    open.append(inventoryThumbnail(access), info);
    row.append(checkbox, open);
    fragment.append(row);
  }
  for (const tab of tabs.filter(item => !duplicateIds.has(item.id))) {
    const url = tab.url || tab.pendingUrl || '';
    const fullTitle = tabLabel(tab);
    const row = node('label', 'inventory-row');
    row.title = url;
    const checkbox = node('input'); checkbox.type = 'checkbox';
    checkbox.dataset.tabId = String(tab.id);
    checkbox.dataset.url = url;
    checkbox.dataset.title = tab.title || '';
    checkbox.setAttribute('aria-label', fullTitle);
    checkbox.dataset.search = (fullTitle + ' ' + url).toLowerCase();
    const info = node('span', 'inventory-row-info');
    info.title = url;
    const heading = node('span', 'inventory-row-title', shortInventoryTitle(fullTitle));
    heading.title = fullTitle;
    info.append(heading);
    if (tab.discarded) info.append(node('small', 'inventory-group-meta', 'En reposo · recarga al abrir'));
    row.append(checkbox, info);
    fragment.append(row);
  }
  list.replaceChildren(fragment);
  const windows = new Set(tabs.map(tab => tab.windowId)).size;
  $('inventoryList').dataset.total = String(tabs.length);
  $('inventoryList').dataset.windows = String(windows);
  $('inventoryList').dataset.duplicates = String(duplicateIds.size);
  filterInventory();
}
function filterInventory() {
  const query = $('inventorySearch').value.trim().toLowerCase();
  const rows = [...$('inventoryList').querySelectorAll('.inventory-row')];
  let visible = 0;
  for (const row of rows) {
    const box = row.querySelector('input[type=checkbox]');
    const match = !query || (box.dataset.search || '').includes(query);
    row.hidden = !match;
    if (!match) box.checked = false;
    if (match) visible++;
  }
  const total = Number($('inventoryList').dataset.total || 0);
  const windows = Number($('inventoryList').dataset.windows || 0);
  const duplicates = Number($('inventoryList').dataset.duplicates || 0);
  if (!total) { $('inventorySummary').textContent = 'No hay pestañas web abiertas para inventariar.'; return; }
  const base = total + (total === 1 ? ' pestaña web' : ' pestañas web') + ' en ' + windows + (windows === 1 ? ' ventana' : ' ventanas') + (duplicates ? ' · ' + duplicates + ' repetidas' : ' · sin repetidas');
  $('inventorySummary').textContent = query ? base + ' · ' + visible + ' coinciden con «' + query + '»' : base;
}
function buildWindowLabels(tabs) {
  const ids = [...new Set(tabs.map(tab => tab.windowId))].sort((a, b) => a - b);
  return new Map(ids.map((id, index) => [id, 'Ventana ' + (index + 1)]));
}
function fillWorkspaceSelect(workspaceSelectId, categorySelectId, categoryFiller) {
  const workspaceId = currentWorkspace().id;
  $(workspaceSelectId).replaceChildren(...data.workspaces.map(w => new Option(w.name, w.id, false, w.id === workspaceId)));
  categoryFiller(workspaceId);
}
async function openInventoryDialog() {
  fillWorkspaceSelect('inventoryWorkspace', 'inventoryCategory', id => fillInventoryCategories(id));
  fillWorkspaceSelect('inventoryDupWorkspace', 'inventoryDupCategory', id => fillDupCategories(id));
  $('inventorySearch').value = '';
  selectInventoryTab('all');
  await refreshInventory();
  openDialog('inventoryDialog');
}
const INVENTORY_VIEWS = { all: ['inventoryAllTab', 'inventoryAllPanel'], dup: ['inventoryDupTab', 'inventoryDupPanel'], group: ['inventoryGroupTab', 'inventoryGroupPanel'] };
function selectInventoryTab(tab) {
  for (const [name, [tabId, panelId]] of Object.entries(INVENTORY_VIEWS)) {
    const active = name === tab;
    $(panelId).hidden = !active;
    $(tabId).setAttribute('aria-selected', String(active));
    $(tabId).tabIndex = active ? 0 : -1;
  }
}
// Agrupar: propone grupos nativos de Chrome por etiqueta automática o dominio.
let groupProposals = [];
async function groupingContext() {
  const [tabs, existingGroups, current] = await Promise.all([
    chrome.tabs.query({ windowType: 'normal' }),
    chrome.tabGroups.query({}),
    chrome.windows.getCurrent()
  ]);
  return { tabs, existingGroups, current };
}
async function refreshGroupProposals() {
  const { tabs, existingGroups, current } = await groupingContext();
  const gather = $('inventoryGroupGather').checked;
  groupProposals = proposeTabGroups(tabs, data.autoTagRules, {
    existingGroups, targetWindowId: gather ? current.id : null, extensionOrigin: chrome.runtime.getURL('')
  });
  const labels = buildWindowLabels(tabs);
  const fragment = document.createDocumentFragment();
  groupProposals.forEach((proposal, index) => {
    const row = node('div', 'inventory-row group-proposal');
    row.dataset.index = String(index);
    const checkbox = node('input'); checkbox.type = 'checkbox'; checkbox.checked = true;
    checkbox.setAttribute('aria-label', 'Incluir el grupo ' + proposal.title);
    const swatch = node('span', 'group-swatch group-color-' + proposal.color);
    swatch.setAttribute('aria-hidden', 'true');
    const info = node('span', 'inventory-row-info');
    const name = node('input', 'group-name'); name.type = 'text'; name.value = proposal.title; name.maxLength = 80;
    name.setAttribute('aria-label', 'Nombre del grupo (' + proposal.tabIds.length + ' pestañas)');
    name.onkeydown = event => { if (event.key === 'Enter') event.preventDefault(); };
    const count = proposal.tabIds.length + (proposal.tabIds.length === 1 ? ' pestaña' : ' pestañas');
    const where = gather ? 'esta ventana' : (labels.get(proposal.windowId) || 'Ventana ?');
    const state = proposal.existingGroupId !== null ? ' · se añade al grupo existente' : ' · grupo nuevo';
    info.append(name, node('small', 'inventory-row-url', count + ' · ' + where + state));
    row.append(checkbox, swatch, info);
    fragment.append(row);
  });
  $('inventoryGroupList').replaceChildren(fragment);
  const total = groupProposals.reduce((sum, proposal) => sum + proposal.tabIds.length, 0);
  $('inventoryGroupSummary').textContent = groupProposals.length
    ? groupProposals.length + (groupProposals.length === 1 ? ' grupo propuesto' : ' grupos propuestos') + ' con ' + total + ' pestañas, según los tags automáticos por URL o el dominio. Puedes renombrarlos antes de agrupar.'
    : 'No hay pestañas que agrupar: hacen falta al menos 2 pestañas web (no fijadas) del mismo sitio, o ya están agrupadas.';
}
function toggleGroupProposals() {
  const boxes = [...$('inventoryGroupList').querySelectorAll('input[type=checkbox]')];
  const allChecked = boxes.length > 0 && boxes.every(box => box.checked);
  boxes.forEach(box => { box.checked = !allChecked; });
}
async function applyGrouping(all = false) {
  const chosen = [...$('inventoryGroupList').querySelectorAll('.group-proposal')]
    .filter(row => all || row.querySelector('input[type=checkbox]').checked)
    .map(row => ({ ...groupProposals[Number(row.dataset.index)], title: row.querySelector('.group-name').value.trim() }))
    .filter(proposal => proposal.tabIds);
  if (!chosen.length) { showMessage('Marca al menos un grupo para agrupar.', true); return; }
  if (chosen.some(proposal => !proposal.title)) { showMessage('Escribe un nombre para cada grupo marcado.', true); return; }
  const { tabs, current } = await groupingContext();
  const alive = new Map(tabs.filter(tab => !tab.pinned).map(tab => [tab.id, tab]));
  for (const proposal of chosen) proposal.tabIds = proposal.tabIds.filter(id => alive.has(id));
  if ($('inventoryGroupGather').checked) {
    const away = chosen.flatMap(proposal => proposal.tabIds).filter(id => alive.get(id).windowId !== current.id);
    if (away.length) await chrome.tabs.move(away, { windowId: current.id, index: -1 });
    for (const proposal of chosen) proposal.windowId = current.id;
  }
  const existingGroups = await chrome.tabGroups.query({});
  const result = { created: 0, reused: 0, tabs: 0 };
  let failed = 0;
  for (const action of planGroupActions(chosen, existingGroups)) {
    try {
      if (action.groupId !== null) {
        await chrome.tabs.group({ groupId: action.groupId, tabIds: action.tabIds });
        result.reused++;
      } else {
        const groupId = await chrome.tabs.group({ tabIds: action.tabIds, createProperties: { windowId: action.windowId } });
        await chrome.tabGroups.update(groupId, { title: action.title, color: action.color });
        result.created++;
      }
      result.tabs += action.tabIds.length;
    } catch { failed++; }
  }
  await refreshGroupProposals();
  await refreshInventory();
  showMessage(groupingSummary(result) + (failed ? ' ' + failed + (failed === 1 ? ' grupo no se pudo crear.' : ' grupos no se pudieron crear.') : ''), failed > 0 && !result.tabs);
}
function fillDupCategories(workspaceId, selectedId = '') {
  const categories = data.categories.filter(c => c.workspaceId === workspaceId);
  const options = categories.map(c => {
    const parent = categories.find(p => p.id === c.parentId);
    return new Option((parent ? parent.name + ' › ' : '') + c.name, c.id, false, c.id === selectedId);
  });
  if (!options.length) options.push(new Option('General (se creará al guardar)', '__new'));
  $('inventoryDupCategory').replaceChildren(...options);
}
function selectedDupKeys() {
  return [...$('inventoryDupList').querySelectorAll('input[type=checkbox]:checked')].map(box => box.dataset.key);
}
async function selectedDupGroups() {
  const keys = new Set(selectedDupKeys());
  const webTabs = (await chrome.tabs.query({})).filter(tab => tabKey(tab.url || tab.pendingUrl || ''));
  return duplicateTabGroups(webTabs).filter(group => keys.has(group.key));
}
async function refreshDuplicates(onlyKey = '') {
  const allTabs = await chrome.tabs.query({});
  const webTabs = allTabs.filter(tab => tabKey(tab.url || tab.pendingUrl || ''));
  const groups = duplicateTabGroups(webTabs).filter(group => !onlyKey || group.key === onlyKey);
  const labels = buildWindowLabels(allTabs);
  const list = $('inventoryDupList'); list.replaceChildren();
  $('inventoryDupSummary').textContent = groups.length
    ? groups.length + (groups.length === 1 ? ' documento repetido.' : ' documentos repetidos.') + ' Marca los grupos y elige una acción.'
    : 'No hay pestañas repetidas.';
  for (const group of groups) {
    const section = node('div', 'dup-group');
    const head = node('label', 'dup-group-head');
    const checkbox = node('input'); checkbox.type = 'checkbox'; checkbox.checked = true;
    checkbox.dataset.key = group.key;
    checkbox.dataset.tabIds = JSON.stringify([group.keep, ...group.duplicates].map(tab => tab.id));
    const fullTitle = tabLabel(group.keep);
    checkbox.setAttribute('aria-label', fullTitle);
    const title = node('span', 'inventory-row-title', shortInventoryTitle(fullTitle)); title.title = fullTitle;
    head.append(checkbox, title);
    section.append(head);
    for (const tab of [group.keep, ...group.duplicates]) {
      const location = (labels.get(tab.windowId) || 'Ventana ?') + ' · posición ' + ((tab.index ?? 0) + 1);
      section.append(node('p', 'dup-copy', location + (tab === group.keep ? ' — se conserva' : '')));
    }
    list.append(section);
  }
}
async function passiveCloseDuplicates() {
  const shown = new Map([...$('inventoryDupList').querySelectorAll('input:checked')].map(box => [box.dataset.key, new Set(JSON.parse(box.dataset.tabIds))]));
  const groups = await selectedDupGroups();
  if (!groups.length) { showMessage('Selecciona al menos un grupo repetido.', true); return; }
  const ids = groups.flatMap(group => group.duplicates.filter(tab => shown.get(group.key)?.has(tab.id) && !tab.pendingUrl && !tab.pinned && !tab.audible).map(tab => tab.id)).filter(Number.isInteger);
  if (!ids.length) { showMessage('No hay copias para cerrar.', true); return; }
  await chrome.tabs.remove(ids);
  await refreshDuplicates(); await refreshInventory();
  showMessage('Cierre pasivo: se cerraron ' + ids.length + (ids.length === 1 ? ' copia' : ' copias') + ' y se conservó 1 de cada grupo.');
}
async function gatherDuplicates() {
  const groups = await selectedDupGroups();
  if (!groups.length) { showMessage('Selecciona al menos un grupo repetido.', true); return; }
  const ids = groups.flatMap(group => [group.keep, ...group.duplicates].map(tab => tab.id)).filter(Number.isInteger);
  const current = await chrome.windows.getCurrent();
  await chrome.tabs.move(ids, { windowId: current.id, index: -1 });
  await refreshDuplicates();
  showMessage('Se reunieron ' + ids.length + ' pestañas repetidas en esta ventana.');
}
async function registerDuplicates() {
  const groups = await selectedDupGroups();
  if (!groups.length) { showMessage('Selecciona al menos un grupo repetido.', true); return; }
  const workspaceId = $('inventoryDupWorkspace').value, categoryId = $('inventoryDupCategory').value;
  const candidate = structuredClone(data);
  let added = 0, skipped = 0;
  for (const group of groups) {
    let url; try { url = accessUrl(group.keep.url); } catch { skipped++; continue; }
    if (candidate.categories.some(c => c.workspaceId === workspaceId && c.accesses.some(a => tabKey(a.url) === tabKey(url)))) { skipped++; continue; }
    const title = (group.keep.title || '').trim().slice(0, 300) || url;
    try { placeAccess(candidate, { id: uid('access'), title, url, tags: [], matchType: 'document', thumbnail: '' }, { sourceCategoryId: '', workspaceId, categoryId }, uid); added++; }
    catch { skipped++; }
  }
  if (!added) { showMessage('No se pudo registrar ninguna; revisa las URLs.', true); return; }
  await commit(candidate);
  const name = data.workspaces.find(w => w.id === workspaceId)?.name || '';
  showMessage('Se registraron ' + added + (added === 1 ? ' acceso' : ' accesos') + (name ? ' en ' + name : '') + (skipped ? '; ' + skipped + ' se omitieron.' : '.'));
}
function toggleSelectAllInventory() {
  const boxes = inventoryBoxes().filter(box => !box.closest('.inventory-row').hidden);
  const allChecked = boxes.length > 0 && boxes.every(box => box.checked);
  boxes.forEach(box => { box.checked = !allChecked; });
}
async function consolidateInventory() {
  const ids = (await currentInventorySelection(true)).map(tab => tab.id);
  if (ids.length < 2) { showMessage('Elige al menos dos pestañas (o quita el filtro) para reunirlas.', true); return; }
  const current = await chrome.windows.getCurrent();
  await chrome.tabs.move(ids, { windowId: current.id, index: -1 });
  await refreshInventory();
  showMessage('Se reunieron ' + ids.length + ' pestañas visibles en esta ventana.');
}
async function releaseInventoryMemory() {
  const selected = await currentInventorySelection();
  if (!selected.length) { showMessage('Selecciona las pestañas cuya memoria quieres liberar.'); return; }
  if (!confirm('Las pestañas seleccionadas se recargarán al volver a ellas. Guarda antes formularios, editores y llamadas; nex.b no puede detectar todo el trabajo sin guardar. Se omiten activas, fijadas, con audio y dominios excluidos. ¿Continuar?')) return;
  const settings = await chrome.storage.local.get('nexbMemoryExcludedHosts');
  const result = await discardSelected(selected, chrome.tabs, settings.nexbMemoryExcludedHosts || []);
  await refreshInventory();
  showMessage(result.discarded + ' pestañas en reposo; ' + result.skipped + ' protegidas u omitidas; ' + result.failed + ' no se pudieron descargar. No se han cerrado.');
}
async function closeSelectedInventory() {
  const ids = (await currentInventorySelection()).map(tab => tab.id);
  if (!ids.length) { showMessage('Selecciona al menos una pestaña para cerrar.', true); return; }
  await chrome.tabs.remove(ids);
  await refreshInventory();
  showMessage(ids.length === 1 ? 'Se cerró 1 pestaña.' : 'Se cerraron ' + ids.length + ' pestañas.');
}
async function addSelectedToCategory() {
  const tabs = await currentInventorySelection();
  if (!tabs.length) { showMessage('Selecciona al menos una pestaña.', true); return; }
  const workspaceId = $('inventoryWorkspace').value, categoryId = $('inventoryCategory').value;
  const candidate = structuredClone(data);
  let added = 0, skipped = 0;
  for (const tab of tabs) {
    let url; try { url = accessUrl(tab.url); } catch { skipped++; continue; }
    if (candidate.categories.some(c => c.workspaceId === workspaceId && c.accesses.some(a => tabKey(a.url) === tabKey(url)))) { skipped++; continue; }
    const title = (tab.title || '').trim().slice(0, 300) || url;
    try { placeAccess(candidate, { id: uid('access'), title, url, tags: [], matchType: 'document', thumbnail: '' }, { sourceCategoryId: '', workspaceId, categoryId }, uid); added++; }
    catch { skipped++; }
  }
  if (!added) { showMessage('No se pudo agregar ninguna pestaña; revisa las URLs.', true); return; }
  await commit(candidate);
  const name = data.workspaces.find(w => w.id === workspaceId)?.name || '';
  showMessage('Se agregaron ' + added + (added === 1 ? ' acceso' : ' accesos') + (name ? ' a ' + name : '') + (skipped ? '; ' + skipped + ' se omitieron.' : '.'));
}
function showCardMenu(event, access, categoryId) {
  const menu = $('cardMenu'); menu.hidden = false;
  menu.style.left = Math.max(0, Math.min(event.clientX, innerWidth - 190)) + 'px';
  menu.style.top = Math.max(0, Math.min(event.clientY, innerHeight - 190)) + 'px';
  menu.querySelector('[data-card-action="capture"]').onclick = () => run(() => { hideCardMenu(); openRecaptureDialog(access); });
  menu.querySelector('[data-card-action="paste"]').onclick = () => run(async () => {
    hideCardMenu();
    openAccessDialog(categoryId, access);
    await pasteClipboardImage();
  });
  menu.querySelector('[data-card-action="upload"]').onclick = () => run(() => {
    hideCardMenu();
    openAccessDialog(categoryId, access);
    $('thumbnailFileInput').click();
  });
  menu.querySelector('[data-card-action="edit"]').onclick = () => run(() => { hideCardMenu(); openAccessDialog(categoryId, access); });
  menu.querySelector('[data-card-action="move"]').onclick = () => run(() => {
    hideCardMenu(); openAccessDialog(categoryId, access); $('accessWorkspace').focus();
    showMessage('Elige el Workspace y la categoría de destino; el acceso se moverá al guardar.');
  });
  menu.querySelector('[data-card-action="copy"]').onclick = () => run(async () => { hideCardMenu(); await navigator.clipboard.writeText(access.url); showMessage('URL copiada.'); });
  menu.querySelector('[data-card-action="remove"]').onclick = () => run(async () => {
    hideCardMenu();
    if (!confirm('¿Remover "' + access.title + '"?')) return;
    const candidate = structuredClone(data);
    const category = candidate.categories.find(c => c.id === categoryId);
    category.accesses = category.accesses.filter(a => a.id !== access.id);
    await commit(candidate);
  });
}
async function pasteClipboardImage() {
  if (!navigator.clipboard?.read) throw new Error('Chrome no permite leer imágenes del portapapeles. Usa Ctrl/⌘V dentro del editor.');
  const permission = await chrome.permissions.request({ permissions: ['clipboardRead'] });
  if (!permission) throw new Error('Permiso no concedido. Puedes pegar con Ctrl/⌘V dentro del editor.');
  const generation = ++pasteGeneration;
  imageBusy = true;
  try {
    const items = await navigator.clipboard.read();
    const item = items.find(entry => entry.types.some(type => type.startsWith('image/')));
    if (!item) throw new Error('El portapapeles no contiene una imagen.');
    const type = item.types.find(value => value.startsWith('image/'));
    const image = await resizeImage(await item.getType(type));
    if (generation !== pasteGeneration || !$('accessDialog').open) return;
    pastedImage = image;
    $('accessThumbnailUrl').value = '';
    showPreview();
    showMessage('Miniatura lista para guardar.');
  } finally {
    if (generation === pasteGeneration) imageBusy = false;
  }
}

async function captureBatchThumbnail(tab) {
  const dataUrl = await captureStableTab(chrome.tabs, tab);
  const encoded = dataUrl.split(',')[1];
  if (!encoded) throw new Error('Chrome no devolvió una imagen.');
  const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
  const thumbnail = await resizeImage(new Blob([bytes], { type: 'image/jpeg' }));
  if (thumbnail.length > 700000) throw new Error('La captura supera el límite permitido.');
  return thumbnail;
}
async function captureAllImages() {
  if (captureBusy) { showMessage('Ya hay una captura masiva en curso.'); return; }
  const allAccesses = data.categories.flatMap(category => category.accesses);
  const targets = allAccesses.filter(access => !access.thumbnail && /^https?:/i.test(access.url));
  const localMissing = allAccesses.filter(access => !access.thumbnail && access.url.startsWith('file:')).length;
  if (!targets.length) {
    showMessage(localMissing ? 'No hay páginas web pendientes. Los accesos file:// requieren una captura manual.' : 'Todos los accesos web ya tienen miniatura.');
    return;
  }
  if (!confirm('Se capturarán ' + targets.length + ' páginas visibles. Chrome cambiará de pestaña y las capturas pueden incluir información privada. ¿Continuar?')) return;
  if (!await chrome.permissions.request({ origins: ['<all_urls>'] })) throw new Error('La captura masiva necesita permiso para capturar las páginas. Puedes seguir pegando imágenes manualmente.');
  captureBusy = true;
  captureCancelled = false;
  $('cancelCapture').hidden = false;
  const batch = createBatchCommitter({ load: () => data, save: candidate => commit(candidate) });
  const [origin] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  let temporary;
  let captured = 0;
  let failed = 0;
  let cancelled = false;
  const failures = [];
  try {
    temporary = await chrome.tabs.create({ url: 'about:blank', active: true, ...(origin?.windowId ? { windowId: origin.windowId } : {}) });
    for (const [index, access] of targets.entries()) {
      if (captureCancelled) { cancelled = true; break; }
      try {
        showMessage('Capturando ' + (index + 1) + ' de ' + targets.length + ': ' + access.title);
        const target = accessUrl(access.url);
        const loaded = await waitForCaptureTab(chrome.tabs, temporary.id, target, {
          navigate: () => chrome.tabs.update(temporary.id, { url: target, active: true })
        });
        if (!/^https?:/i.test(loaded.url || '')) throw new Error('La página no terminó en una URL web.');
        await delay(CAPTURE_PAINT_DELAY_MS);
        await captureThrottle();
        const thumbnail = await captureBatchThumbnail(loaded);
        await batch.add(access.id, thumbnail);
        captured++;
      } catch {
        failed++;
      }
    }
    cancelled = cancelled || captureCancelled;
  } finally {
    await batch.flush().catch(() => {});
    if (temporary?.id !== undefined) await chrome.tabs.remove(temporary.id).catch(() => {});
    if (origin?.id !== undefined) {
      await chrome.tabs.update(origin.id, { active: true }).catch(() => {});
      if (Number.isInteger(origin.windowId) && chrome.windows?.update) await chrome.windows.update(origin.windowId, { focused: true }).catch(() => {});
    }
    $('cancelCapture').hidden = true;
    captureBusy = false;
  }
  const errors = failed ? ' ' + failed + (failed === 1 ? ' no se pudo capturar.' : ' no se pudieron capturar.') : '';
  const local = localMissing ? ' ' + localMissing + (localMissing === 1 ? ' acceso local requiere captura manual.' : ' accesos locales requieren captura manual.') : '';
  const stopped = cancelled ? ' Captura cancelada; se detuvo tras la página actual.' : '';
  showMessage('Se capturaron ' + captured + ' de ' + targets.length + ' miniaturas.' + errors + local + stopped);
}

function onClick(id, action) { $(id).onclick = () => run(async () => {
  const button = $(id);
  if (button.disabled) return;
  button.disabled = true;
  try { await action(); } finally { button.disabled = false; }
}); }
function onSubmit(id, action) {
  $(id).onsubmit = event => { event.preventDefault(); run(action); };
}
async function clearPending() {
  if (!pendingKey) return;
  const key = pendingKey;
  if (key === 'pendingAccess') await chrome.storage.local.remove(key);
  else await chrome.storage.session.remove(key);
  pendingKey = '';
  history.replaceState(null, '', location.pathname);
}
document.querySelectorAll('dialog').forEach(dialog => {
  const feedback = node('p', 'feedback'); feedback.hidden = true; feedback.setAttribute('role', 'status');
  dialog.querySelector('h2').after(feedback);
  dialog.setAttribute('aria-label', dialog.querySelector('h2').textContent);
  dialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
  dialog.addEventListener('close', () => {
    if (dialog.id === 'inventoryDialog') { imageView.clear($('inventoryList')); $('inventoryList').replaceChildren(); $('inventoryDupList').replaceChildren(); $('inventoryGroupList').replaceChildren(); }
    if (dialog.id === 'accessDialog') { pasteGeneration++; imageBusy = false; pastedImage = ''; showPreview(); run(clearPending); }
    if (reloadPending) run(reload);
    if (syncEnabled) scheduleSync();
  });
});
document.querySelectorAll('[data-cancel]').forEach(b => {
  b.onclick = () => { if (!saving) b.closest('dialog').close(); };
});
document.addEventListener('click', event => {
  hideCardMenu();
  if (!event.target.closest('.top-actions')) {
    $('thumbnailSizeMenu').hidden = true;
    closeMainMenu();
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') { hideCardMenu(); closeMainMenu(true); } });
onClick('mainMenuToggle', () => {
  const menu = $('mainMenu');
  const open = menu.hidden;
  menu.hidden = !open;
  $('mainMenuToggle').setAttribute('aria-expanded', String(open));
  if (open) menu.querySelector('button')?.focus();
});
const MAIN_MENU_TARGETS = { edit: 'editWorkspace', new: 'newWorkspace', thumbnail: 'thumbnailSizeToggle', inventory: 'openInventory', settings: 'openSettings', tags: 'tagRules' };
document.querySelectorAll('[data-main-action]').forEach(item => {
  item.onclick = () => run(async () => {
    const action = item.dataset.mainAction;
    closeMainMenu();
    if (action === 'titlesOnly') { await setTitlesOnly(!titlesOnly); return; }
    if (action === 'sync') {
      $('openSettings').click();
      $('settingsSyncTab').click();
      return;
    }
    const target = MAIN_MENU_TARGETS[action];
    if (target) $(target).click();
  });
});
document.querySelectorAll('[data-narrow-columns]').forEach(item => {
  item.onclick = () => run(async () => {
    closeMainMenu();
    await setNarrowColumns(Number(item.dataset.narrowColumns));
  });
});
narrowMedia.addEventListener('change', event => setNarrow(event.matches));
onClick('openInventory', openInventoryDialog);
onClick('inventoryAllTab', () => selectInventoryTab('all'));
onClick('inventoryDupTab', async () => { selectInventoryTab('dup'); await refreshDuplicates(); });
onClick('inventorySelectAll', toggleSelectAllInventory);
onClick('inventoryConsolidate', consolidateInventory);
onClick('inventoryAddToCategory', addSelectedToCategory);
onClick('inventoryCloseSelected', closeSelectedInventory);
onClick('inventoryReleaseMemory', releaseInventoryMemory);
onClick('inventoryDupRegister', registerDuplicates);
onClick('inventoryDupGather', gatherDuplicates);
onClick('inventoryDupClose', passiveCloseDuplicates);
onClick('inventoryGroupTab', async () => { selectInventoryTab('group'); await refreshGroupProposals(); });
onClick('inventoryGroupToggle', toggleGroupProposals);
onClick('inventoryGroupSelected', () => applyGrouping(false));
onClick('inventoryGroupAll', () => applyGrouping(true));
$('inventoryGroupGather').onchange = () => run(refreshGroupProposals);
onClick('captureAllImages', captureAllImages);
$('cancelCapture').onclick = () => { if (captureBusy) { captureCancelled = true; showMessage('Se cancelará al terminar la página actual.'); } };
$('inventorySearch').oninput = () => {
  // Apply visibility immediately so actions cannot target hidden results.
  filterInventory();
};
$('inventoryWorkspace').onchange = () => fillInventoryCategories($('inventoryWorkspace').value);
$('inventoryDupWorkspace').onchange = () => fillDupCategories($('inventoryDupWorkspace').value);
onClick('newWorkspace', () => { $('workspaceForm').reset(); openDialog('workspaceDialog'); });
onClick('editWorkspace', () => {
  const workspace = currentWorkspace();
  $('editWorkspaceDialog').dataset.workspaceId = workspace.id;
  $('editWorkspaceName').value = workspace.name;
  $('editWorkspaceKind').value = workspace.type;
  const onlyWorkspace = data.workspaces.length <= 1;
  $('deleteWorkspace').disabled = onlyWorkspace;
  $('deleteWorkspace').title = onlyWorkspace ? 'No puedes eliminar el último Workspace' : 'Eliminar este Workspace y sus datos';
  openDialog('editWorkspaceDialog');
});
onClick('deleteWorkspace', () => {
  const workspaceId = $('editWorkspaceDialog').dataset.workspaceId;
  $('deleteWorkspaceDialog').dataset.workspaceId = workspaceId;
  $('deleteWorkspaceSummary').textContent = workspaceDeletionSummary(data, workspaceId);
  $('editWorkspaceDialog').close();
  openDialog('deleteWorkspaceDialog');
});
onSubmit('deleteWorkspaceForm', async () => {
  const candidate = deleteWorkspace(data, $('deleteWorkspaceDialog').dataset.workspaceId, true);
  await commit(candidate);
  $('deleteWorkspaceDialog').close();
  showMessage('Workspace eliminado. Puedes restaurarlo desde Configuración → Datos.');
});
async function moveWorkspaceToPosition(sourceId, targetId, after) {
  if (sourceId === targetId) return;
  const candidate = structuredClone(data);
  const sourceIndex = candidate.workspaces.findIndex(workspace => workspace.id === sourceId);
  if (sourceIndex < 0 || !candidate.workspaces.some(workspace => workspace.id === targetId)) throw new Error('El Workspace ya no existe.');
  const [source] = candidate.workspaces.splice(sourceIndex, 1);
  const destinationIndex = candidate.workspaces.findIndex(workspace => workspace.id === targetId);
  candidate.workspaces.splice(destinationIndex + (after ? 1 : 0), 0, source);
  await commit(candidate);
}
onSubmit('editWorkspaceForm', async () => {
  const candidate = structuredClone(data);
  const workspace = candidate.workspaces.find(item => item.id === $('editWorkspaceDialog').dataset.workspaceId);
  if (!workspace) throw new Error('El Workspace ya no existe.');
  workspace.name = $('editWorkspaceName').value.trim();
  workspace.type = $('editWorkspaceKind').value;
  await commit(candidate); $('editWorkspaceDialog').close();
});
onClick('thumbnailSizeToggle', () => { $('thumbnailSizeMenu').hidden = !$('thumbnailSizeMenu').hidden; });
document.querySelectorAll('[data-thumbnail-size]').forEach(control => {
  control.onclick = () => run(async () => {
    const candidate = structuredClone(data);
    candidate.settings.thumbnailSize = control.dataset.thumbnailSize;
    candidate.settings.thumbnailHeight = thumbnailHeightForSize(control.dataset.thumbnailSize, candidate.settings.thumbnailHeight);
    await persistLocalThumbnailPreference(candidate.settings);
    applyLocalThumbnailPreference(); applySettings(); render(); $('thumbnailSizeMenu').hidden = true;
  });
});
async function saveCustomThumbnailHeight() {
  const height = Number($('thumbnailCustomHeight').value);
  if (!Number.isInteger(height) || height < 80 || height > 480) throw new Error('Escribe un alto entre 80 y 480 px.');
  const candidate = structuredClone(data);
  candidate.settings.thumbnailSize = 'custom';
  candidate.settings.thumbnailHeight = height;
  await persistLocalThumbnailPreference(candidate.settings);
  applyLocalThumbnailPreference(); applySettings(); render();
  $('thumbnailSizeMenu').hidden = true;
}
onClick('saveThumbnailCustom', saveCustomThumbnailHeight);
$('thumbnailHeightRange').oninput = () => {
  $('thumbnailCustomHeight').value = $('thumbnailHeightRange').value;
  $('thumbnailHeightValue').textContent = $('thumbnailHeightRange').value + ' px';
};
$('thumbnailHeightRange').onchange = () => run(saveCustomThumbnailHeight);
$('thumbnailCustomHeight').onchange = () => run(saveCustomThumbnailHeight);
onClick('newCategory', () => {
  $('categoryForm').reset();
  $('categoryParent').replaceChildren(new Option('Categoría principal', ''),
    ...currentCategories().filter(c => !c.parentId).map(c => new Option('Dentro de: ' + c.name, c.id)));
  openDialog('categoryDialog');
});
onClick('tagRules', () => { viewMode = viewMode === 'tags' ? 'workspace' : 'tags'; render(); });
onClick('searchToggle', () => {
  const input = $('accessSearch');
  if (!input.hidden && !input.value.trim()) { closeSearch(); return; }
  input.hidden = false;
  $('searchToggle').setAttribute('aria-expanded', 'true');
  input.focus();
});
$('accessSearch').oninput = () => {
  // Espera a que se deje de escribir para no redibujar en cada tecla.
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => setSearch($('accessSearch').value), 150);
};
$('accessSearch').onkeydown = event => {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeSearch(); $('searchToggle').focus(); }
};
onSubmit('moveSectionForm', async () => {
  const workspaceId = $('moveSectionWorkspace').value;
  await commit(moveSection(data, $('moveSectionDialog').dataset.sectionId, workspaceId));
  $('moveSectionDialog').close();
  showMessage('Sección movida a ' + data.workspaces.find(w => w.id === workspaceId).name + '.');
});
let recaptureBusy = false;
$('recaptureDialog').addEventListener('cancel', event => { if (recaptureBusy) event.preventDefault(); });
onSubmit('recaptureForm', async () => {
  if (recaptureBusy) return;
  const access = data.categories.flatMap(c => c.accesses).find(a => a.id === $('recaptureDialog').dataset.accessId);
  if (!access) throw new Error('El acceso ya no existe.');
  recaptureBusy = true;
  $('recaptureDialog').querySelectorAll('button').forEach(b => { b.disabled = true; });
  try {
    await prepareRecapture(access, chrome, navigator.locks);
    $('recaptureDialog').close();
    showMessage('Cuando el sitio esté listo: clic derecho → NEX.B → Actualizar captura del acceso. También puedes pulsar NEX.B desde Extensiones (puzle) de Chrome.');
  } finally {
    recaptureBusy = false;
    $('recaptureDialog').querySelectorAll('button').forEach(b => { b.disabled = false; });
  }
});
const GITHUB_ARCHIVE_URL = UPDATE_COMMAND;
async function copyUpdateCommand() {
  try { await navigator.clipboard.writeText(UPDATE_COMMAND); showMessage('Enlace de versiones copiado. Descarga una versión publicada y revisa sus notas.'); }
  catch { showMessage('Versiones publicadas: ' + UPDATE_COMMAND); }
}
// Para una extensión descomprimida, reload() vuelve a leer la carpeta del disco.
const reloadExtension = () => chrome.runtime.reload();
onClick('copyUpdateCommand', copyUpdateCommand);
onClick('bannerCopyUpdate', copyUpdateCommand);
onClick('reloadExtension', reloadExtension);
onClick('bannerReload', reloadExtension);
onClick('bannerDismiss', () => { $('updateBanner').hidden = true; sessionStorage.setItem('nexbUpdateDismissed', '1'); });
onClick('dialogCopyUpdate', copyUpdateCommand);
onClick('dialogReload', reloadExtension);
async function snoozeUpdate() {
  const version = $('updateDialog').dataset.version;
  $('updateDialog').close();
  await chrome.storage.local.set({ [UPDATE_SNOOZE_KEY]: { version, until: Date.now() + UPDATE_SNOOZE_MS } });
}
onClick('updateLater', snoozeUpdate);
// Esc equivale a «Recordármelo mañana».
$('updateDialog').addEventListener('cancel', event => { event.preventDefault(); run(snoozeUpdate); });
async function showAvailableUpdate(current) {
  const latest = await checkForUpdate(current, { storage: chrome.storage.local });
  if (!latest) return;
  $('updateAvailable').textContent = ' · disponible: ' + latest;
  if (!sessionStorage.getItem('nexbUpdateDismissed')) {
    $('updateBannerText').textContent = 'Hay una versión nueva de nex.b (' + latest + '). Revisa la versión publicada, guarda un ZIP y actualiza la carpeta de la extensión.';
    $('updateBanner').hidden = false;
  }
  const snooze = (await chrome.storage.local.get(UPDATE_SNOOZE_KEY))[UPDATE_SNOOZE_KEY];
  // No interrumpe un formulario abierto (p. ej. un acceso pendiente de guardar).
  if (!shouldShowUpdateDialog(latest, snooze) || document.querySelector('dialog[open]')) return;
  const dialog = $('updateDialog');
  dialog.dataset.version = latest;
  $('updateDialogVersions').textContent = 'Tienes la ' + current + ' y ya está disponible la ' + latest + '.';
  $('updateDialogCommand').textContent = UPDATE_COMMAND;
  dialog.querySelector('.feedback').hidden = true;
  dialog.showModal();
}
onClick('openUpdate', async () => {
  await chrome.tabs.create({ url: GITHUB_ARCHIVE_URL });
  showMessage('Se abrió la página de versiones. Guarda un respaldo ZIP, descarga la versión elegida y reemplaza los archivos antes de recargar nex.b.');
});
onClick('openLocalSettings', () => chrome.tabs.create({ url: 'chrome://extensions/?id=' + chrome.runtime.id }));
onClick('openSidePanel', openSidePanel);
onClick('settingsGeneralTab', () => selectSettingsTab('general'));
onClick('settingsSyncTab', () => selectSettingsTab('sync'));
onClick('settingsDesignTab', () => selectSettingsTab('design'));
onClick('settingsSyncTab', async () => { selectSettingsTab('sync'); await updateSyncAccount(); });
onClick('settingsDataTab', () => selectSettingsTab('data'));
document.querySelector('#settingsDialog .settings-tabs').addEventListener('keydown', event => {
  if (!['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
  const tabs = [...event.currentTarget.querySelectorAll('[role=tab]')];
  const current = tabs.indexOf(document.activeElement);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  event.preventDefault();
  tabs[next].focus();
  tabs[next].click();
});
onClick('refreshSyncAccount', async () => { if (await chrome.permissions.request({ permissions: ['identity.email'] })) await updateSyncAccount(); });
onClick('syncNow', () => syncNow(true));
onClick('syncDriveNow', async () => {
  setSyncStatus('Conectando con Google Drive…');
  try {
    await navigator.locks.request('nex-b-drive', async () => {
      const snapshot = await repository.load();
      if (snapshot.recovered) throw new Error('Restaura o exporta el respaldo local antes de sincronizar imágenes.');
      const result = await syncDriveImages(snapshot.data, imageStore);
      if (result.uploaded || result.downloaded || JSON.stringify(projectSyncData(result.data)) !== JSON.stringify(projectSyncData(snapshot.data))) await commit(result.data, { expectedRevision: snapshot.revision });
      const detail = result.errors.length ? ' Errores: ' + result.errors.join(' | ') : '';
      setSyncStatus('Drive sincronizado: ' + result.uploaded + ' subidas, ' + result.unchanged + ' sin cambios, ' + result.downloaded + ' descargadas.' + detail, result.errors.length > 0);
    });
  } catch (error) { setSyncStatus(error.message, true); throw error; }
});
onClick('cleanupDriveOrphans', async () => {
  if (!confirm('Esta acción borra de Google Drive las imágenes de accesos que no existen en ESTE equipo. Sincroniza todos los equipos antes de continuar, o se perderán sus imágenes. ¿Deseas continuar?')) return;
  setSyncStatus('Buscando imágenes huérfanas en Drive…');
  try {
    const result = await navigator.locks.request('nex-b-drive', async () => cleanupDriveOrphans((await repository.load()).data));
    const detail = result.errors.length ? ' Errores: ' + result.errors.join(' | ') : '';
    setSyncStatus('Drive limpio: ' + result.deleted + ' imágenes huérfanas borradas.' + detail, result.errors.length > 0);
  } catch (error) {
    setSyncStatus(error.message, true);
    throw error;
  }
});
onClick('openDriveDocs', () => chrome.tabs.create({ url: 'https://console.cloud.google.com/apis/library/drive.googleapis.com' }));
$('syncEnabled').onchange = () => run(async () => {
  syncEnabled = $('syncEnabled').checked;
  await chrome.storage.local.set({ nexbSyncEnabled: syncEnabled });
  if (syncEnabled) await activateSync();
  else setSyncStatus('Sincronización desactivada en este dispositivo.');
});
onClick('openSettings', async () => {
  const s = data.settings;
  renderStylePresets(s.themeId);
  $('settingsDialog').dataset.themeId = s.themeId;
  $('settingsDialog').dataset.pattern = s.backgroundPattern;
  for (const key of ['accentColor', 'backgroundColor', 'backgroundImageUrl', 'thumbnailSize', 'fontFamily', 'cardStyle', 'cardBorder', 'cardBorderColor', 'cardSpacing', 'iconStyle', 'titlePosition', 'tagsPosition']) $(key).value = s[key];
  $('thumbnailCustomHeight').value = s.thumbnailHeight;
  $('thumbnailHeightRange').value = s.thumbnailHeight;
  $('thumbnailHeightValue').textContent = s.thumbnailHeight + ' px';
  $('remoteImagesEnabled').checked = s.remoteImagesEnabled;
  $('memoryExcludedHosts').value = ((await chrome.storage.local.get('nexbMemoryExcludedHosts')).nexbMemoryExcludedHosts || []).join('\n');
  $('settingsDialog').dataset.storedBackground = isImageRef(s.backgroundImageUrl) ? s.backgroundImageUrl : '';
  if (isImageRef(s.backgroundImageUrl)) $('backgroundImageUrl').value = '';
  $('captureEnabled').checked = s.captureEnabled;
  $('showWorkspaceTabs').checked = s.showWorkspaceTabs;
  $('imageShade').checked = s.imageShade !== false;
  $('thumbnailShadow').checked = s.thumbnailShadow !== false;
  $('settingsTagRules').value = Object.entries(data.autoTagRules).map(([domain, tag]) => domain + ' = ' + tag).join('\n');
  $('syncEnabled').checked = syncEnabled;
  $('dataJson').value = 'La copia JSON incluye los datos y las imágenes. Usa Copiar JSON o Descargar ZIP para obtenerla.';
  selectSettingsTab('general');
  openDialog('settingsDialog');
});
$('backgroundColor').oninput = () => { $('settingsDialog').dataset.pattern = ''; };
onSubmit('workspaceForm', async () => {
  const candidate = structuredClone(data);
  const workspace = { id: uid('workspace'), name: $('workspaceName').value.trim(), type: $('workspaceKind').value };
  candidate.workspaces.push(workspace); candidate.activeWorkspaceId = workspace.id;
  await commit(candidate); $('workspaceDialog').close();
});
onSubmit('categoryForm', async () => {
  const candidate = structuredClone(data);
  candidate.categories.push({ id: uid('category'), name: $('categoryName').value.trim(), workspaceId: currentWorkspace().id, parentId: $('categoryParent').value, accesses: [] });
  await commit(candidate); $('categoryDialog').close();
});
onSubmit('accessForm', async () => {
  if (imageBusy) throw new Error('Espera a que termine de procesar la imagen.');
  const candidate = structuredClone(data);
  const existingId = $('accessId').value;
  const access = { id: existingId || uid('access'), title: $('accessTitle').value.trim(), url: $('accessUrl').value.trim(),
    tags: $('accessTags').value.split(',').map(s => s.trim()).filter(Boolean), matchType: $('matchType').value,
    thumbnail: $('accessThumbnailUrl').value.trim() || pastedImage,
    ...($('accessLocalOnly').checked ? { localOnly: true } : {}) };
  const originalAccess = existingId ? candidate.categories.flatMap(category => category.accesses).find(item => item.id === existingId) : null;
  Object.assign(access, retainAccessMetadata(access, originalAccess));
  if (existingId) {
    const original = candidate.categories.find(c => c.id === $('accessDialog').dataset.categoryId);
    if (!original?.accesses.some(a => a.id === existingId)) throw new Error('El acceso ya no existe; cancela y vuelve a abrirlo.');
  }
  placeAccess(candidate, access, { sourceCategoryId: $('accessDialog').dataset.categoryId,
    workspaceId: $('accessWorkspace').value, categoryId: $('accessCategory').value }, uid);
  const destinationName = candidate.workspaces.find(w => w.id === $('accessWorkspace').value).name;
  await commit(candidate); $('accessDialog').close();
  showMessage('Acceso guardado en ' + destinationName + '.');
});
$('accessWorkspace').onchange = () => fillAccessCategories($('accessWorkspace').value);
$('accessTags').oninput = fillTagSuggestions;
$('accessTags').onfocus = fillTagSuggestions;
$('accessTags').onclick = fillTagSuggestions;
$('accessTags').onkeydown = event => {
  if (event.key === 'ArrowDown' && !$('tagSuggestions').hidden) {
    event.preventDefault(); $('tagSuggestions').querySelector('button')?.focus();
  } else if (event.key === 'Escape' && !$('tagSuggestions').hidden) {
    event.preventDefault(); event.stopPropagation(); $('tagSuggestions').hidden = true;
  }
};
onSubmit('settingsForm', async () => {
  const candidate = structuredClone(data);
  const excludedHosts = parseExcludedHosts($('memoryExcludedHosts').value);
  const thumbnailSize = $('thumbnailSize').value;
  candidate.settings = {
    themeId: $('settingsDialog').dataset.themeId, backgroundPattern: $('settingsDialog').dataset.pattern,
    accentColor: $('accentColor').value, backgroundColor: $('backgroundColor').value,
     backgroundImageUrl: $('backgroundImageUrl').value.trim() || $('settingsDialog').dataset.storedBackground || '',
    remoteImagesEnabled: $('remoteImagesEnabled').checked, thumbnailSize, thumbnailHeight: thumbnailHeightForSize(thumbnailSize, data.settings.thumbnailHeight),
    fontFamily: $('fontFamily').value, cardStyle: $('cardStyle').value, cardBorder: $('cardBorder').value,
    cardBorderColor: $('cardBorderColor').value, cardSpacing: $('cardSpacing').value, iconStyle: $('iconStyle').value,
    titlePosition: $('titlePosition').value, tagsPosition: $('tagsPosition').value,
    captureEnabled: $('captureEnabled').checked,
    showWorkspaceTabs: $('showWorkspaceTabs').checked,
    imageShade: $('imageShade').checked,
    thumbnailShadow: $('thumbnailShadow').checked
  };
  candidate.autoTagRules = parseRules($('settingsTagRules').value);
  await commit(candidate);
  await chrome.storage.local.set({ nexbMemoryExcludedHosts: excludedHosts });
  imageView.refresh(); $('settingsDialog').close();
});
onClick('copyData', async () => {
  const json = await backupTask('json', data);
  try { await navigator.clipboard.writeText(json); showMessage('JSON copiado. Puede contener datos privados.'); }
  catch { $('dataJson').value = json; $('dataJson').focus(); $('dataJson').select(); showMessage('Pulsa ⌘C / Ctrl+C para copiar el JSON seleccionado.'); }
});
onClick('downloadData', async () => {
  const url = URL.createObjectURL(await backupTask('export', data));
  const link = document.createElement('a');
  link.href = url; link.download = 'nex-b-backup-' + new Date().toISOString().slice(0, 10) + '.zip';
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  showMessage('Descarga solicitada. El ZIP incluye las imágenes pegadas; las imágenes HTTPS conservan su enlace.');
});
onClick('importData', () => $('zipImportInput').click());

function setSyncStatus(message, error = false) {
  const status = $('syncStatus');
  if (!status) return;
  status.textContent = message;
  status.hidden = !message;
  status.classList.toggle('error', error);
}
async function updateSyncAccount() {
  const status = $('syncAccount');
  try {
    if (!await chrome.permissions.contains({ permissions: ['identity.email'] })) { status.textContent = 'El correo de la cuenta solo se consulta si pulsas «Actualizar cuenta» y das permiso.'; return; }
    const profile = await chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' });
    status.textContent = profile.email ? 'Cuenta de Chrome: ' + profile.email : 'Cuenta de Chrome: no disponible; activa la sincronización del perfil.';
  } catch {
    status.textContent = 'Cuenta de Chrome: no se pudo consultar.';
  }
}
function askFirstSync() {
  const dialog = $('syncChoiceDialog');
  return new Promise(resolve => {
    const cancel = () => choose(null);
    const choose = value => { dialog.removeEventListener('cancel', cancel); dialog.close(); resolve(value); };
    $('syncChoiceLocal').onclick = () => choose('local');
    $('syncChoiceCloud').onclick = () => choose('cloud');
    $('syncChoiceMerge').onclick = () => choose('merge');
    dialog.addEventListener('cancel', cancel, { once: true });
    dialog.showModal();
  });
}
async function activateSync() {
  const remote = await syncStore.load();
  const choice = remote ? await askFirstSync() : null;
  if (remote && !choice) {
    syncEnabled = false; $('syncEnabled').checked = false;
    await chrome.storage.local.set({ nexbSyncEnabled: false });
    setSyncStatus('Sincronización cancelada.'); return;
  }
  await syncNow(true, choice);
}
async function syncNow(manual = false, choice = null) {
  if (syncBusy || (!manual && syncPaused)) return;
  // Keep an in-progress editor on its original revision.
  if ([...document.querySelectorAll('dialog[open]')].some(d => d.id !== 'settingsDialog')) return;
  syncBusy = true;
  clearTimeout(syncTimer);
  if (manual) { syncFailures = 0; syncPaused = false; }
  let retryDelay = null;
  try {
    setSyncStatus('Leyendo datos sincronizados…');
    let result;
    try { result = await syncController.run(choice); }
    catch (error) {
      if (!manual || !(error instanceof SyncConflictError)) throw error;
      const resolution = await askFirstSync();
      if (!resolution) { setSyncStatus('Conflicto pendiente; no se reemplazaron tus datos.'); return; }
      result = await syncController.run(resolution);
    }
    if (result.snapshot && result.snapshot.revision !== revision) adopt(result.snapshot);
    await restoreSyncPreference();
    syncFailures = 0;
    setSyncStatus(result.message);
  } catch (error) {
    syncFailures++;
    retryDelay = error instanceof SyncConflictError ? null : syncRetryDelay(error, syncFailures);
    syncPaused = retryDelay === null;
    setSyncStatus(error.message + (syncPaused ? ' Sincronización automática pausada; revisa el problema y pulsa Sincronizar ahora.' : ' Se reintentará en ' + retryDelay / 1000 + ' segundos.'), true);
  } finally {
    syncBusy = false;
    if (retryDelay !== null && syncEnabled) scheduleSync(retryDelay);
  }
}
function scheduleSync(delay = 900) {
  if (!syncEnabled || syncBusy || syncPaused) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => run(() => syncNow()), delay);
}
async function restoreSyncPreference() {
  const stored = await chrome.storage.local.get(['nexbSyncEnabled', 'nexbSyncDirty', 'nexbSyncLastRevision']);
  syncEnabled = stored.nexbSyncEnabled === true;
  syncDirty = stored.nexbSyncDirty === true;
  syncLastRevision = typeof stored.nexbSyncLastRevision === 'string' ? stored.nexbSyncLastRevision : '';
  $('syncEnabled').checked = syncEnabled;
}

let bookmarkPath = [], bookmarkChildren = [], bookmarkGeneration = 0, bookmarkBusy = false;
async function requestBookmarkPermission() {
  // Permission request is reached directly from an explicit button or section icon.
  const granted = await chrome.permissions.request({ permissions: ['bookmarks'] });
  if (!granted) throw new Error('No se concedió acceso a Favoritos. No se modificó NEX.B.');
}
function syncSummary(stats) {
  return stats.added + ' nuevos · ' + stats.duplicates + ' repetidos ignorados · ' + stats.missing + ' ya no están en Favoritos · ' + stats.restored + ' restaurados · ' + stats.unsupported + ' URLs no compatibles.';
}
async function syncCategoryBookmarks(category) {
  await requestBookmarkPermission();
  const { children } = await readBookmarkFolder(chrome.bookmarks, category.bookmarkFolderId);
  const result = syncBookmarkSection(data, category.id, children, uid);
  if (result.stats.added || result.stats.missing || result.stats.restored) await commit(result.data);
  showMessage('Sección “' + category.name + '” sincronizada: ' + syncSummary(result.stats));
}
async function syncWorkspaceBookmarks() {
  await requestBookmarkPermission();
  let candidate = data, linked = 0;
  const unavailable = [];
  const total = { added: 0, duplicates: 0, unsupported: 0, missing: 0, restored: 0, folders: 0 };
  const linkedCategories = data.categories.filter(item => item.bookmarkFolderId);
  for (const category of linkedCategories) {
    try {
      const { children } = await readBookmarkFolder(chrome.bookmarks, category.bookmarkFolderId);
      const result = syncBookmarkSection(candidate, category.id, children, uid);
      candidate = result.data; linked++;
      for (const key of Object.keys(total)) total[key] += result.stats[key];
    } catch (error) {
      unavailable.push(category.name + (error?.message ? ': ' + error.message : ''));
    }
  }
  if (!linkedCategories.length) { showMessage('No hay secciones vinculadas a Favoritos.'); return; }
  if (total.added || total.missing || total.restored) await commit(candidate);
  const errors = unavailable.length ? ' No se pudieron sincronizar: ' + unavailable.join(' | ') : '';
  showMessage(linked + ' secciones sincronizadas: ' + syncSummary(total) + errors);
}
function fillBookmarkCategories() {
  const workspaceId = $('bookmarkWorkspace').value;
  $('bookmarkCategory').replaceChildren(new Option('Sección con el nombre de la carpeta', ''),
    ...data.categories.filter(c => c.workspaceId === workspaceId).map(c => new Option(c.name, c.id)));
  updateBookmarkName();
}
function updateBookmarkName() {
  const custom = !$('bookmarkCategory').value;
  $('bookmarkNameLabel').hidden = !custom;
  $('bookmarkSectionName').required = custom;
}
async function browseBookmarkFolder(path) {
  const generation = ++bookmarkGeneration;
  bookmarkBusy = true;
  $('bookmarkImportSubmit').disabled = true;
  $('bookmarkSummary').textContent = 'Leyendo esta carpeta…';
  try {
    const result = await readBookmarkFolder(chrome.bookmarks, path.at(-1).id);
    if (generation !== bookmarkGeneration || !$('bookmarksDialog').open) return;
    bookmarkPath = path;
    bookmarkChildren = result.children;
    $('bookmarkPath').textContent = path.map(p => p.title || 'Sin nombre').join(' › ');
    $('bookmarkUp').disabled = path.length < 2;
    $('bookmarkFolders').replaceChildren();
    const folders = result.children.filter(item => !item.url);
    for (const folder of folders) {
      $('bookmarkFolders').append(button('📁 ' + (folder.title || 'Sin nombre'), 'Entrar a ' + (folder.title || 'Sin nombre'),
        () => browseBookmarkFolder([...path, { id: folder.id, title: folder.title }]), 'button secondary bookmark-folder'));
    }
    const count = result.children.filter(item => item.url).length;
    $('bookmarkSummary').textContent = count + ' enlaces directos · ' + folders.length + ' subcarpetas (no se importan).';
    $('bookmarkSectionName').value = (result.folder.title || 'Favoritos de Chrome').slice(0, 120);
    $('bookmarkImportSubmit').disabled = !count;
  } catch (error) {
    if (generation === bookmarkGeneration) {
      bookmarkChildren = []; $('bookmarkSummary').textContent = 'No se pudo leer la carpeta. Vuelve a intentarlo.';
    }
    throw error;
  } finally { if (generation === bookmarkGeneration) bookmarkBusy = false; }
}
onClick('openBookmarks', async () => {
  await requestBookmarkPermission();
  if (!$('settingsDialog').open) return;
  $('bookmarkWorkspace').replaceChildren(...data.workspaces.map(w => new Option(w.name, w.id, false, w.id === currentWorkspace().id)));
  fillBookmarkCategories();
  $('bookmarkLink').checked = true;
  bookmarkPath = []; bookmarkChildren = [];
  $('bookmarkFolders').replaceChildren(); $('bookmarkPath').textContent = '';
  openDialog('bookmarksDialog');
  await browseBookmarkFolder([{ id: '0', title: 'Favoritos de Chrome' }]);
});
onClick('syncWorkspaceBookmarks', syncWorkspaceBookmarks);
onClick('bookmarkUp', () => { if (bookmarkPath.length > 1) return browseBookmarkFolder(bookmarkPath.slice(0, -1)); });
$('bookmarkWorkspace').onchange = fillBookmarkCategories;
$('bookmarkCategory').onchange = updateBookmarkName;
$('bookmarksDialog').addEventListener('close', () => {
  bookmarkGeneration++; bookmarkBusy = false; bookmarkChildren = []; bookmarkPath = [];
});
onSubmit('bookmarksForm', async () => {
  if (bookmarkBusy || !bookmarkPath.length) throw new Error('Espera a que termine de cargar la carpeta.');
  const generation = bookmarkGeneration;
  bookmarkBusy = true; $('bookmarkImportSubmit').disabled = true;
  const destination = { workspaceId: $('bookmarkWorkspace').value, categoryId: $('bookmarkCategory').value,
    name: $('bookmarkSectionName').value,
    folderId: $('bookmarkLink').checked ? bookmarkPath.at(-1).id : '',
    folderTitle: $('bookmarkLink').checked ? bookmarkPath.at(-1).title : '' };
  try {
    // Re-read just this level at import time; do not follow subfolders.
    const { children } = await readBookmarkFolder(chrome.bookmarks, bookmarkPath.at(-1).id);
    if (generation !== bookmarkGeneration || !$('bookmarksDialog').open) return;
    const result = planBookmarkImport(data, children, destination, uid);
    if (result.stats.added || destination.folderId) await commit(result.data);
    $('bookmarksDialog').close();
    const s = result.stats;
    showMessage(s.added + ' nuevos importados · ' + s.duplicates + ' repetidos ignorados · ' + s.unsupported + ' URLs no compatibles · ' + s.folders + ' subcarpetas omitidas.' + (destination.folderId ? ' Sección vinculada para sincronizar.' : ''));
  } finally {
    if (generation === bookmarkGeneration) {
      bookmarkBusy = false; $('bookmarkImportSubmit').disabled = !bookmarkChildren.some(item => item.url);
    }
  }
});
onClick('restorePrevious', async () => {
  const candidate = await repository.loadBackup();
  if (!confirm('¿Restaurar la versión anterior? La configuración actual pasará a ser el respaldo local.')) return;
  await commit(candidate); $('settingsDialog').close(); showMessage('Versión anterior restaurada.');
});
$('zipImportInput').onchange = event => run(async () => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > LIMITS.archive) throw new Error('El ZIP supera 64 MB.');
    const importRevision = revision;
    const candidate = await backupTask('import', null, await file.arrayBuffer());
    if (!confirm('Importar reemplazará tus Workspaces y configuración actuales. Se conservará la versión anterior como respaldo local. ¿Continuar?')) return;
    await commit(candidate, { expectedRevision: importRevision }); viewMode = 'workspace'; render(); $('settingsDialog').close();
    showMessage('Respaldo importado correctamente.');
  } finally { event.target.value = ''; }
});
document.addEventListener('paste', event => {
  if (!$('accessDialog').open || saving) return;
  const item = [...(event.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
  if (!item) return;
  event.preventDefault();
  const generation = ++pasteGeneration;
  imageBusy = true;
  showMessage('Preparando miniatura…');
  run(async () => {
    try {
      const image = await resizeImage(item.getAsFile());
      if (generation !== pasteGeneration || !$('accessDialog').open) return;
      pastedImage = image; $('accessThumbnailUrl').value = ''; showPreview(); showMessage('Miniatura lista para guardar.');
    } finally { if (generation === pasteGeneration) imageBusy = false; }
  });
});
$('thumbnailFileInput').onchange = () => run(async () => {
  const file = $('thumbnailFileInput').files?.[0];
  $('thumbnailFileInput').value = '';
  if (!file) return;
  const generation = ++pasteGeneration;
  imageBusy = true;
  try {
    const image = await resizeImage(file);
    if (generation !== pasteGeneration || !$('accessDialog').open) return;
    pastedImage = image;
    $('accessThumbnailUrl').value = '';
    showPreview();
    showMessage('Miniatura lista para guardar.');
  } finally {
    if (generation === pasteGeneration) imageBusy = false;
  }
});
onClick('removeBackground', () => { $('backgroundImageUrl').value = ''; $('settingsDialog').dataset.storedBackground = ''; });
onClick('pasteBox', () => $('pasteBox').focus());
onClick('clipboardPaste', pasteClipboardImage);
onClick('removeThumbnail', () => { pasteGeneration++; imageBusy = false; pastedImage = ''; $('accessThumbnailUrl').value = ''; showPreview(); });
$('accessThumbnailUrl').onchange = () => run(() => { pastedImage = imageUrl($('accessThumbnailUrl').value.trim()); showPreview(); });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && ['nexbSyncEnabled', 'nexbSyncDirty', 'nexbSyncLastRevision'].some(key => key in changes)) run(restoreSyncPreference);
  if (area === 'local' && ('workspaceRevision' in changes || 'workspaceData' in changes)) run(reload);
  if (area === 'sync' && syncEnabled && Object.keys(changes).some(key => key.startsWith('nexb.sync.'))) {
    if (syncDirty) setSyncStatus('Hay cambios sincronizados y cambios locales pendientes. Pulsa «Sincronizar ahora» para combinarlos.');
    else { setSyncStatus('Aplicando cambios sincronizados…'); scheduleSync(); }
  }
});
chrome.tabs.onUpdated.addListener((_id, change) => { if (change.url || change.status === 'complete') scheduleTabRefresh(); });
chrome.tabs.onCreated.addListener(scheduleTabRefresh);
chrome.tabs.onRemoved.addListener(scheduleTabRefresh);
chrome.tabs.onReplaced.addListener(scheduleTabRefresh);

// Solo debe quedar una pestaña de nex.b: al abrir otra, las anteriores se
// cierran salvo que tengan un formulario abierto o trabajo en curso.
const homeChannel = new BroadcastChannel('nexb-home');
homeChannel.onmessage = async event => {
  if (event.data !== 'opened') return;
  if (saving || syncBusy || captureBusy || recaptureBusy || imageBusy || bookmarkBusy || document.querySelector('dialog[open]')) return;
  const tab = await chrome.tabs.getCurrent().catch(() => null);
  if (Number.isInteger(tab?.id)) chrome.tabs.remove(tab.id).catch(() => {});
};
// El Side Panel no es una pestaña (getCurrent no devuelve nada): no cierra otras.
chrome.tabs.getCurrent().then(tab => { if (tab) homeChannel.postMessage('opened'); }).catch(() => {});

async function initialize() {
  await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  await chrome.storage.sync.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  await restoreLocalThumbnailPreference();
  await restoreNarrowColumns();
  await restoreCollapsedSections();
  await restoreTitlesOnly();
  await restoreSyncPreference();
  await repository.migrate();
  const snapshot = await repository.load();
  adopt(snapshot); ready = true;
  const installedVersion = chrome.runtime.getManifest().version;
  $('extensionVersion').textContent = installedVersion;
  $('updateCommand').textContent = UPDATE_COMMAND;
  // 2.0.0 se muestra como 2.0; un parche distinto de cero se conserva (2.0.1).
  $('footerVersion').textContent = 'v' + installedVersion.replace(/^(\d+\.\d+)\.0$/, '$1');
  await updateSyncAccount();
  if (syncEnabled) await syncNow().catch(() => {});
  if (snapshot.recovered) showMessage('Se recuperó la copia anterior en memoria. Descarga un ZIP antes de continuar; los datos originales no se sobrescribieron.');
  await refreshTabs();
  const params = new URLSearchParams(location.search);
  let pending;
  if (/^[a-f0-9-]{36}$/.test(params.get('draft') || '')) {
    pendingKey = 'draft:' + params.get('draft');
    pending = (await chrome.storage.session.get(pendingKey))[pendingKey];
    if (pending && Date.now() - pending.createdAt > 30 * 60 * 1000) { await clearPending(); pending = null; }
  } else if (params.has('addPending')) {
    pendingKey = 'pendingAccess';
    pending = (await chrome.storage.local.get(pendingKey))[pendingKey];
  }
  if (pending) {
    const url = webUrl(pending.url);
    const thumbnail = imageUrl(pending.thumbnail || '');
    if (pending.accessId) {
      const target = findRecaptureTarget(data, pending);
      openAccessDialog(target.category.id, target.access);
      if (thumbnail) { pastedImage = thumbnail; $('accessThumbnailUrl').value = ''; }
    } else {
      openAccessDialog(currentCategories()[0]?.id);
      $('accessTitle').value = String(pending.title || domainOf(url)).slice(0, 300);
      $('accessUrl').value = url;
      pastedImage = thumbnail;
    }
    showPreview();
    showMessage(pending.notice || 'Revisa el acceso y elige su categoría antes de guardar.');
  } else if (pendingKey) { pendingKey = ''; showMessage('El acceso pendiente ya no está disponible. Agrégalo de nuevo desde la página.'); }
  // Al final, para no tapar el formulario de un acceso pendiente.
  showAvailableUpdate(chrome.runtime.getManifest().version).catch(() => {});
}
setNarrow(narrowMedia.matches);
run(initialize);
