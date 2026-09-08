import { DEFAULT_DATA, THEME_PRESETS, domainOf, normalizeData, validateRules, imageUrl, LIMITS, documentKey, webUrl } from './model.js';
import { createRepository } from './storage.js';
import { openOrFocusTab } from './tabs.js';
import { createBackupZip, readStoredZip } from './backup.js';
import { resizeImage } from './images.js';
import { collectTags, suggestTags, insertTag } from './tags.js';
import { planBookmarkImport, readBookmarkFolder, placeAccess } from './bookmarks.js';
import { moveSection, reorderSection, sectionSiblings } from './sections.js';
import { prepareRecapture, findRecaptureTarget } from './recapture.js';

const $ = id => document.getElementById(id);
const uid = prefix => prefix + '-' + crypto.randomUUID();
const repository = createRepository(chrome.storage.local, navigator.locks);
let data = normalizeData(DEFAULT_DATA), revision = 0;
let viewMode = 'workspace', pastedImage = '', pasteGeneration = 0, imageBusy = false;
let saving = false, reloadPending = false, ready = false, pendingKey = '';
let openIndex = { exact: new Set(), domain: new Set(), document: new Set() };
let cardStatuses = [], tagCache = new Map();

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
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
function adopt(snapshot) {
  const selected = sessionStorage.getItem('activeWorkspace');
  data = snapshot.data;
  if (data.workspaces.some(w => w.id === selected)) data.activeWorkspaceId = selected;
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
async function commit(candidate) {
  if (!ready) throw new Error('Los datos no están listos para guardar.');
  if (saving) throw new Error('Espera a que termine el guardado.');
  saving = true;
  document.querySelectorAll('dialog[open] button, dialog[open] input, dialog[open] select, dialog[open] textarea').forEach(b => { b.disabled = true; });
  try {
    const snapshot = await repository.save(candidate, revision);
    data = snapshot.data;
    revision = snapshot.revision;
    sessionStorage.setItem('activeWorkspace', data.activeWorkspaceId);
    applySettings();
    render();
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
function applySettings() {
  const s = data.settings;
  document.documentElement.dataset.theme = s.themeId;
  document.documentElement.style.setProperty('--accent-color', s.accentColor);
  const rgb = s.accentColor.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  document.documentElement.style.setProperty('--accent-ink', luminance > 0.179 ? '#000000' : '#ffffff');
  document.documentElement.style.setProperty('--thumbnail-height', ({ small: 180, medium: 248, large: 320 }[s.thumbnailSize]) + 'px');
  document.documentElement.classList.toggle('light-theme', Boolean(THEME_PRESETS[s.themeId]?.light));
  document.body.style.backgroundColor = s.backgroundColor;
  document.body.style.backgroundImage = s.backgroundImageUrl
    ? 'linear-gradient(rgba(10,14,25,.66),rgba(10,14,25,.86)), url(' + JSON.stringify(s.backgroundImageUrl) + ')'
    : (s.backgroundPattern || 'none');
  const preset = THEME_PRESETS[s.themeId];
  const hasImage = Boolean(s.backgroundImageUrl || (preset?.backgroundAsset && s.backgroundPattern === preset.backgroundPattern));
  document.body.style.backgroundSize = hasImage ? 'cover' : '';
  document.body.style.backgroundPosition = hasImage ? 'center' : '';
  document.body.style.backgroundAttachment = hasImage ? 'fixed' : '';
}
function applyPresetToForm(themeId) {
  const preset = THEME_PRESETS[themeId];
  if (!preset) return;
  $('accentColor').value = preset.accentColor;
  $('backgroundColor').value = preset.backgroundColor;
  $('backgroundImageUrl').value = '';
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
    const key = access.matchType === 'domain' ? new URL(access.url).origin : access.matchType === 'exact' ? webUrl(access.url) : documentKey(access.url);
    return openIndex[access.matchType].has(key);
  } catch { return false; }
}
function updateStatuses() {
  for (const { access, status } of cardStatuses) {
    const open = isOpen(access);
    status.classList.toggle('open', open);
    status.title = open ? 'Abierto' : 'Cerrado';
    status.setAttribute('aria-label', status.title);
  }
}
async function refreshTabs() {
  const tabs = await chrome.tabs.query({});
  openIndex = { exact: new Set(), domain: new Set(), document: new Set() };
  for (const tab of tabs) {
    try {
      const url = webUrl(tab.pendingUrl || tab.url);
      openIndex.exact.add(url);
      openIndex.domain.add(new URL(url).origin);
      openIndex.document.add(documentKey(url));
    } catch { /* Internal browser pages cannot match saved HTTP(S) links. */ }
  }
  updateStatuses();
}
let tabRefreshTimer;
function scheduleTabRefresh() {
  clearTimeout(tabRefreshTimer);
  tabRefreshTimer = setTimeout(() => run(refreshTabs), 150);
}
async function openAccess(access) {
  await openOrFocusTab(access, chrome, navigator.locks);
  scheduleTabRefresh();
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
    $('workspaceTabs').append(b);
  }
  $('tagRules').textContent = 'Tags';
  $('tagRules').setAttribute('aria-pressed', String(viewMode === 'tags'));
  $('workspace').replaceChildren();
  $('emptyState').textContent = viewMode === 'tags' ? 'Aún no hay accesos con tags en tus Workspaces.' : 'Agrega una categoría para empezar a organizar tus accesos.';
  if (viewMode === 'tags') renderTagView();
  else {
    const categories = currentCategories();
    $('emptyState').hidden = categories.length > 0;
    for (const category of categories.filter(c => !c.parentId)) {
      renderCategory(category, false);
      for (const child of categories.filter(c => c.parentId === category.id)) renderCategory(child, true);
    }
  }
  updateStatuses();
}
function renderTagView() {
  const groups = new Map();
  for (const category of data.categories) for (const access of category.accesses) {
    for (const tag of allTags(access)) {
      if (!groups.has(tag)) groups.set(tag, []);
      groups.get(tag).push({ access, category });
    }
  }
  $('emptyState').hidden = groups.size > 0;
  const entries = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  let shownGroups = 0;
  const moreGroups = button('Mostrar más tags', 'Mostrar otros 20 tags', appendGroups);
  function appendGroups() {
    moreGroups.remove();
    for (const [tag, items] of entries.slice(shownGroups, shownGroups + 20)) {
    const section = node('section', 'category');
    const heading = node('div', 'category-heading');
    heading.append(node('h2', '', '# ' + tag), accessCount(items.length));
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
function renderCategory(category, subcategory) {
  const section = node('section', 'category' + (subcategory ? ' subcategory' : ''));
  const heading = node('div', 'category-heading');
  const actions = node('div', 'category-actions');
  actions.append(button('+', 'Nuevo acceso', () => openAccessDialog(category.id), 'button quiet category-icon'),
    button('✎', 'Editar categoría', () => renameCategory(category), 'button quiet category-icon'),
    button('⇥', 'Mover sección a otro Workspace', () => openMoveSectionDialog(category), 'button quiet category-icon'));
  const siblings = sectionSiblings(data, category);
  const position = siblings.findIndex(c => c.id === category.id);
  for (const [label, title, direction] of [['↑', 'Subir sección', -1], ['↓', 'Bajar sección', 1]]) {
    const control = button(label, title, () => commit(reorderSection(data, category.id, direction)), 'button quiet category-icon');
    control.disabled = position + direction < 0 || position + direction >= siblings.length;
    actions.append(control);
  }
  heading.append(node('h2', '', category.name), accessCount(category.accesses.length), actions);
  const cards = node('div', 'cards');
  category.accesses.forEach(access => cards.append(makeCard(access, category.id)));
  cards.append(button('+', 'Nuevo acceso', () => openAccessDialog(category.id), 'add-card'));
  section.append(heading, cards);
  $('workspace').append(section);
}
function makeCard(access, categoryId) {
  const card = node('article', 'card');
  const open = button('', 'Abrir o enfocar: ' + access.title, () => openAccess(access), 'card-open');
  const thumb = node('div', 'thumb');
  const recapture = button('↻ Capturar imagen', 'Volver a capturar ' + access.title, () => openRecaptureDialog(access), 'card-recapture');
  recapture.hidden = Boolean(access.thumbnail);
  if (access.thumbnail) {
    thumb.classList.add('has-thumbnail');
    const img = node('img', 'thumbnail-image'); img.src = access.thumbnail; img.alt = '';
    img.loading = 'lazy'; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
    img.onerror = () => { img.remove(); thumb.classList.remove('has-thumbnail'); thumb.prepend(node('span', 'image-error', 'Imagen no disponible')); recapture.hidden = false; };
    thumb.append(img);
  } else thumb.append(node('span', 'image-error', 'Sin miniatura'));
  const overlay = node('div', 'card-overlay');
  const tags = node('div', 'tags');
  const automatic = new Set(automaticTags(access.url));
  allTags(access).forEach(tag => tags.append(node('span', 'tag' + (automatic.has(tag) ? ' auto' : ''), tag)));
  overlay.append(tags);
  thumb.append(overlay);
  const status = node('span', 'status');
  status.setAttribute('role', 'img');
  const footer = node('div', 'card-footer');
  const title = node('div', 'card-title', access.title); title.title = access.title;
  footer.append(status, title);
  open.append(thumb, footer);
  cardStatuses.push({ access, status });
  const edit = button('✎', 'Editar ' + access.title, () => openAccessDialog(categoryId, access), 'card-edit');
  card.append(open, edit, recapture);
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
  $('matchType').value = access?.matchType || 'document';
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
  if (pastedImage) $('preview').src = pastedImage;
  else $('preview').removeAttribute('src');
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
function showCardMenu(event, access, categoryId) {
  const menu = $('cardMenu'); menu.hidden = false;
  menu.style.left = Math.max(0, Math.min(event.clientX, innerWidth - 190)) + 'px';
  menu.style.top = Math.max(0, Math.min(event.clientY, innerHeight - 190)) + 'px';
  menu.querySelector('[data-card-action="capture"]').onclick = () => run(() => { hideCardMenu(); openRecaptureDialog(access); });
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

function onClick(id, action) { $(id).onclick = () => run(action); }
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
    if (dialog.id === 'accessDialog') { pasteGeneration++; imageBusy = false; pastedImage = ''; showPreview(); run(clearPending); }
    if (reloadPending) run(reload);
  });
});
document.querySelectorAll('[data-cancel]').forEach(b => {
  b.onclick = () => { if (!saving) b.closest('dialog').close(); };
});
document.addEventListener('click', hideCardMenu);
document.addEventListener('keydown', e => { if (e.key === 'Escape') hideCardMenu(); });
onClick('newWorkspace', () => { $('workspaceForm').reset(); openDialog('workspaceDialog'); });
onClick('newCategory', () => {
  $('categoryForm').reset();
  $('categoryParent').replaceChildren(new Option('Categoría principal', ''),
    ...currentCategories().filter(c => !c.parentId).map(c => new Option('Dentro de: ' + c.name, c.id)));
  openDialog('categoryDialog');
});
onClick('tagRules', () => { viewMode = viewMode === 'tags' ? 'workspace' : 'tags'; render(); });
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
onClick('openSettings', () => {
  const s = data.settings;
  renderStylePresets(s.themeId);
  $('settingsDialog').dataset.themeId = s.themeId;
  $('settingsDialog').dataset.pattern = s.backgroundPattern;
  for (const key of ['accentColor', 'backgroundColor', 'backgroundImageUrl', 'thumbnailSize']) $(key).value = s[key];
  $('captureEnabled').checked = s.captureEnabled;
  $('settingsTagRules').value = Object.entries(data.autoTagRules).map(([domain, tag]) => domain + ' = ' + tag).join('\n');
  $('dataJson').value = 'La copia JSON incluye los datos y las imágenes. Usa Copiar JSON o Descargar ZIP para obtenerla.';
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
    thumbnail: $('accessThumbnailUrl').value.trim() || pastedImage };
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
  candidate.settings = {
    themeId: $('settingsDialog').dataset.themeId, backgroundPattern: $('settingsDialog').dataset.pattern,
    accentColor: $('accentColor').value, backgroundColor: $('backgroundColor').value,
    backgroundImageUrl: $('backgroundImageUrl').value.trim(), thumbnailSize: $('thumbnailSize').value,
    captureEnabled: $('captureEnabled').checked
  };
  candidate.autoTagRules = parseRules($('settingsTagRules').value);
  await commit(candidate); $('settingsDialog').close();
});
onClick('copyData', async () => {
  const json = JSON.stringify(data, null, 2);
  try { await navigator.clipboard.writeText(json); showMessage('JSON copiado. Puede contener datos privados.'); }
  catch { $('dataJson').value = json; $('dataJson').focus(); $('dataJson').select(); showMessage('Pulsa ⌘C / Ctrl+C para copiar el JSON seleccionado.'); }
});
onClick('downloadData', () => {
  const url = URL.createObjectURL(createBackupZip(data));
  const link = document.createElement('a');
  link.href = url; link.download = 'nex-b-backup-' + new Date().toISOString().slice(0, 10) + '.zip';
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  showMessage('Descarga solicitada. El ZIP incluye las imágenes pegadas; las imágenes HTTPS conservan su enlace.');
});
onClick('importData', () => $('zipImportInput').click());

let bookmarkPath = [], bookmarkChildren = [], bookmarkGeneration = 0, bookmarkBusy = false;
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
  // Permission request must happen directly inside this click gesture, before other awaits.
  const granted = await chrome.permissions.request({ permissions: ['bookmarks'] });
  if (!granted) { showMessage('No se concedió acceso a favoritos. No se importó nada.'); return; }
  if (!$('settingsDialog').open) return;
  $('bookmarkWorkspace').replaceChildren(...data.workspaces.map(w => new Option(w.name, w.id, false, w.id === currentWorkspace().id)));
  fillBookmarkCategories();
  bookmarkPath = []; bookmarkChildren = [];
  $('bookmarkFolders').replaceChildren(); $('bookmarkPath').textContent = '';
  openDialog('bookmarksDialog');
  await browseBookmarkFolder([{ id: '0', title: 'Favoritos de Chrome' }]);
});
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
    name: $('bookmarkSectionName').value };
  try {
    // Re-read just this level at import time; do not follow subfolders.
    const { children } = await readBookmarkFolder(chrome.bookmarks, bookmarkPath.at(-1).id);
    if (generation !== bookmarkGeneration || !$('bookmarksDialog').open) return;
    const result = planBookmarkImport(data, children, destination, uid);
    if (result.stats.added) await commit(result.data);
    $('bookmarksDialog').close();
    const s = result.stats;
    showMessage(s.added + ' nuevos importados · ' + s.duplicates + ' repetidos ignorados · ' + s.unsupported + ' URLs no compatibles · ' + s.folders + ' subcarpetas omitidas.');
  } finally {
    if (generation === bookmarkGeneration) {
      bookmarkBusy = false; $('bookmarkImportSubmit').disabled = !bookmarkChildren.some(item => item.url);
    }
  }
});
onClick('restorePrevious', async () => {
  const stored = await chrome.storage.local.get('workspaceDataBackup');
  if (!stored.workspaceDataBackup) throw new Error('Todavía no hay una versión anterior.');
  const candidate = normalizeData(stored.workspaceDataBackup);
  if (!confirm('¿Restaurar la versión anterior? La configuración actual pasará a ser el respaldo local.')) return;
  await commit(candidate); $('settingsDialog').close(); showMessage('Versión anterior restaurada.');
});
$('zipImportInput').onchange = event => run(async () => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > LIMITS.archive) throw new Error('El ZIP supera 64 MB.');
    const candidate = readStoredZip(new Uint8Array(await file.arrayBuffer()));
    if (!confirm('Importar reemplazará tus Workspaces y configuración actuales. Se conservará la versión anterior como respaldo local. ¿Continuar?')) return;
    await commit(candidate); viewMode = 'workspace'; render(); $('settingsDialog').close();
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
onClick('pasteBox', () => $('pasteBox').focus());
onClick('removeThumbnail', () => { pasteGeneration++; imageBusy = false; pastedImage = ''; $('accessThumbnailUrl').value = ''; showPreview(); });
$('accessThumbnailUrl').onchange = () => run(() => { pastedImage = imageUrl($('accessThumbnailUrl').value.trim()); showPreview(); });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && ('workspaceRevision' in changes || 'workspaceData' in changes)) run(reload);
});
chrome.tabs.onUpdated.addListener((_id, change) => { if (change.url || change.status === 'complete') scheduleTabRefresh(); });
chrome.tabs.onCreated.addListener(scheduleTabRefresh);
chrome.tabs.onRemoved.addListener(scheduleTabRefresh);
chrome.tabs.onReplaced.addListener(scheduleTabRefresh);

async function initialize() {
  await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  const snapshot = await repository.load();
  adopt(snapshot); ready = true;
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
}
run(initialize);
