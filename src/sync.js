import { normalizeData } from './model.js';

export const SYNC_MANIFEST_KEY = 'nexb.sync.manifest';
export const SYNC_CHUNK_PREFIX = 'nexb.sync.chunk.';
export const SYNC_CHUNK_BYTES = 6000;
// La copia remota se puede leer pero no es válida (fragmentos mezclados, suma de
// control distinta o datos que no pasan la validación). La local es la fiable.
export class SyncCorruptError extends Error { name = 'SyncCorruptError'; }
export class SyncQuotaError extends Error { name = 'SyncQuotaError'; }

export const SYNC_QUOTA = Object.freeze({
  QUOTA_BYTES: 102400,
  QUOTA_BYTES_PER_ITEM: 8192,
  MAX_ITEMS: 512
});

function base64Encode(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

function base64Decode(value) {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function checksum(value) {
  let sum = 0;
  for (let index = 0; index < value.length; index += 1) sum = (sum + value.charCodeAt(index)) & 0xffff;
  return sum;
}

function localImages(data) {
  return new Map(data.categories.flatMap(category => category.accesses.map(access => [access.id, access.thumbnail || ''])));
}

export function projectSyncData(data) {
  const { backgroundImageUrl, ...settings } = data.settings;
  return {
    schemaVersion: 1,
    workspaces: data.workspaces.map(({ id, name, type }) => ({ id, name, type })),
    categories: data.categories.map(category => ({
      id: category.id,
      name: category.name,
      workspaceId: category.workspaceId,
      parentId: category.parentId,
      ...(category.bookmarkFolderId ? { bookmarkFolderId: category.bookmarkFolderId, bookmarkFolderTitle: category.bookmarkFolderTitle || '' } : {}),
      accesses: category.accesses.filter(access => !access.localOnly).map(access => {
        const { thumbnail, bookmarkMissing, ...metadata } = access;
        return metadata;
      })
    })),
    settings,
    autoTagRules: { ...data.autoTagRules }
  };
}

// Thumbnail size is a local layout preference; stale sync metadata must not undo it.
function keepLocalLayout(settings, localSettings) {
  settings.thumbnailSize = localSettings.thumbnailSize;
  settings.thumbnailHeight = localSettings.thumbnailHeight;
  settings.remoteImagesEnabled = localSettings.remoteImagesEnabled;
}

function mergeById(localList, remoteList, preferLocal) {
  const remoteById = new Map((remoteList ?? []).map(item => [item.id, item]));
  const seen = new Set();
  const result = [];
  for (const item of localList ?? []) {
    seen.add(item.id);
    if (remoteById.has(item.id) && !preferLocal) result.push(remoteById.get(item.id));
    else result.push(item);
  }
  for (const item of remoteList ?? []) {
    if (!seen.has(item.id)) result.push(item);
  }
  return result;
}

function validRemote(value) {
  try { return normalizeData(value); }
  catch (cause) { throw new SyncCorruptError('La configuración sincronizada no es válida: ' + cause.message, { cause }); }
}

// Combina dos bibliotecas por identificador: workspaces, categorías y accesos.
// Un elemento presente en un solo lado se conserva (unión). Si el mismo id existe
// en ambos, gana el remoto salvo que `preferLocal` sea true (hay cambios locales
// pendientes de subir), en cuyo caso gana el local. Las miniaturas locales nunca
// viajan por sync y se conservan siempre. El resultado se valida con normalizeData.
// Limitación: la unión no detecta borrados concurrentes; si en "merge" un equipo
// eliminó un acceso que el otro conserva, el acceso puede reaparecer al combinarse.
export function mergeThreeWay(local, remote, { preferLocal = false } = {}) {
  if (!remote || remote.schemaVersion !== 1) throw new SyncCorruptError('La configuración sincronizada no es compatible.');
  const images = localImages(local);
  // Un acceso movido de categoría existe en ambos lados con el mismo id pero en
  // categorías distintas: solo se conserva en la categoría del lado que gana.
  const idsOf = library => new Set(library.categories.flatMap(category => category.accesses.map(access => access.id)));
  const winnerIds = preferLocal ? idsOf(local) : idsOf(remote);
  const workspaces = mergeById(local.workspaces, remote.workspaces, preferLocal);
  const categories = mergeById(local.categories, remote.categories, preferLocal).map(category => {
    const remoteCategory = remote.categories.find(item => item.id === category.id);
    const localCategory = local.categories.find(item => item.id === category.id);
    const localHere = new Set((localCategory?.accesses ?? []).map(access => access.id));
    const remoteHere = new Set((remoteCategory?.accesses ?? []).map(access => access.id));
    const loserHere = preferLocal ? remoteHere : localHere, winnerHere = preferLocal ? localHere : remoteHere;
    const accesses = mergeById(localCategory?.accesses ?? [], remoteCategory?.accesses ?? [], preferLocal)
      .filter(access => winnerHere.has(access.id) || !loserHere.has(access.id) || !winnerIds.has(access.id)).map(access => {
      const localAccess = localCategory?.accesses.find(item => item.id === access.id);
      const merged = { ...access, thumbnail: images.get(access.id) || '' };
      if (localAccess?.bookmarkMissing !== undefined) merged.bookmarkMissing = localAccess.bookmarkMissing;
      return merged;
    });
    return { ...category, accesses };
  });
  const settings = preferLocal ? { ...local.settings } : { ...local.settings, ...remote.settings };
  settings.backgroundImageUrl = local.settings.backgroundImageUrl;
  keepLocalLayout(settings, local.settings);
  return validRemote({
    schemaVersion: 1,
    workspaces,
    categories,
    activeWorkspaceId: local.activeWorkspaceId,
    settings,
    autoTagRules: preferLocal ? { ...local.autoTagRules } : { ...remote.autoTagRules }
  });
}

// Preserve private accesses even when their public workspace/category was removed remotely.
function preserveLocalOnly(local, remote) {
  const privateIds = new Set(local.categories.flatMap(c => c.accesses.filter(a => a.localOnly).map(a => a.id)));
  for (const category of remote.categories) category.accesses = category.accesses.filter(a => !privateIds.has(a.id));
  for (const original of local.categories) {
    const privateAccesses = original.accesses.filter(a => a.localOnly);
    if (!privateAccesses.length) continue;
    let target = remote.categories.find(c => c.id === original.id);
    if (!target) {
      if (!remote.workspaces.some(w => w.id === original.workspaceId)) remote.workspaces.push({ ...local.workspaces.find(w => w.id === original.workspaceId) });
      const parent = local.categories.find(c => c.id === original.parentId);
      if (parent && !remote.categories.some(c => c.id === parent.id)) remote.categories.push({ ...parent, accesses: [] });
      const validParent = remote.categories.find(c => c.id === original.parentId && c.workspaceId === original.workspaceId && !c.parentId);
      target = { ...original, parentId: validParent?.id || '', accesses: [] };
      remote.categories.push(target);
    }
    target.accesses.push(...privateAccesses.map(a => ({ ...a })));
  }
  return remote;
}

// Reconstruye la biblioteca completa desde la proyección remota, conservando las
// miniaturas locales que ya existan para los mismos accesos, el Workspace activo
// y la imagen de fondo (que no viajan por sync). Se usa al elegir "usar los de la
// nube" en la primera activación y al aplicar cambios remotos sin cambios locales.
export function applyRemoteData(local, remote) {
  if (!remote || remote.schemaVersion !== 1) throw new SyncCorruptError('La configuración sincronizada no es compatible.');
  const images = localImages(local);
  const full = validRemote(remote);
  for (const category of full.categories)
    for (const access of category.accesses)
      access.thumbnail = images.get(access.id) || '';
  full.settings.backgroundImageUrl = local.settings.backgroundImageUrl;
  keepLocalLayout(full.settings, local.settings);
  full.activeWorkspaceId = local.activeWorkspaceId;
  return normalizeData(preserveLocalOnly(local, full));
}

// Decide la acción de syncNow sin tocar el DOM: 'upload' (subir local), 'apply'
// (aplicar remoto), 'merge' (combinar ambos) o 'none' (nada pendiente).
export function decideSyncAction(remoteRevision, lastRevision, dirty) {
  if (remoteRevision && remoteRevision === lastRevision) return dirty ? 'upload' : 'none';
  if (!remoteRevision) return 'upload';
  // Sin revisión conocida (equipo nuevo o actualizado desde 1.9.1) no se sabe qué
  // es más reciente: se combina en vez de reemplazar la biblioteca local.
  if (!lastRevision) return 'merge';
  return dirty ? 'merge' : 'apply';
}

function quotaLimits(area) {
  return {
    bytes: area.QUOTA_BYTES ?? SYNC_QUOTA.QUOTA_BYTES,
    perItem: area.QUOTA_BYTES_PER_ITEM ?? SYNC_QUOTA.QUOTA_BYTES_PER_ITEM,
    maxItems: area.MAX_ITEMS ?? SYNC_QUOTA.MAX_ITEMS
  };
}

function itemSize(key, value) {
  return key.length + JSON.stringify(value).length;
}

function valuesSize(values) {
  return Object.entries(values).reduce((sum, [key, value]) => sum + itemSize(key, value), 0);
}

export function assertWithinQuota(values, area) {
  const limits = quotaLimits(area);
  const entries = Object.entries(values);
  if (entries.length > limits.maxItems) throw new SyncQuotaError('Demasiados elementos para Chrome Sync. Usa el respaldo ZIP.');
  let total = 0;
  for (const [key, value] of entries) {
    const size = itemSize(key, value);
    if (size > limits.perItem) throw new SyncQuotaError('Un fragmento supera el límite de ' + Math.round(limits.perItem / 1024) + ' KB por elemento de Chrome Sync. Usa el respaldo ZIP.');
    total += size;
  }
  if (total > limits.bytes) throw new SyncQuotaError('La biblioteca es demasiado grande para Chrome Sync (' + Math.ceil(total / 1024) + ' KB de ' + Math.round(limits.bytes / 1024) + ' KB). Usa el respaldo ZIP.');
  return total;
}

export function createSyncStore(area, locks = globalThis.navigator?.locks) {
  const serialize = action => locks ? locks.request('nex-b-sync-store', action) : action();
  const chunkKey = (revision, index) => SYNC_CHUNK_PREFIX + revision + '.' + index;
  return {
    async save(data, { parentRevision = null } = {}) { return serialize(async () => {
      const encoded = base64Encode(JSON.stringify(projectSyncData(data)));
      const revision = String(Date.now()) + '-' + Math.random().toString(36).slice(2);
      const chunks = [];
      for (let offset = 0; offset < encoded.length; offset += SYNC_CHUNK_BYTES)
        chunks.push(encoded.slice(offset, offset + SYNC_CHUNK_BYTES));
      const values = { [SYNC_MANIFEST_KEY]: { schemaVersion: 1, count: chunks.length, revision, length: encoded.length, checksum: checksum(encoded), ...(parentRevision !== null ? { parentRevision } : {}) } };
      chunks.forEach((chunk, index) => { values[chunkKey(revision, index)] = chunk; });
      assertWithinQuota(values, area);
      // Keep the previous generation intact until the replacement is durable.
      const existing = await area.get(null);
      const retained = Object.keys(existing)
        .filter(key => !(key in values))
        .reduce((sum, key) => sum + itemSize(key, existing[key]), 0);
      if (valuesSize(values) + retained > quotaLimits(area).bytes) throw new SyncQuotaError('No hay espacio para actualizar Sync sin eliminar la copia anterior. Usa el ZIP o reduce la biblioteca.');
      await area.set(values);
      // Only retire generations observed before this write. Another device may
      // have published newer chunks meanwhile; never collect those as orphans.
      const current = (await area.get(SYNC_MANIFEST_KEY))[SYNC_MANIFEST_KEY];
      if (current?.revision === revision) {
        const oldKeys = Object.keys(existing).filter(key => key.startsWith(SYNC_CHUNK_PREFIX) && !(key in values));
        if (oldKeys.length) await area.remove(oldKeys);
      }
      return { revision, bytes: encoded.length };
    }); },
    async load() {
      const manifest = (await area.get(SYNC_MANIFEST_KEY))[SYNC_MANIFEST_KEY];
      if (!manifest) return null;
      if (manifest.schemaVersion !== 1 || !manifest.revision || !Number.isInteger(manifest.count) || manifest.count < 1 || manifest.count > SYNC_QUOTA.MAX_ITEMS)
        throw new Error('El manifiesto sincronizado no es válido.');
      // Hasta 1.9.1 los fragmentos no llevaban la revisión en la clave ni el manifiesto
      // guardaba length; se leen igual y el próximo save() los migra al formato nuevo.
      const legacy = !Number.isInteger(manifest.length);
      const keys = Array.from({ length: manifest.count }, (_, index) => legacy ? SYNC_CHUNK_PREFIX + index : chunkKey(manifest.revision, index));
      const stored = await area.get(keys);
      if (keys.some(key => typeof stored[key] !== 'string')) throw new Error('Faltan datos sincronizados; se conserva la copia local.');
      const encoded = keys.map(key => stored[key]).join('');
      if ((Number.isInteger(manifest.length) && manifest.length !== encoded.length) || (Number.isInteger(manifest.checksum) && manifest.checksum !== checksum(encoded)))
        throw new SyncCorruptError('Los datos sincronizados están dañados; se conserva la copia local.');
      try { return { revision: manifest.revision, parentRevision: manifest.parentRevision, data: JSON.parse(base64Decode(encoded)) }; }
      catch { throw new SyncCorruptError('Los datos sincronizados están dañados; se conserva la copia local.'); }
    }
  };
}
