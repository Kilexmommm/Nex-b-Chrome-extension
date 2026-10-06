// Persistent failures stop; transient failures get at most five spaced retries.
export function syncRetryDelay(error, failures) {
  if (error?.name === 'SyncQuotaError' || error?.name === 'SyncCorruptError' || failures > 5) return null;
  return Math.min(300000, 5000 * 2 ** Math.max(0, failures - 1));
}
