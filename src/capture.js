export const MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND = 2;
export const CAPTURE_PAINT_DELAY_MS = 600;
export const CAPTURE_BATCH_SIZE = 5;

export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function destinationMatches(url, target) {
  try {
    const current = new URL(url), wanted = new URL(target);
    return current.origin === wanted.origin && current.pathname === wanted.pathname;
  } catch {
    return false;
  }
}

// Wait until the tab actually navigated to the target. A `complete` left over
// from about:blank or the previous capture is not enough: only a matching URL
// or a real navigation (loading event after update) followed by an http(s)
// page counts. That also tolerates redirects. `navigate` runs after the
// listener is attached so the new navigation's loading event is never missed.
export function waitForCaptureTab(api, tabId, targetUrl, { timeout = 20000, navigate = null } = {}) {
  return new Promise((resolve, reject) => {
    let timer;
    let settled = false;
    let navigating = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      api.onUpdated.removeListener(onUpdated);
      callback(value);
    };
    const accept = tab => {
      const url = tab && tab.url ? tab.url : '';
      if (!/^https?:/i.test(url)) return false;
      return navigating || destinationMatches(url, targetUrl);
    };
    const onUpdated = (updatedId, changeInfo, tab) => {
      if (updatedId !== tabId) return;
      if (changeInfo.status === 'loading') { navigating = true; return; }
      if (changeInfo.status === 'complete' && accept(tab)) finish(resolve, tab);
    };
    api.onUpdated.addListener(onUpdated);
    timer = setTimeout(() => finish(reject, new Error('La página tardó demasiado en cargar.')), timeout);
    api.get(tabId).then(tab => {
      if (tab && (tab.status === 'loading' || destinationMatches(tab.pendingUrl || '', targetUrl))) navigating = true;
      // With `navigate`, this snapshot predates the navigation: only events may resolve.
      if (!navigate && tab?.status === 'complete' && accept(tab)) finish(resolve, tab);
    }).catch(error => finish(reject, error));
    if (navigate) navigate().catch(error => finish(reject, error));
  });
}

// Reserves a capture slot so we never exceed Chrome's 2 calls per second.
export function createCaptureThrottle(maxPerSecond = MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND, { now = () => Date.now(), sleep = delay } = {}) {
  const minInterval = 1000 / maxPerSecond;
  let lastCall = -Infinity;
  return async function waitTurn() {
    const elapsed = now() - lastCall;
    if (elapsed < minInterval) await sleep(minInterval - elapsed);
    lastCall = now();
  };
}

export function findAccess(data, accessId) {
  for (const category of data.categories) {
    const access = category.accesses.find(item => item.id === accessId);
    if (access) return access;
  }
  return null;
}

// Groups thumbnails and saves every `batchSize` captures. Each save clones the
// current data and only fills accesses that still exist and lack a thumbnail.
export function createBatchCommitter({ load, save, batchSize = CAPTURE_BATCH_SIZE, clone = structuredClone }) {
  let pending = new Map();
  const commitPending = async () => {
    if (!pending.size) return false;
    const batch = [...pending];
    pending = new Map();
    const candidate = clone(load());
    for (const [accessId, thumbnail] of batch) {
      const access = findAccess(candidate, accessId);
      if (!access || access.thumbnail) continue;
      access.thumbnail = thumbnail;
    }
    await save(candidate);
    return true;
  };
  return {
    async add(accessId, thumbnail) {
      pending.set(accessId, thumbnail);
      if (pending.size >= batchSize) await commitPending();
    },
    async flush() { return commitPending(); },
    get pending() { return pending.size; }
  };
}
