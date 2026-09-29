import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeData } from '../src/model.js';
import { cleanupDriveOrphans, dataUrlBlob, imageHash, syncDriveImages } from '../src/drive.js';

const image = 'data:image/webp;base64,aW1hZ2U=';
function fixture(access = {}) {
  const data = normalizeData();
  data.categories[0].accesses.push({ id: 'saved', title: 'Imagen', url: 'https://example.com/', tags: [], thumbnail: '', matchType: 'document', ...access });
  return data;
}

test('dataUrlBlob solo acepta imágenes base64 permitidas', () => {
  assert.equal(dataUrlBlob(image).mimeType, 'image/webp');
  assert.equal(dataUrlBlob('https://example.com/image.png'), null);
  assert.equal(dataUrlBlob('data:text/plain;base64,dGVzdA=='), null);
});

test('syncDriveImages sube miniaturas locales y guarda driveImageId', async () => {
  const previousChrome = globalThis.chrome;
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.chrome = { identity: { getAuthToken: async () => ({ token: 'token' }), removeCachedAuthToken: async () => {} } };
  globalThis.fetch = async (url, options = {}) => {
    calls.push([url, options.method || 'GET']);
    if (url.includes('/files?q=')) return new Response(JSON.stringify({ files: [] }), { status: 200 });
    return new Response(JSON.stringify({ id: 'drive-image-1' }), { status: 200 });
  };
  try {
    const result = await syncDriveImages(fixture({ thumbnail: image }));
    assert.equal(result.uploaded, 1);
    assert.equal(result.data.categories[0].accesses[0].driveImageId, 'drive-image-1');
    assert.equal(calls.length, 2);
  } finally {
    globalThis.chrome = previousChrome;
    globalThis.fetch = previousFetch;
  }
});

test('syncDriveImages no vuelve a subir una imagen sin cambios', async () => {
  const previousChrome = globalThis.chrome;
  const previousFetch = globalThis.fetch;
  const calls = [];
  const hash = await imageHash(dataUrlBlob(image).blob);
  globalThis.chrome = { identity: { getAuthToken: async () => ({ token: 'token' }), removeCachedAuthToken: async () => {} } };
  globalThis.fetch = async (url, options = {}) => {
    calls.push([url, options.method || 'GET']);
    if (url.includes('/files?q=')) return new Response(JSON.stringify({ files: [{ id: 'drive-image-1', name: 'nexb-image-saved', mimeType: 'image/webp' }] }), { status: 200 });
    return new Response(JSON.stringify({ id: 'drive-image-1' }), { status: 200 });
  };
  try {
    const result = await syncDriveImages(fixture({ thumbnail: image, driveImageId: 'drive-image-1', driveImageHash: hash }));
    assert.equal(result.uploaded, 0);
    assert.equal(result.unchanged, 1);
    assert.equal(result.data.categories[0].accesses[0].driveImageHash, hash);
    assert.ok(!calls.some(([url]) => url.includes('upload/drive')));
  } finally {
    globalThis.chrome = previousChrome;
    globalThis.fetch = previousFetch;
  }
});

test('syncDriveImages actualiza con PATCH la imagen cambiada y su hash', async () => {
  const previousChrome = globalThis.chrome;
  const previousFetch = globalThis.fetch;
  const calls = [];
  const hash = await imageHash(dataUrlBlob(image).blob);
  globalThis.chrome = { identity: { getAuthToken: async () => ({ token: 'token' }), removeCachedAuthToken: async () => {} } };
  globalThis.fetch = async (url, options = {}) => {
    calls.push([url, options.method || 'GET']);
    if (url.includes('/files?q=')) return new Response(JSON.stringify({ files: [{ id: 'drive-image-1', name: 'nexb-image-saved' }] }), { status: 200 });
    return new Response(JSON.stringify({ id: 'drive-image-1' }), { status: 200 });
  };
  try {
    const result = await syncDriveImages(fixture({ thumbnail: image, driveImageId: 'drive-image-1', driveImageHash: '0'.repeat(64) }));
    assert.equal(result.uploaded, 1);
    assert.equal(result.unchanged, 0);
    assert.equal(result.data.categories[0].accesses[0].driveImageHash, hash);
    const update = calls.find(([url, method]) => url.includes('upload/drive') && method === 'PATCH');
    assert.ok(update?.[0].includes('/drive-image-1'));
  } finally {
    globalThis.chrome = previousChrome;
    globalThis.fetch = previousFetch;
  }
});

