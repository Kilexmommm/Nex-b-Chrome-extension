export const UPDATE_MANIFEST_URL = 'https://api.github.com/repos/Kilexmommm/Nex-b-Chrome-extension/releases/latest';
export const UPDATE_COMMAND = 'https://github.com/Kilexmommm/Nex-b-Chrome-extension/releases';
export const UPDATE_CHECK_KEY = 'nexbUpdateCheck';
export const UPDATE_CHECK_INTERVAL = 3 * 60 * 60 * 1000;
export const UPDATE_SNOOZE_KEY = 'nexbUpdateSnooze';
export const UPDATE_SNOOZE_MS = 24 * 60 * 60 * 1000;

// El aviso grande se muestra salvo que el usuario lo haya pospuesto para esta
// misma versión en las últimas 24 horas; una versión aún más nueva vuelve a avisar.
export function shouldShowUpdateDialog(latest, snooze, now = Date.now()) {
  if (!latest) return false;
  if (!snooze || snooze.version !== latest || typeof snooze.until !== 'number') return true;
  return now >= snooze.until;
}

// Compara versiones de Chrome ("2.0.1"): negativo si a < b, 0 si iguales.
export function compareVersions(a, b) {
  const left = String(a).split('.').map(Number), right = String(b).split('.').map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] || 0) - (right[index] || 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}

// Consulta como mucho cada 3 horas la versión publicada como release. Devuelve la
// versión nueva o '' si no hay; un fallo de red nunca interrumpe la app.
export async function checkForUpdate(current, { storage, fetch: request = fetch, now = Date.now() } = {}) {
  let cached = (await storage.get(UPDATE_CHECK_KEY))[UPDATE_CHECK_KEY];
  if (!cached || typeof cached.checkedAt !== 'number' || now - cached.checkedAt >= UPDATE_CHECK_INTERVAL || cached.checkedAt > now) {
    try {
      const response = await request(UPDATE_MANIFEST_URL, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
      if (!response.ok) { await storage.set({ [UPDATE_CHECK_KEY]: { checkedAt: now, latest: current } }); return ''; }
      const latest = String((await response.json()).tag_name || '').replace(/^v/, '');
      if (!/^\d+(\.\d+){0,3}$/.test(latest)) { await storage.set({ [UPDATE_CHECK_KEY]: { checkedAt: now, latest: current } }); return ''; }
      cached = { checkedAt: now, latest };
      await storage.set({ [UPDATE_CHECK_KEY]: cached });
    } catch {
      await storage.set({ [UPDATE_CHECK_KEY]: { checkedAt: now, latest: current } }).catch(() => {});
      return '';
    }
  }
  return compareVersions(cached.latest, current) > 0 ? cached.latest : '';
}
