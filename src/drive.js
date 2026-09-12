import { normalizeData } from './model.js';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function tokenValue(result) {
  return typeof result === 'string' ? result : result?.token;
}

async function authToken(interactive = true) {
  const token = tokenValue(await chrome.identity.getAuthToken({ interactive }));
  if (!token) throw new Error('Google no devolvió un token de Drive.');
  return token;
}

async function request(url, token, options = {}, retry = true) {
  const response = await fetch(url, { ...options, headers: { ...(options.headers || {}), Authorization: 'Bearer ' + token } });
  if (response.status === 401 && retry) {
    await chrome.identity.removeCachedAuthToken({ token });
    return request(url, await authToken(true), options, false);
  }
  if (!response.ok) {
    let detail = '';
    try { detail = (await response.json()).error?.message || ''; } catch { /* Keep the HTTP status when the body is not JSON. */ }
    throw new Error('Google Drive respondió ' + response.status + (detail ? ': ' + detail : '.'));
  }
  return response;
}

export function dataUrlBlob(value) {
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/i.exec(value || '');
  if (!match) return null;
  const binary = atob(match[2]);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error('La imagen supera 8 MB.');
  return { blob: new Blob([bytes], { type: match[1].toLowerCase() }), mimeType: match[1].toLowerCase() };
}

async function blobHash(blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

export async function blobDataUrl(blob) {
  if (!blob || blob.size > MAX_IMAGE_BYTES || !/^image\/(?:png|jpeg|webp|gif)$/i.test(blob.type)) throw new Error('Google Drive devolvió una imagen no permitida.');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return 'data:' + blob.type.toLowerCase() + ';base64,' + btoa(binary);
}

async function listFiles(token) {
  const query = encodeURIComponent("'appDataFolder' in parents and trashed = false");
  const response = await request(DRIVE_API + '/files?q=' + query + '&spaces=appDataFolder&fields=files(id,name,mimeType,size,modifiedTime,appProperties)', token);
  return (await response.json()).files || [];
}

async function uploadFile(token, existingId, name, blob, mimeType, hash) {
  const boundary = 'nexb-' + crypto.randomUUID();
  const metadata = JSON.stringify(existingId ? { name, mimeType, appProperties: { nexbHash: hash } } : { name, parents: ['appDataFolder'], mimeType, appProperties: { nexbHash: hash } });
  const body = new Blob([
    '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n', metadata,
    '\r\n--' + boundary + '\r\nContent-Type: ' + mimeType + '\r\n\r\n', blob,
    '\r\n--' + boundary + '--'
  ], { type: 'multipart/related; boundary=' + boundary });
  const endpoint = DRIVE_UPLOAD + (existingId ? '/' + encodeURIComponent(existingId) : '') + '?uploadType=multipart&fields=id';
  const response = await request(endpoint, token, { method: existingId ? 'PATCH' : 'POST', headers: { 'Content-Type': body.type }, body });
  return (await response.json()).id || existingId;
}

async function downloadFile(token, id) {
  const response = await request(DRIVE_API + '/files/' + encodeURIComponent(id) + '?alt=media', token);
  return blobDataUrl(await response.blob());
}

export async function syncDriveImages(data) {
  const token = await authToken(true);
  const files = await listFiles(token);
  const byName = new Map(files.map(file => [file.name, file]));
  const candidate = structuredClone(data);
  let uploaded = 0, downloaded = 0, skipped = 0;
  const errors = [];
  for (const category of candidate.categories) {
    for (const access of category.accesses) {
      const name = 'nexb-image-' + access.id;
      try {
        const local = dataUrlBlob(access.thumbnail);
        const existing = byName.get(name) || (access.driveImageId ? files.find(file => file.id === access.driveImageId) : null);
        if (local) {
          const localHash = await blobHash(local.blob);
          const unchanged = access.driveImageHash && access.driveImageHash === localHash;
          const remoteHash = existing?.appProperties?.nexbHash || '';
          if (existing && !access.driveImageHash) {
            access.thumbnail = await downloadFile(token, existing.id);
            const downloadedImage = dataUrlBlob(access.thumbnail);
            if (downloadedImage) access.driveImageHash = remoteHash || await blobHash(downloadedImage.blob);
            access.driveImageId = existing.id;
            downloaded++;
            continue;
          }
          if (existing && access.driveImageHash && !unchanged && remoteHash && remoteHash !== access.driveImageHash)
            throw new Error('Conflicto: esta miniatura cambió también en otro computador. No se sobrescribió.');
          if (unchanged && existing) {
            if (remoteHash && remoteHash !== localHash) {
              access.thumbnail = await downloadFile(token, existing.id);
              access.driveImageHash = remoteHash;
              downloaded++;
            }
            continue;
          }
          const id = await uploadFile(token, existing?.id || access.driveImageId, name, local.blob, local.mimeType, localHash);
          access.driveImageId = id;
          access.driveImageHash = localHash;
          byName.set(name, { id, name, mimeType: local.mimeType, appProperties: { nexbHash: localHash } });
          uploaded++;
        } else if (!access.thumbnail && access.driveImageId) {
          access.thumbnail = await downloadFile(token, access.driveImageId);
          const downloadedImage = dataUrlBlob(access.thumbnail);
          if (downloadedImage) access.driveImageHash = await blobHash(downloadedImage.blob);
          downloaded++;
        } else if (!access.thumbnail) skipped++;
      } catch (error) {
        errors.push(access.title + ': ' + (error.message || 'No se pudo sincronizar la imagen.'));
      }
    }
  }
  return { data: normalizeData(candidate), uploaded, downloaded, skipped, errors };
}