test('syncDriveImages no borra imágenes de accesos ausentes en este equipo', async () => {
  const previousChrome = globalThis.chrome;
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.chrome = { identity: { getAuthToken: async () => ({ token: 'token' }), removeCachedAuthToken: async () => {} } };
  globalThis.fetch = async (url, options = {}) => {
    calls.push([url, options.method || 'GET']);
    if (url.includes('/files?q=')) return new Response(JSON.stringify({ files: [{ id: 'orphan', name: 'nexb-image-eliminado' }] }), { status: 200 });
    return new Response(JSON.stringify({ id: 'x' }), { status: 200 });
  };
  try {
    const result = await syncDriveImages(fixture());
    assert.equal(result.deleted, undefined);
    assert.ok(!calls.some(([, method]) => method === 'DELETE'));
  } finally {
    globalThis.chrome = previousChrome;
    globalThis.fetch = previousFetch;
  }
});

test('cleanupDriveOrphans borra solo los nexb-image-* sin acceso', async () => {
  const previousChrome = globalThis.chrome;
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.chrome = { identity: { getAuthToken: async () => ({ token: 'token' }), removeCachedAuthToken: async () => {} } };
  globalThis.fetch = async (url, options = {}) => {
    calls.push([url, options.method || 'GET']);
    if (url.includes('/files?q=')) return new Response(JSON.stringify({ files: [
      { id: 'keep', name: 'nexb-image-saved' },
      { id: 'orphan', name: 'nexb-image-eliminado' },
      { id: 'other', name: 'otro-nexb-image-saved' }
    ] }), { status: 200 });
    return new Response(JSON.stringify({ id: 'x' }), { status: 200 });
  };
  try {
    const result = await cleanupDriveOrphans(fixture());
    assert.equal(result.deleted, 1);
    assert.deepEqual(result.errors, []);
    const deletes = calls.filter(([, method]) => method === 'DELETE').map(([url]) => url);
    assert.equal(deletes.length, 1);
    assert.ok(deletes[0].includes('/files/orphan'));
  } finally {
    globalThis.chrome = previousChrome;
    globalThis.fetch = previousFetch;
  }
});

test('cleanupDriveOrphans acumula errores de borrado sin abortar el resto', async () => {
  const previousChrome = globalThis.chrome;
  const previousFetch = globalThis.fetch;
  globalThis.chrome = { identity: { getAuthToken: async () => ({ token: 'token' }), removeCachedAuthToken: async () => {} } };
  globalThis.fetch = async (url, options = {}) => {
    if (url.includes('/files?q=')) return new Response(JSON.stringify({ files: [
      { id: 'bad', name: 'nexb-image-uno' },
      { id: 'good', name: 'nexb-image-dos' }
    ] }), { status: 200 });
    if (options.method === 'DELETE') return new Response(JSON.stringify({ error: { message: 'boom' } }), { status: 500 });
    return new Response(JSON.stringify({ id: 'x' }), { status: 200 });
  };
  try {
    const result = await cleanupDriveOrphans(fixture());
    assert.equal(result.deleted, 0);
    assert.equal(result.errors.length, 2);
    assert.match(result.errors[0], /nexb-image-/);
  } finally {
    globalThis.chrome = previousChrome;
    globalThis.fetch = previousFetch;
  }
});

test('syncDriveImages recorre todas las páginas con nextPageToken', async () => {
  const previousChrome = globalThis.chrome;
  const previousFetch = globalThis.fetch;
  const pages = [];
  globalThis.chrome = { identity: { getAuthToken: async () => ({ token: 'token' }), removeCachedAuthToken: async () => {} } };
  globalThis.fetch = async url => {
    if (url.includes('/files?q=')) {
      pages.push(url);
      if (!url.includes('pageToken=')) return new Response(JSON.stringify({ files: [], nextPageToken: 'token-2' }), { status: 200 });
      return new Response(JSON.stringify({ files: [{ id: 'drive-image-1', name: 'nexb-image-saved', mimeType: 'image/png' }] }), { status: 200 });
    }
    return new Response(new Blob(['image'], { type: 'image/png' }), { status: 200 });
  };
  try {
    const result = await syncDriveImages(fixture({ driveImageId: 'drive-image-1' }));
    assert.equal(result.downloaded, 1);
    assert.equal(pages.length, 2);
    assert.match(pages[0], /pageSize=1000/);
    assert.match(pages[1], /pageToken=token-2/);
  } finally {
    globalThis.chrome = previousChrome;
    globalThis.fetch = previousFetch;
  }
});

