export const UPDATE_MANIFEST_URL = 'https://raw.githubusercontent.com/Kilexmommm/Nex-b-Chrome-extension/main/manifest.json';
export const UPDATE_COMMAND = 'curl -fsSL https://raw.githubusercontent.com/Kilexmommm/Nex-b-Chrome-extension/main/install.sh | bash';
export const UPDATE_CHECK_KEY = 'nexbUpdateCheck';
export const UPDATE_CHECK_INTERVAL = 24 * 60 * 60 * 1000;

// Compara versiones de Chrome ("2.0.1"): negativo si a < b, 0 si iguales.
export function compareVersions(a, b) {
  const left = String(a).split('.').map(Number), right = String(b).split('.').map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] || 0) - (right[index] || 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}

// Consulta como mucho una vez al día la versión publicada en main. Devuelve la
// versión nueva o '' si no hay; un fallo de red nunca interrumpe la app.
export async function checkForUpdate(current, { storage, fetch: request = fetch, now = Date.now() } = {}) {
  let cached = (await storage.get(UPDATE_CHECK_KEY))[UPDATE_CHECK_KEY];
  if (!cached || typeof cached.checkedAt !== 'number' || now - cached.checkedAt >= UPDATE_CHECK_INTERVAL || cached.checkedAt > now) {
    try {
      const response = await request(UPDATE_MANIFEST_URL, { cache: 'no-store' });
      if (!response.ok) return '';
      const latest = String((await response.json()).version || '');
      if (!/^\d+(\.\d+){0,3}$/.test(latest)) return '';
      cached = { checkedAt: now, latest };
      await storage.set({ [UPDATE_CHECK_KEY]: cached });
    } catch {
      return '';
    }
  }
  return compareVersions(cached.latest, current) > 0 ? cached.latest : '';
}
