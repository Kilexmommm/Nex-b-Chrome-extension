import { normalizeData } from './model.js';

export const SYNC_MANIFEST_KEY = 'nexb.sync.manifest';
export const SYNC_CHUNK_PREFIX = 'nexb.sync.chunk.';
export const SYNC_CHUNK_BYTES = 6000;
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
      accesses: category.accesses.map(access => {
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

// Combina dos bibliotecas por identificador: workspaces, categorías y accesos.
// Un elemento presente en un solo lado se conserva (unión). Si el mismo id existe
// en ambos, gana el remoto salvo que `preferLocal` sea true (hay cambios locales
// pendientes de subir), en cuyo caso gana el local. Las miniaturas locales nunca
// viajan por sync y se conservan siempre. El resultado se valida con normalizeData.
// Limitación: la unión no detecta borrados concurrentes; si en "merge" un equipo
// eliminó un acceso que el otro conserva, el acceso puede reaparecer al combinarse.
export function mergeThreeWay(local, remote, { preferLocal = false } = {}) {
  if (!remote || remote.schemaVersion !== 1) throw new Error('La configuración sincronizada no es compatible.');
  const images = localImages(local);
  const workspaces = mergeById(local.workspaces, remote.workspaces, preferLocal);
  const categories = mergeById(local.categories, remote.categories, preferLocal).map(category => {
    const remoteCategory = remote.categories.find(item => item.id === category.id);
    const localCategory = local.categories.find(item => item.id === category.id);
    const accesses = mergeById(localCategory?.accesses ?? [], remoteCategory?.accesses ?? [], preferLocal).map(access => {
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
  return normalizeData({
    schemaVersion: 1,
    workspaces,
    categories,
    activeWorkspaceId: local.activeWorkspaceId,
    settings,
    autoTagRules: preferLocal ? { ...local.autoTagRules } : { ...remote.autoTagRules }
  });
}

// Reconstruye la biblioteca completa desde la proyección remota, conservando las
// miniaturas locales que ya existan para los mismos accesos, el Workspace activo
// y la imagen de fondo (que no viajan por sync). Se usa al elegir "usar los de la
// nube" en la primera activación y al aplicar cambios remotos sin cambios locales.
export function applyRemoteData(local, remote) {
  if (!remote || remote.schemaVersion !== 1) throw new Error('La configuración sincronizada no es compatible.');
  const images = localImages(local);
  const full = normalizeData(remote);
  for (const category of full.categories)
    for (const access of category.accesses)
      access.thumbnail = images.get(access.id) || '';
  full.settings.backgroundImageUrl = local.settings.backgroundImageUrl;
  keepLocalLayout(full.settings, local.settings);
  full.activeWorkspaceId = local.activeWorkspaceId;
  return normalizeData(full);
}

// Decide la acción de syncNow sin tocar el DOM: 'upload' (subir local), 'apply'
// (aplicar remoto), 'merge' (combinar ambos) o 'none' (nada pendiente).
export function decideSyncAction(remoteRevision, lastRevision, dirty) {
  if (remoteRevision && remoteRevision === lastRevision) return dirty ? 'upload' : 'none';
  if (!remoteRevision) return 'upload';
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
  if (entries.length > limits.maxItems) throw new Error('Demasiados elementos para Chrome Sync. Usa el respaldo ZIP.');
  let total = 0;
  for (const [key, value] of entries) {
    const size = itemSize(key, value);
    if (size > limits.perItem) throw new Error('Un fragmento supera el límite de ' + Math.round(limits.perItem / 1024) + ' KB por elemento de Chrome Sync. Usa el respaldo ZIP.');
    total += size;
  }
  if (total > limits.bytes) throw new Error('La biblioteca es demasiado grande para Chrome Sync (' + Math.ceil(total / 1024) + ' KB de ' + Math.round(limits.bytes / 1024) + ' KB). Usa el respaldo ZIP.');
  return total;
}

export function createSyncStore(area) {
  const chunkKey = (revision, index) => SYNC_CHUNK_PREFIX + revision + '.' + index;
  async function removeOrphanChunks(keepRevision) {
    const all = await area.get(null);
    const orphans = Object.keys(all).filter(key => key.startsWith(SYNC_CHUNK_PREFIX) && !key.startsWith(SYNC_CHUNK_PREFIX + keepRevision + '.'));
    if (orphans.length) await area.remove(orphans);
  }
  return {
    async save(data) {
      const encoded = base64Encode(JSON.stringify(projectSyncData(data)));
      const revision = String(Date.now()) + '-' + Math.random().toString(36).slice(2);
      const chunks = [];
      for (let offset = 0; offset < encoded.length; offset += SYNC_CHUNK_BYTES)
        chunks.push(encoded.slice(offset, offset + SYNC_CHUNK_BYTES));
      const values = { [SYNC_MANIFEST_KEY]: { schemaVersion: 1, count: chunks.length, revision, length: encoded.length, checksum: checksum(encoded) } };
      chunks.forEach((chunk, index) => { values[chunkKey(revision, index)] = chunk; });
      assertWithinQuota(values, area);
      // La cuota se mide sobre el estado total: si los fragmentos nuevos caben solos
      // pero no junto con los de la revisión anterior, se borran primero (y se acepta
      // la ventana breve en que load() reportará "Faltan datos sincronizados").
      const existing = await area.get(null);
      const retained = Object.keys(existing)
        .filter(key => !(key in values))
        .reduce((sum, key) => sum + itemSize(key, existing[key]), 0);
      if (valuesSize(values) + retained > quotaLimits(area).bytes) await removeOrphanChunks(revision);
      await area.set(values);
      await removeOrphanChunks(revision);
      return { revision, bytes: encoded.length };
    },
    async load() {
      const manifest = (await area.get(SYNC_MANIFEST_KEY))[SYNC_MANIFEST_KEY];
      if (!manifest) return null;
      if (manifest.schemaVersion !== 1 || !manifest.revision || !Number.isInteger(manifest.count) || manifest.count < 1 || manifest.count > SYNC_QUOTA.MAX_ITEMS)
        throw new Error('El manifiesto sincronizado no es válido.');
      const keys = Array.from({ length: manifest.count }, (_, index) => chunkKey(manifest.revision, index));
      const stored = await area.get(keys);
      if (keys.some(key => typeof stored[key] !== 'string')) throw new Error('Faltan datos sincronizados; se conserva la copia local.');
      const encoded = keys.map(key => stored[key]).join('');
      if ((Number.isInteger(manifest.length) && manifest.length !== encoded.length) || (Number.isInteger(manifest.checksum) && manifest.checksum !== checksum(encoded)))
        throw new Error('Los datos sincronizados están dañados; se conserva la copia local.');
      try { return { revision: manifest.revision, data: JSON.parse(base64Decode(encoded)) }; }
      catch { throw new Error('Los datos sincronizados están dañados; se conserva la copia local.'); }
    }
  };
}
