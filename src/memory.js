// No automatic suspension: users select tabs after reviewing unsaved work.
export function canDiscard(tab, excludedHosts = []) {
  if (!tab || tab.active || tab.pinned || tab.audible || tab.discarded || tab.pendingUrl || tab.status === 'loading' || tab.autoDiscardable === false) return false;
  try {
    const url = new URL(tab.url);
    return ['http:', 'https:'].includes(url.protocol) && !excludedHosts.some(host => url.hostname === host || url.hostname.endsWith('.' + host));
  } catch { return false; }
}

export function parseExcludedHosts(value) {
  const hosts = [...new Set(value.split(/[\s,]+/).filter(Boolean).map(raw => {
    const url = new URL(raw.includes('://') ? raw : 'https://' + raw);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port || !url.hostname) throw new Error('Usa dominios válidos para las exclusiones.');
    return url.hostname.toLowerCase();
  }))];
  if (hosts.length > 100) throw new Error('Máximo 100 dominios protegidos.');
  return hosts;
}

export async function discardSelected(tabs, api, excludedHosts = []) {
  const result = { discarded: 0, skipped: 0, failed: 0 };
  for (const selected of tabs) {
    try {
      const current = await api.get(selected.id);
      if (current.url !== selected.url || !canDiscard(current, excludedHosts)) { result.skipped++; continue; }
      const discarded = await api.discard(current.id);
      if (discarded?.discarded) result.discarded++; else result.failed++;
    } catch { result.failed++; }
  }
  return result;
}
