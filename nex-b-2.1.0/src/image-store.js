import { imageUrl, LIMITS, normalizeData } from './model.js';
import { bytesToDataUrl } from './images.js';

export const IMAGE_REF = /^nexb-image:([a-f0-9]{64}):(\d{1,8})$/;
export const isImageRef = value => typeof value === 'string' && IMAGE_REF.test(value);

// Immutable, content-addressed blobs. Metadata commits happen only AFTER blobs persist.
export function createImageStore(factory = globalThis.indexedDB) {
  let database;
  function open() {
    if (!database) database = new Promise((resolve, reject) => {
      const request = factory.open('nexb-images', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('images');
      request.onerror = () => { database = null; reject(request.error); };
      request.onsuccess = () => resolve(request.result);
    });
    return database;
  }
  async function transact(mode, action) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('images', mode);
      const request = action(tx.objectStore('images'));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = tx.onerror = () => reject(tx.error || new Error('No se pudo guardar la imagen.'));
    });
  }
  return {
    async put(value) {
      imageUrl(value);
      const [header, encoded] = value.split(',');
      const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
      const ref = 'nexb-image:' + hash + ':' + bytes.length;
      // Touch staging time when importing again; cleanup cannot race a pending import.
      await transact('readwrite', store => store.put({ blob: new Blob([bytes], { type: header.slice(5, -7) }), createdAt: Date.now() }, ref));
      return ref;
    },
    async get(ref) {
      if (!isImageRef(ref)) throw new Error('Referencia de imagen inválida.');
      const record = await transact('readonly', store => store.get(ref));
      const blob = record?.blob || record;
      if (!blob || blob.size !== Number(ref.split(':')[2])) throw new Error('Falta una imagen local. Conserva tu respaldo ZIP.');
      return blob;
    },
    async prune(keep, before = Date.now() - 7 * 86400000) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('images', 'readwrite');
        const request = tx.objectStore('images').openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          if (!keep.has(cursor.key) && cursor.value.createdAt < before) cursor.delete();
          cursor.continue();
        };
        tx.oncomplete = () => resolve();
        tx.onabort = tx.onerror = () => reject(tx.error);
      });
    },
    async hasAll(refs) {
      if (!refs.length) return true;
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('images', 'readonly');
        let complete = true;
        for (const ref of new Set(refs)) {
          const request = tx.objectStore('images').count(ref);
          request.onsuccess = () => { if (!request.result) complete = false; };
        }
        tx.oncomplete = () => resolve(complete);
        tx.onabort = tx.onerror = () => reject(tx.error);
      });
    }
  };
}

export function imageValues(data) {
  return [data.settings.backgroundImageUrl, ...data.categories.flatMap(c => c.accesses.map(a => a.thumbnail))];
}

export async function mapImages(data, transform) {
  const result = normalizeData(data);
  const seen = new Map();
  const convert = async value => {
    if (!seen.has(value)) seen.set(value, await transform(value));
    return seen.get(value);
  };
  for (const category of result.categories) for (const access of category.accesses) access.thumbnail = await convert(access.thumbnail);
  result.settings.backgroundImageUrl = await convert(result.settings.backgroundImageUrl);
  return result;
}

export async function compactImages(data, store) {
  let budget = 0;
  for (const value of imageValues(data)) {
    if (isImageRef(value)) budget += Number(value.split(':')[2]);
    else if (value.startsWith('data:')) budget += value.length * 3 / 4;
  }
  if (budget > LIMITS.data * 3 / 4) throw new Error('Demasiadas imágenes; reduce la biblioteca antes de guardar.');
  return mapImages(data, value => value.startsWith('data:') ? store.put(value) : value);
}

export async function materializeImages(data, store) {
  return mapImages(data, async value => {
    if (!isImageRef(value)) return value;
    const blob = await store.get(value);
    return bytesToDataUrl(new Uint8Array(await blob.arrayBuffer()), blob.type);
  });
}
