export function memoryArea(initial = {}) {
  let state = structuredClone(initial);
  return {
    fail: false, writes: 0,
    async get(keys) {
      if (keys === null) return structuredClone(state);
      return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(k => k in state).map(k => [k, structuredClone(state[k])]));
    },
    async set(values) {
      if (this.fail) throw new Error('Disk failure');
      this.writes++;
      Object.assign(state, structuredClone(values));
    },
    async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete state[key]; },
    async setAccessLevel() {},
  };
}
export function locks() {
  const queues = new Map();
  return {
    request(key, callback) {
      const next = (queues.get(key) || Promise.resolve()).then(callback);
      const quiet = next.catch(() => {});
      queues.set(key, quiet);
      quiet.then(() => { if (queues.get(key) === quiet) queues.delete(key); });
      return next;
    },
    async idle() { while (queues.size) await Promise.all([...queues.values()]); }
  };
}
