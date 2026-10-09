import { normalizeData } from './model.js';
import { compactImages, imageValues, isImageRef } from './image-store.js';

export class ConflictError extends Error {
  constructor() { super('Otra pestaña cambió los datos. Tu formulario sigue abierto. Copia lo que necesites, cancela y vuelve a editar con los datos actualizados.'); }
}

// Every extension-page writer must use this shared origin lock and revision check.
export function createRepository(area, locks, images = null) {
  async function decode(value) {
    if (value?.imageStorageVersion === 1) value = value.data;
    const data = normalizeData(value);
    const refs = imageValues(data).filter(isImageRef);
    if (refs.length && (!images || !await images.hasAll(refs))) throw new Error('Faltan imágenes locales.');
    return data;
  }
  const pack = value => images ? { imageStorageVersion: 1, data: value } : value;
  async function loadBackup() {
    const stored = await area.get('workspaceDataBackup');
    if (stored.workspaceDataBackup === undefined) throw new Error('Todavía no hay una versión anterior.');
    return decode(stored.workspaceDataBackup);
  }
  async function load() {
    const stored = await area.get(['workspaceData', 'workspaceRevision']);
    const revision = stored.workspaceRevision ?? 0;
    if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Revisión de datos inválida; exporta una copia antes de reparar.');
    if (stored.workspaceData === undefined) {
      const backup = await area.get('workspaceDataBackup');
      if (backup.workspaceDataBackup === undefined) return { data: normalizeData(), revision, recovered: false };
    }
    try {
      if (stored.workspaceData === undefined) throw new Error('Falta la configuración actual.');
      return { data: await decode(stored.workspaceData), revision, recovered: false };
    } catch (cause) {
      try {
        return { data: await loadBackup(), revision, recovered: true };
      } catch {
        throw new Error('La configuración y su copia no son válidas. No se han sobrescrito. Conserva los datos originales antes de repararlos.', { cause });
      }
    }
  }
  async function save(candidate, expectedRevision, { markDirty = false } = {}) {
    let validated = normalizeData(candidate);
    return locks.request('nex-b-storage', async () => {
      const previous = await load();
      if (previous.revision !== expectedRevision) throw new ConflictError();
      if (images) validated = await compactImages(validated, images);
      const previousData = images ? await compactImages(previous.data, images) : previous.data;
      const revision = previous.revision + 1;
      await area.set({ workspaceData: pack(validated), workspaceDataBackup: pack(previousData), workspaceRevision: revision, captureEnabled: validated.settings.captureEnabled, ...(markDirty ? { nexbSyncDirty: true } : {}) });
      // Preserve current + rollback images; recent imports have a seven-day grace period.
      // Cleanup failure must never turn a successful metadata commit into a failed save.
      if (images?.prune) {
        try {
          const { nexbImageCleanupAt = 0 } = await area.get('nexbImageCleanupAt');
          if (Date.now() - nexbImageCleanupAt > 86400000) {
            await images.prune(new Set([...imageValues(validated), ...imageValues(previousData)].filter(isImageRef)));
            await area.set({ nexbImageCleanupAt: Date.now() });
          }
        } catch { /* Retain unused blobs and try again on a later save. */ }
      }
      return { data: validated, revision, recovered: false };
    });
  }
  async function migrate() {
    if (!images) return;
    await locks.request('nex-b-storage', async () => {
      const stored = await area.get(['workspaceData', 'workspaceDataBackup']);
      const changes = {};
      for (const key of ['workspaceData', 'workspaceDataBackup']) {
        if (stored[key] === undefined || stored[key]?.imageStorageVersion === 1) continue;
        // A corrupt legacy copy is left untouched so load() can recover normally.
        let valid;
        try { valid = normalizeData(stored[key]); } catch { continue; }
        changes[key] = pack(await compactImages(valid, images));
      }
      if (Object.keys(changes).length) await area.set(changes);
    });
  }
  return { load, save, loadBackup, migrate };
}
