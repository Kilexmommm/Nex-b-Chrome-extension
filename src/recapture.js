import { matches, webUrl } from './model.js';
import { openOrFocusTab } from './tabs.js';

export const RECAPTURE_TTL = 30 * 60 * 1000;
export const recaptureKey = tabId => 'recapture:' + tabId;

export async function prepareRecapture(access, api, locks) {
  const tab = await openOrFocusTab(access, api, locks);
  if (!Number.isInteger(tab?.id)) throw new Error('No se pudo identificar la pestaña para capturar.');
  await api.storage.session.set({ [recaptureKey(tab.id)]: {
    accessId: access.id, url: webUrl(access.url), matchType: access.matchType, createdAt: Date.now()
  } });
  // This is only a cue. Capturing still requires the user's click on the site.
  await api.action.setBadgeText({ tabId: tab.id, text: '↻' }).catch(() => {});
  await api.action.setTitle({ tabId: tab.id, title: 'Capturar miniatura de ' + access.title }).catch(() => {});
  return tab;
}

export function validateRecapture(request, tab, now = Date.now()) {
  if (!request || typeof request.accessId !== 'string' || !Number.isFinite(request.createdAt) ||
      now - request.createdAt > RECAPTURE_TTL || request.createdAt > now) {
    throw new Error('La solicitud de captura venció. Iníciala de nuevo desde el acceso.');
  }
  webUrl(request.url);
  if (!['document', 'exact', 'domain'].includes(request.matchType) || !matches(request, tab.url)) {
    throw new Error('Esta página no corresponde al acceso que querías capturar. Vuelve al sitio y pulsa NEX.B.');
  }
  return request;
}

export function findRecaptureTarget(data, pending) {
  for (const category of data.categories) {
    const access = category.accesses.find(a => a.id === pending.accessId);
    if (!access) continue;
    if (webUrl(access.url) !== webUrl(pending.targetUrl)) {
      throw new Error('La URL del acceso cambió. Inicia otra captura; no se ha reemplazado nada.');
    }
    return { access, category };
  }
  throw new Error('El acceso original ya no existe. No se ha creado un duplicado.');
}
