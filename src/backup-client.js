export function backupTask(action, data, bytes) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./backup-worker.js', import.meta.url), { type: 'module' });
    const finish = (callback, result) => { clearTimeout(timer); worker.terminate(); callback(result); };
    const timer = setTimeout(() => finish(reject, new Error('El respaldo tardó demasiado. Inténtalo de nuevo.')), 120000);
    worker.onmessage = ({ data }) => data.error ? finish(reject, new Error(data.error)) : finish(resolve, data.result);
    worker.onerror = () => finish(reject, new Error('No se pudo procesar el respaldo.'));
    worker.postMessage({ action, data, bytes }, bytes ? [bytes] : []);
  });
}
