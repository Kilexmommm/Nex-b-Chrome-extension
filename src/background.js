import { webUrl } from './model.js';
import { resizeImage } from './images.js';
import { validateRecapture, recaptureKey, RECAPTURE_TTL } from './recapture.js';

const PAGE = 'workspace-add-page';
const LINK = 'workspace-add-link';
const ACTION = 'workspace-add-site';
const UPDATE_CAPTURE = 'workspace-update-capture';
const TTL = 30 * 60 * 1000;

function createMenu(properties) {
  return new Promise((resolve, reject) => {
    chrome.contextMenus.create(properties, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    });
  });
}

async function install() {
  await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  await chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  await chrome.contextMenus.removeAll();
  await createMenu({ id: PAGE, title: 'Agregar página al acceso', contexts: ['page'], documentUrlPatterns: ['http://*/*', 'https://*/*'] });
  await createMenu({ id: LINK, title: 'Agregar enlace al acceso', contexts: ['link'], targetUrlPatterns: ['http://*/*', 'https://*/*'] });
  await createMenu({ id: ACTION, title: 'Agregar sitio a NEX.B', contexts: ['action'] });
  await createMenu({ id: UPDATE_CAPTURE, title: 'Actualizar captura del acceso', contexts: ['page', 'action'] });
}

async function capture(tab, manual = false) {
  const { captureEnabled = true } = await chrome.storage.local.get('captureEnabled');
  if (!captureEnabled && !manual) return { thumbnail: '', notice: 'Captura automática desactivada. Puedes pegar una imagen.' };
  try {
    const [before] = await chrome.tabs.query({ active: true, windowId: tab.windowId });
    if (before?.id !== tab.id || before.url !== tab.url) throw new Error('La pestaña cambió.');
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 75 });
    const [after] = await chrome.tabs.query({ active: true, windowId: tab.windowId });
    if (after?.id !== tab.id || after.url !== tab.url) throw new Error('La pestaña cambió.');
    const bytes = Uint8Array.from(atob(dataUrl.split(',')[1]), c => c.charCodeAt(0));
    const thumbnail = await resizeImage(new Blob([bytes], { type: 'image/jpeg' }));
    if (thumbnail.length > 700000) throw new Error('Captura demasiado grande.');
    return { thumbnail, notice: 'Captura de la página visible. Revisa que no contenga datos privados antes de guardar.' };
  } catch {
    return { thumbnail: '', notice: 'No se pudo capturar la pestaña. Puedes pegar una captura manualmente.' };
  }
}

async function addDraft(rawUrl, title, tab, isLink, recapture = null) {
  const url = webUrl(rawUrl);
  await navigator.locks.request('nex-b-drafts', async () => {
    const existing = await chrome.storage.session.get(null);
    const expired = Object.entries(existing).filter(([key, value]) => (key.startsWith('draft:') || key.startsWith('recapture:')) && Date.now() - value.createdAt > TTL).map(([key]) => key);
    if (expired.length) await chrome.storage.session.remove(expired);
    const live = Object.keys(existing).filter(key => key.startsWith('draft:') && !expired.includes(key));
    if (live.length >= 8) throw new Error('Hay 8 accesos pendientes. Guarda o cancela uno antes de agregar otro.');
    const image = isLink ? { thumbnail: '', notice: 'Se agregó el enlace sin capturar la página de origen. Puedes pegar su miniatura.' } : await capture(tab, Boolean(recapture));
    const id = crypto.randomUUID();
    const key = 'draft:' + id;
    const target = recapture ? { accessId: recapture.accessId, targetUrl: recapture.url } : {};
    await chrome.storage.session.set({ [key]: { url, title: String(title || 'Nuevo acceso').slice(0, 300), ...image, ...target, createdAt: Date.now() } });
    try { await chrome.tabs.create({ url: chrome.runtime.getURL('newtab.html') + '?draft=' + id }); }
    catch (error) { await chrome.storage.session.remove(key); throw error; }
  });
}

async function handlePageAction(tab, pageUrl = tab.url, requireRecapture = false) {
  // Serialize repeated icon clicks for this tab, including request consumption.
  await navigator.locks.request('nex-b-recapture-' + tab.id, async () => {
    const key = recaptureKey(tab.id);
    const request = (await chrome.storage.session.get(key))[key];
    if (request) {
      if (!Number.isFinite(request.createdAt) || Date.now() - request.createdAt > RECAPTURE_TTL) {
        await chrome.storage.session.remove(key);
        await chrome.action.setBadgeText({ tabId: tab.id, text: '' });
      }
      validateRecapture(request, tab);
      await addDraft(tab.url, tab.title, tab, false, request);
      await chrome.storage.session.remove(key);
      await chrome.action.setBadgeText({ tabId: tab.id, text: '' });
      await chrome.action.setTitle({ tabId: tab.id, title: 'nex.b' });
    } else {
      if (requireRecapture) throw new Error('Primero elige Capturar imagen en la tarjeta de nex.b y abre el sitio desde allí.');
      await addDraft(pageUrl, tab.title, tab, false);
    }
  });
}
async function openHome() {
  const url = chrome.runtime.getURL('newtab.html');
  const [existing] = await chrome.tabs.query({ url: url + '*' });
  if (existing?.id) {
    await chrome.tabs.update(existing.id, { active: true });
    if (Number.isInteger(existing.windowId) && chrome.windows?.update) await chrome.windows.update(existing.windowId, { focused: true });
  } else await chrome.tabs.create({ url });
}

function reportFailure(error) {
  chrome.action.setBadgeText({ text: '!' }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ color: '#a32929' }).catch(() => {});
  chrome.action.setTitle({ title: 'nex.b: ' + (error.message || 'No se pudo agregar el acceso.') }).catch(() => {});
}

// Top-level listeners are registered synchronously; no timers keep the worker alive.
chrome.runtime.onInstalled.addListener(() => { install().catch(reportFailure); });
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (![PAGE, LINK, ACTION, UPDATE_CAPTURE].includes(info.menuItemId) || !tab) return;
  const isLink = info.menuItemId === LINK;
  if (isLink) addDraft(info.linkUrl, 'Nuevo acceso', tab, true).catch(reportFailure);
  else handlePageAction(tab, info.pageUrl || tab.url, info.menuItemId === UPDATE_CAPTURE).catch(reportFailure);
});
chrome.action.onClicked.addListener(tab => {
  chrome.action.setBadgeText({ text: '' }).catch(() => {});
  openHome().catch(reportFailure);
});
chrome.tabs.onRemoved.addListener(tabId => {
  chrome.storage.session.remove(recaptureKey(tabId)).catch(reportFailure);
});
