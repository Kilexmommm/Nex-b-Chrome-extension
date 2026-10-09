import { createBackupZip, readStoredZip } from './backup.js';
import { createImageStore, compactImages, materializeImages } from './image-store.js';

self.onmessage = async ({ data: { action, data, bytes } }) => {
  try {
    const images = createImageStore();
    let result;
    if (action === 'import') result = await compactImages(readStoredZip(new Uint8Array(bytes)), images);
    else {
      const portable = await materializeImages(data, images);
      if (action === 'export') result = createBackupZip(portable);
      else if (action === 'json') result = JSON.stringify(portable, null, 2);
      else throw new Error('Operación de respaldo desconocida.');
    }
    self.postMessage({ result });
  } catch (error) { self.postMessage({ error: error.message }); }
};
