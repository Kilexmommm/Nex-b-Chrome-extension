import { matches, accessUrl } from './model.js';

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
  const result = { opened: 0, focused: 0, failed: 0 };
  const seen = new Set();
  for (const access of accesses) {
    let key;
    try {
      key = accessUrl(access.url);
    } catch {
      result.failed++;
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      const { focused } = await openOrFocusOne(access, api, locks);
      if (focused) result.focused++;
      else result.opened++;
    } catch {
      result.failed++;
    }
  }
  return result;
}
