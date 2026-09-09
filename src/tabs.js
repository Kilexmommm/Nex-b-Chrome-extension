import { matches, accessUrl } from './model.js';

export async function openOrFocusTab(access, api, locks) {
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
        return api.tabs.create({ url });
      }
      await api.windows.update(existing.windowId, { focused: true });
      return existing;
    }
    return api.tabs.create({ url });
  });
}
