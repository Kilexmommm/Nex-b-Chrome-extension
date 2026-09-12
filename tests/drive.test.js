import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeData } from '../src/model.js';
import { dataUrlBlob, syncDriveImages } from '../src/drive.js';

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
  } finally {
    globalThis.chrome = previousChrome;
    globalThis.fetch = previousFetch;
  }
});
