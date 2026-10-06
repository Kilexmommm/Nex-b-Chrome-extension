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
