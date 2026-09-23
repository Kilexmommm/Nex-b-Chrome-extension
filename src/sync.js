import { normalizeData } from './model.js';

export const SYNC_MANIFEST_KEY = 'nexb.sync.manifest';
export const SYNC_CHUNK_PREFIX = 'nexb.sync.chunk.';
export const SYNC_CHUNK_BYTES = 6000;

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

export function mergeSyncData(local, remote) {
  if (!remote || remote.schemaVersion !== 1) throw new Error('La configuración sincronizada no es compatible.');
  const images = localImages(local);
  const candidate = structuredClone(remote);
  candidate.activeWorkspaceId = local.activeWorkspaceId;
  candidate.settings = { ...local.settings, ...candidate.settings, backgroundImageUrl: local.settings.backgroundImageUrl };
  for (const category of candidate.categories) {
    for (const access of category.accesses) {
      access.thumbnail = images.get(access.id) || '';
      const localAccess = local.categories.flatMap(item => item.accesses).find(item => item.id === access.id);
      if (localAccess?.bookmarkMissing !== undefined) access.bookmarkMissing = localAccess.bookmarkMissing;
    }
  }
  return normalizeData(candidate);
}

export function createSyncStore(area) {
  return {
    async save(data) {
      const encoded = base64Encode(JSON.stringify(projectSyncData(data)));
      const chunks = [];
      for (let offset = 0; offset < encoded.length; offset += SYNC_CHUNK_BYTES)
        chunks.push(encoded.slice(offset, offset + SYNC_CHUNK_BYTES));
      const previous = (await area.get(SYNC_MANIFEST_KEY))[SYNC_MANIFEST_KEY];
      const revision = String(Date.now()) + '-' + Math.random().toString(36).slice(2);
      const values = { [SYNC_MANIFEST_KEY]: { schemaVersion: 1, count: chunks.length, revision } };
      chunks.forEach((chunk, index) => { values[SYNC_CHUNK_PREFIX + index] = chunk; });
      await area.set(values);
      if (previous?.count > chunks.length)
        await area.remove(Array.from({ length: previous.count - chunks.length }, (_, index) => SYNC_CHUNK_PREFIX + (chunks.length + index)));
      return { revision, bytes: encoded.length };
    },
    async load() {
      const manifest = (await area.get(SYNC_MANIFEST_KEY))[SYNC_MANIFEST_KEY];
      if (!manifest) return null;
      if (manifest.schemaVersion !== 1 || !Number.isInteger(manifest.count) || manifest.count < 1 || manifest.count > 512)
        throw new Error('El manifiesto sincronizado no es válido.');
      const keys = Array.from({ length: manifest.count }, (_, index) => SYNC_CHUNK_PREFIX + index);
      const stored = await area.get(keys);
      if (keys.some(key => typeof stored[key] !== 'string')) throw new Error('Faltan datos sincronizados; se conserva la copia local.');
      try { return { revision: manifest.revision, data: JSON.parse(base64Decode(keys.map(key => stored[key]).join(''))) }; }
      catch { throw new Error('Los datos sincronizados están dañados; se conserva la copia local.'); }
    }
  };
}