test('syncDriveImages explica el Client ID inválido sin reintentar', async () => {
  const previousChrome = globalThis.chrome;
  const previousFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.chrome = { identity: { getAuthToken: async () => { throw new Error('Bad client id: invalid_client'); }, removeCachedAuthToken: async () => {} } };
  globalThis.fetch = async () => { fetchCalls++; return new Response('{}', { status: 200 }); };
  try {
    await assert.rejects(() => syncDriveImages(fixture()), /Client ID de OAuth no corresponde/);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.chrome = previousChrome;
    globalThis.fetch = previousFetch;
  }
});

test('syncDriveImages descarga miniaturas privadas por driveImageId', async () => {
  const previousChrome = globalThis.chrome;
  const previousFetch = globalThis.fetch;
  globalThis.chrome = { identity: { getAuthToken: async () => ({ token: 'token' }), removeCachedAuthToken: async () => {} } };
  globalThis.fetch = async url => {
    if (url.includes('/files?q=')) return new Response(JSON.stringify({ files: [{ id: 'drive-image-1', name: 'nexb-image-saved', mimeType: 'image/png' }] }), { status: 200 });
    return new Response(new Blob(['image'], { type: 'image/png' }), { status: 200 });
  };
  try {
    const result = await syncDriveImages(fixture({ driveImageId: 'drive-image-1' }));
    assert.equal(result.downloaded, 1);
    assert.match(result.data.categories[0].accesses[0].thumbnail, /^data:image\/png;base64,/);
    assert.equal(result.data.categories[0].accesses[0].driveImageHash, await imageHash(new Blob(['image'], { type: 'image/png' })));
  } finally {
    globalThis.chrome = previousChrome;
    globalThis.fetch = previousFetch;
  }
});

test('syncDriveImages no sobrescribe una miniatura modificada en otro computador', async () => {
  const previousChrome = globalThis.chrome;
  const previousFetch = globalThis.fetch;
  globalThis.chrome = { identity: { getAuthToken: async () => ({ token: 'token' }), removeCachedAuthToken: async () => {} } };
  globalThis.fetch = async url => {
    if (url.includes('/files?q=')) return new Response(JSON.stringify({ files: [{ id: 'drive-image-1', name: 'nexb-image-saved', mimeType: 'image/webp', appProperties: { nexbHash: 'c'.repeat(64) } }] }), { status: 200 });
    return new Response(JSON.stringify({ id: 'should-not-upload' }), { status: 200 });
  };
  try {
    const result = await syncDriveImages(fixture({ thumbnail: image, driveImageId: 'drive-image-1', driveImageHash: 'b'.repeat(64) }));
    assert.equal(result.uploaded, 0);
    assert.match(result.errors[0], /Conflicto/);
  } finally {
    globalThis.chrome = previousChrome;
    globalThis.fetch = previousFetch;
  }
});

test('syncDriveImages prefiere Drive cuando el acceso antiguo no tiene hash', async () => {
  const previousChrome = globalThis.chrome;
  const previousFetch = globalThis.fetch;
  globalThis.chrome = { identity: { getAuthToken: async () => ({ token: 'token' }), removeCachedAuthToken: async () => {} } };
  globalThis.fetch = async url => {
    if (url.includes('/files?q=')) return new Response(JSON.stringify({ files: [{ id: 'drive-image-1', name: 'nexb-image-saved', mimeType: 'image/png', appProperties: { nexbHash: 'd'.repeat(64) } }] }), { status: 200 });
    return new Response(new Blob(['latest'], { type: 'image/png' }), { status: 200 });
  };
  try {
    const result = await syncDriveImages(fixture({ thumbnail: image, driveImageId: 'drive-image-1' }));
    assert.equal(result.uploaded, 0);
    assert.equal(result.downloaded, 1);
    assert.match(result.data.categories[0].accesses[0].thumbnail, /^data:image\/png;base64,/);
  } finally {
    globalThis.chrome = previousChrome;
    globalThis.fetch = previousFetch;
  }
});
