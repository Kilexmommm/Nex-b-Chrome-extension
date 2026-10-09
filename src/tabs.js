import { matches, accessUrl, matchOrigin, documentMatchKey } from './model.js';

async function openOrFocusOne(access, api, locks) {
  const url = accessUrl(access.url);
  if (url.startsWith('file:') && !await api.extension.isAllowedFileSchemeAccess()) {
    throw new Error('Para abrir archivos y carpetas, ve a chrome://extensions → nex.b → Detalles y activa «Permitir acceso a URLs de archivo». Después abre una nueva pestaña de nex.b.');
  }
  if (!['document', 'domain', 'exact'].includes(access.matchType)) throw new Error('Detección inválida.');
  return locks.request('nex-b-open-tab', async () => {
    const existing = (await api.tabs.query({})).find(tab => matches(access, tab.pendingUrl || tab.url));
    if (existing?.id !== undefined) {
      try {
        await api.tabs.update(existing.id, { active: true });
      } catch (error) {
        // Only create a replacement if the matched tab really disappeared.
        const remaining = await api.tabs.query({});
        if (remaining.some(tab => tab.id === existing.id)) throw error;
        return { tab: await api.tabs.create({ url }), focused: false };
      }
      await api.windows.update(existing.windowId, { focused: true });
      return { tab: existing, focused: true };
    }
    return { tab: await api.tabs.create({ url }), focused: false };
  });
}

export async function openOrFocusTab(access, api, locks) {
  return (await openOrFocusOne(access, api, locks)).tab;
}

// Abre todos los accesos de una sección en orden, enfocando los que ya están
// abiertos. Deduplica por URL normalizada y no aborta si un acceso falla.
export async function openOrFocusMany(accesses, api, locks) {
  return locks.request('nex-b-open-tab', async () => {
    const result = { opened: 0, focused: 0, failed: 0 };
    const index = { exact: new Map(), domain: new Map(), document: new Map() };
    function add(tab) {
      try {
        const url = accessUrl(tab.pendingUrl || tab.url);
        if (!index.exact.has(url)) index.exact.set(url, tab);
        if (url.startsWith('file:')) return;
        for (const [type, key] of [['domain', matchOrigin(url)], ['document', documentMatchKey(url)]]) if (!index[type].has(key)) index[type].set(key, tab);
      } catch { /* Browser-internal tabs are not saved accesses. */ }
    }
    (await api.tabs.query({})).forEach(add);
    const seen = new Set();
    for (const access of accesses) {
      try {
        const url = accessUrl(access.url);
        if (seen.has(url)) continue;
        seen.add(url);
        if (!['document', 'domain', 'exact'].includes(access.matchType)) throw new Error('Detección inválida.');
        if (url.startsWith('file:') && !await api.extension.isAllowedFileSchemeAccess()) throw new Error('Sin permiso local.');
        const type = url.startsWith('file:') ? 'exact' : access.matchType;
        const key = type === 'exact' ? url : type === 'domain' ? matchOrigin(url) : documentMatchKey(url);
        if (index[type].has(key)) { result.focused++; continue; }
        // Existing discarded tabs remain asleep; new pages open without focus stealing.
        const tab = await api.tabs.create({ url, active: false });
        add({ ...tab, pendingUrl: tab.pendingUrl || url });
        result.opened++;
      } catch { result.failed++; }
    }
    return result;
  });
}

// Abre todos los accesos de una sección en una ventana nueva y los agrupa con
// un grupo nativo de Chrome titulado con el Workspace y la sección. Deduplica
// por URL normalizada, omite los accesos inválidos o sin permiso file:// y no
// aborta el resto. Devuelve el recuento, los identificadores creados y el
// estado explícito del grupo para no confirmar una agrupación que falló.
export async function openSectionInNewWindow(accesses, title, api, locks) {
  const urls = [];
  const seen = new Set();
  let failed = 0;
  for (const access of accesses || []) {
    let url;
    try {
      url = accessUrl(access.url);
    } catch {
      failed++;
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  // Sin permiso de file:// esas pestañas se omiten, como en la apertura en lote.
  if (urls.some(url => url.startsWith('file:')) && !await api.extension.isAllowedFileSchemeAccess()) {
    for (let index = urls.length - 1; index >= 0; index--) {
      if (urls[index].startsWith('file:')) { urls.splice(index, 1); failed++; }
    }
  }
  if (!urls.length) return { opened: 0, failed, windowId: null, groupId: null, grouped: false, titled: false };
  return locks.request('nex-b-open-tab', async () => {
    const created = await api.windows.create({ url: urls, focused: true });
    const windowId = Number.isInteger(created?.id) ? created.id : null;
    let tabs = Array.isArray(created?.tabs) ? created.tabs : [];
    if (windowId !== null && !tabs.length) tabs = await api.tabs.query({ windowId }).catch(() => []);
    const tabIds = tabs.map(tab => tab.id).filter(Number.isInteger);
    // Las pestañas ya están abiertas: cualquier fallo de agrupación o de título
    // se refleja en `grouped`/`titled` sin cerrar ni duplicar nada.
    let groupId = null;
    let grouped = false;
    let titled = false;
    if (windowId !== null && tabIds.length && typeof api.tabs.group === 'function') {
      try {
        groupId = await api.tabs.group({ tabIds, createProperties: { windowId } });
        grouped = Number.isInteger(groupId);
      } catch {
        groupId = null;
        grouped = false;
      }
      const cleanTitle = String(title || '').trim();
      if (grouped && cleanTitle && typeof api.tabGroups?.update === 'function') {
        try {
          await api.tabGroups.update(groupId, { title: cleanTitle });
          titled = true;
        } catch {
          titled = false;
        }
      }
    }
    return { opened: urls.length, failed, windowId, groupId, grouped, titled };
  });
}
