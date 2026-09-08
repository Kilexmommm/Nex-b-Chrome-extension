import { normalizeData } from './model.js';

export class ConflictError extends Error {
  constructor() { super('Otra pestaña cambió los datos. Tu formulario sigue abierto. Copia lo que necesites, cancela y vuelve a editar con los datos actualizados.'); }
}

// Every extension-page writer must use this shared origin lock and revision check.
export function createRepository(area, locks) {
  async function load() {
    const stored = await area.get(['workspaceData', 'workspaceDataBackup', 'workspaceRevision']);
    const revision = stored.workspaceRevision ?? 0;
    if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Revisión de datos inválida; exporta una copia antes de reparar.');
    if (stored.workspaceData === undefined && stored.workspaceDataBackup === undefined) {
      return { data: normalizeData(), revision, recovered: false };
    }
    try {
      if (stored.workspaceData === undefined) throw new Error('Falta la configuración actual.');
      return { data: normalizeData(stored.workspaceData), revision, recovered: false };
    } catch (cause) {
      try {
        if (stored.workspaceDataBackup === undefined) throw cause;
        return { data: normalizeData(stored.workspaceDataBackup), revision, recovered: true };
      } catch {
        throw new Error('La configuración y su copia no son válidas. No se han sobrescrito. Conserva los datos originales antes de repararlos.', { cause });
      }
    }
  }
  async function save(candidate, expectedRevision) {
    const validated = normalizeData(candidate);
    return locks.request('nex-b-storage', async () => {
      const previous = await load();
      if (previous.revision !== expectedRevision) throw new ConflictError();
      const revision = previous.revision + 1;
      await area.set({ workspaceData: validated, workspaceDataBackup: previous.data, workspaceRevision: revision, captureEnabled: validated.settings.captureEnabled });
      return { data: validated, revision, recovered: false };
    });
  }
  return { load, save };
}
