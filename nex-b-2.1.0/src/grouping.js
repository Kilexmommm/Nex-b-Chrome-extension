// Lógica pura para agrupar pestañas en grupos nativos de Chrome (tab groups).
// No usa la API de Chrome: recibe pestañas y grupos como datos para poder probarla.

// Colores que acepta chrome.tabGroups.update.
export const GROUP_COLORS = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange', 'grey'];
export const MIN_GROUP_TABS = 2;

const titleKey = title => String(title || '').trim().toLocaleLowerCase();

function hostOf(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

// Etiqueta de grupo para una URL con el mismo criterio de coincidencia que los
// tags automáticos (dominio exacto o subdominio). Si coinciden varias reglas gana
// la más específica (mail.google.com = Gmail antes que google.com = Google).
// Sin regla, se usa el dominio sin «www.». Devuelve '' si no es http/https.
export function groupTitleForUrl(url, rules = {}) {
  const host = hostOf(url);
  if (!host) return '';
  let best = null;
  for (const [domain, tag] of Object.entries(rules || {})) {
    const rule = String(domain).toLowerCase();
    if (!String(tag).trim() || !(host === rule || host.endsWith('.' + rule))) continue;
    if (!best || rule.length > best.rule.length) best = { rule, tag: String(tag).trim() };
  }
  return best ? best.tag : host;
}

// Color estable derivado del nombre: el mismo título siempre recibe el mismo color.
export function groupColorFor(title) {
  let hash = 0;
  for (const char of titleKey(title)) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  return GROUP_COLORS[hash % GROUP_COLORS.length];
}

const NO_GROUP = -1;
const groupIdOf = tab => (Number.isInteger(tab.groupId) ? tab.groupId : NO_GROUP);

function findExistingGroup(groups, windowId, title) {
  const key = titleKey(title);
  return groups.find(group => group.windowId === windowId && titleKey(group.title) === key) || null;
}

// Propone grupos a partir de las pestañas abiertas.
// - Solo pestañas http/https, no fijadas y de ventanas normales (si se indica windowType).
// - Agrupa por ventana (los grupos de Chrome pertenecen a una ventana); con
//   targetWindowId todas se tratan como si ya estuvieran en esa ventana.
// - Solo propone un grupo si reúne al menos minTabs pestañas, o si ya existe un
//   grupo con ese título en la ventana y hay pestañas que añadirle.
// - Omite propuestas donde todas las pestañas ya están en su grupo.
export function proposeTabGroups(tabs, rules = {}, { existingGroups = [], targetWindowId = null, minTabs = MIN_GROUP_TABS, extensionOrigin = '' } = {}) {
  const buckets = new Map();
  for (const tab of tabs || []) {
    if (!Number.isInteger(tab?.id) || tab.pinned) continue;
    if (tab.windowType && tab.windowType !== 'normal') continue;
    const url = tab.url || tab.pendingUrl || '';
    if (extensionOrigin && url.startsWith(extensionOrigin)) continue;
    const title = groupTitleForUrl(url, rules);
    if (!title) continue;
    const windowId = targetWindowId ?? tab.windowId;
    const key = windowId + '\u0000' + titleKey(title);
    if (!buckets.has(key)) buckets.set(key, { key, title, windowId, tabs: [] });
    buckets.get(key).tabs.push(tab);
  }
  const proposals = [];
  for (const bucket of buckets.values()) {
    const existing = findExistingGroup(existingGroups, bucket.windowId, bucket.title);
    const pending = bucket.tabs.filter(tab => !existing || groupIdOf(tab) !== existing.id || tab.windowId !== bucket.windowId);
    if (!pending.length) continue;
    if (!existing && bucket.tabs.length < minTabs) continue;
    proposals.push({
      key: bucket.key,
      title: existing ? String(existing.title).trim() || bucket.title : bucket.title,
      windowId: bucket.windowId,
      tabIds: bucket.tabs.map(tab => tab.id),
      pendingTabIds: pending.map(tab => tab.id),
      existingGroupId: existing ? existing.id : null,
      color: existing?.color || groupColorFor(bucket.title)
    });
  }
  return proposals.sort((a, b) => b.tabIds.length - a.tabIds.length || a.title.localeCompare(b.title));
}

// Convierte las propuestas elegidas (con el título que haya escrito el usuario)
// en acciones concretas: reutilizar un grupo existente con ese título en la
// ventana o crear uno nuevo. Fusiona propuestas que acaben con el mismo título
// en la misma ventana y no repite pestañas.
export function planGroupActions(selected, existingGroups = [], { minTabs = MIN_GROUP_TABS } = {}) {
  const merged = new Map();
  const used = new Set();
  for (const proposal of selected || []) {
    const title = String(proposal.title || '').trim();
    if (!title) continue;
    const key = proposal.windowId + '\u0000' + titleKey(title);
    if (!merged.has(key)) merged.set(key, { title, windowId: proposal.windowId, tabIds: [] });
    const entry = merged.get(key);
    for (const id of proposal.tabIds || []) {
      if (!Number.isInteger(id) || used.has(id)) continue;
      used.add(id);
      entry.tabIds.push(id);
    }
  }
  const actions = [];
  for (const entry of merged.values()) {
    const existing = findExistingGroup(existingGroups, entry.windowId, entry.title);
    if (!entry.tabIds.length) continue;
    if (!existing && entry.tabIds.length < minTabs) continue;
    actions.push({
      title: entry.title,
      windowId: entry.windowId,
      tabIds: entry.tabIds,
      groupId: existing ? existing.id : null,
      color: existing ? null : groupColorFor(entry.title)
    });
  }
  return actions;
}

// Resumen legible del resultado de agrupar.
export function groupingSummary({ created = 0, reused = 0, tabs = 0 } = {}) {
  if (!created && !reused) return 'No había pestañas que agrupar.';
  const parts = [];
  if (created) parts.push(created + (created === 1 ? ' grupo creado' : ' grupos creados'));
  if (reused) parts.push(reused + (reused === 1 ? ' grupo reutilizado' : ' grupos reutilizados'));
  return parts.join(' y ') + ' · ' + tabs + (tabs === 1 ? ' pestaña agrupada.' : ' pestañas agrupadas.');
}
