import { projectSyncData, applyRemoteData, mergeThreeWay } from './sync.js';

export class SyncConflictError extends Error { name = 'SyncConflictError'; }
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function valueAt(base, local, remote) {
  if (equal(local, remote) || equal(remote, base)) return local;
  if (equal(local, base)) return remote;
  throw new SyncConflictError('El mismo dato cambió en dos equipos. Pulsa Sincronizar ahora para elegir qué conservar.');
}
function fields(base, local, remote) {
  const result = {};
  for (const key of new Set([...Object.keys(base || {}), ...Object.keys(local || {}), ...Object.keys(remote || {})])) {
    const value = valueAt(base?.[key], local?.[key], remote?.[key]);
    if (value !== undefined) result[key] = value;
  }
  return result;
}
function entities(base, local, remote) {
  const b = new Map(base.map(x => [x.id, x])), l = new Map(local.map(x => [x.id, x])), r = new Map(remote.map(x => [x.id, x]));
  const result = [];
  for (const id of new Set([...l.keys(), ...r.keys(), ...b.keys()])) {
    let value;
    if (!l.has(id) || !r.has(id) || !b.has(id)) value = valueAt(b.get(id), l.get(id), r.get(id));
    else value = fields(b.get(id), l.get(id), r.get(id));
    if (value) result.push(value);
  }
  return result;
}

// Accesses are merged globally so a move is not mistaken for delete + recreate.
export function mergeWithBase(base, localData, remote) {
  const local = projectSyncData(localData);
  const categories = value => value.categories.map(({ accesses, ...category }) => category);
  const accesses = value => value.categories.flatMap(c => c.accesses.map(a => ({ ...a, categoryId: c.id })));
  const mergedCategories = entities(categories(base), categories(local), categories(remote)).map(c => ({ ...c, accesses: [] }));
  const byCategory = new Map(mergedCategories.map(c => [c.id, c]));
  for (const { categoryId, ...access } of entities(accesses(base), accesses(local), accesses(remote))) {
    if (!byCategory.has(categoryId)) throw new SyncConflictError('Una sección eliminada contiene cambios de otro equipo. Elige qué conservar.');
    byCategory.get(categoryId).accesses.push(access);
  }
  const projection = {
    schemaVersion: 1,
    workspaces: entities(base.workspaces, local.workspaces, remote.workspaces),
    categories: mergedCategories,
    settings: fields(base.settings, local.settings, remote.settings),
    autoTagRules: fields(base.autoTagRules, local.autoTagRules, remote.autoTagRules)
  };
  return applyRemoteData(localData, projection);
}

export function createSyncController({ repository, store, area, locks }) {
  return {
    async run(choice = null) {
      return locks.request('nex-b-state', async () => {
        const prefs = await area.get(['nexbSyncEnabled', 'nexbSyncDirty', 'nexbSyncLastRevision', 'nexbSyncBase', 'nexbSyncParentRevision', 'nexbSyncParentBase']);
        if (!prefs.nexbSyncEnabled) return { message: 'Sincronización desactivada.' };
        let snapshot = await repository.load();
        // Never upload a recovered backup over a possibly newer remote library.
        if (snapshot.recovered) throw new SyncConflictError('Se recuperó el respaldo local. Expórtalo y restaura la versión que quieras conservar antes de sincronizar.');
        const remote = await store.load();
        let next = snapshot.data;
        let upload = !remote || prefs.nexbSyncDirty === true || choice === 'local';
        if (remote && choice !== 'local') {
          if (choice === 'cloud') { next = applyRemoteData(next, remote.data); upload = false; }
          else if (choice === 'merge') { next = mergeThreeWay(next, remote.data, { preferLocal: true }); upload = true; }
          else if (remote.revision !== prefs.nexbSyncLastRevision) {
            if (prefs.nexbSyncDirty || !prefs.nexbSyncLastRevision) {
              if (!prefs.nexbSyncBase) throw new SyncConflictError('Hay datos en ambos equipos sin una revisión común. Pulsa Sincronizar ahora para elegir.');
              next = mergeWithBase(prefs.nexbSyncBase, next, remote.data);
              upload = true;
            } else if (remote.parentRevision !== undefined && remote.parentRevision !== prefs.nexbSyncLastRevision) {
              if (remote.parentRevision !== prefs.nexbSyncParentRevision || !prefs.nexbSyncParentBase) throw new SyncConflictError('Llegó una revisión de otra rama de cambios. Pulsa Sincronizar ahora para elegir qué conservar.');
              next = mergeWithBase(prefs.nexbSyncParentBase, next, remote.data); upload = true;
            } else next = applyRemoteData(next, remote.data);
          }
        }
        const privateIds = new Set(snapshot.data.categories.flatMap(c => c.accesses.filter(a => a.localOnly).map(a => a.id)));
        if (remote?.data.categories.some(c => c.accesses.some(a => privateIds.has(a.id)))) upload = true;
        // Save locally first; quota/network failures keep the combined changes dirty.
        if (!equal(projectSyncData(next), projectSyncData(snapshot.data))) snapshot = await repository.save(next, snapshot.revision, { markDirty: upload });
        const saved = upload ? await store.save(snapshot.data, { parentRevision: remote?.revision || '' }) : remote;
        await area.set({ nexbSyncLastRevision: saved.revision, nexbSyncBase: projectSyncData(snapshot.data), nexbSyncDirty: false, ...(upload ? { nexbSyncParentRevision: remote?.revision || '', nexbSyncParentBase: remote?.data || null } : {}) });
        return { snapshot, message: 'Datos sincronizados. Las imágenes se conservan localmente o en Drive.' };
      });
    }
  };
}
