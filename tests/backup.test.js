import test from 'node:test';
import assert from 'node:assert/strict';
import { createZip, createBackupZip, readStoredZip, readZipFiles, crc32 } from '../src/backup.js';
import { normalizeData } from '../src/model.js';

const encode = value => new TextEncoder().encode(JSON.stringify(value));
const bytes = async blob => new Uint8Array(await blob.arrayBuffer());
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=';
function fixture() {
  const data = normalizeData();
  data.categories[0].accesses.push({ id: 'test', title: 'Español ñ <script>', url: 'https://example.com/', tags: ['uno'], thumbnail: png, matchType: 'document' });
  data.settings.backgroundImageUrl = png;
  return data;
}
test('CRC32 coincide con el vector estándar', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});
test('ZIP restaura configuración e imágenes de tarjetas y fondo, deduplicadas', async () => {
  const data = fixture();
  const archive = await bytes(createBackupZip(data));
  assert.deepEqual(readStoredZip(archive), data);
  assert.equal(readZipFiles(archive).size, 2);
  assert.equal(typeof data.categories[0].accesses[0].thumbnail, 'string');
});
test('preserva enlaces HTTPS sin descargarlos', async () => {
  const data = fixture(); data.categories[0].accesses[0].thumbnail = 'https://example.com/image.png';
  assert.deepEqual(readStoredZip(await bytes(createBackupZip(data))), data);
});
test('rechaza bytes truncados, alterados o directorios falsificados', async () => {
  const original = await bytes(createBackupZip(fixture()));
  for (const length of [0, 21, 30, original.length - 1]) assert.throws(() => readStoredZip(original.slice(0, length)));
  const corrupt = original.slice(); corrupt[60] ^= 1;
  assert.throws(() => readStoredZip(corrupt), /CRC/);
  const directory = original.slice(); new DataView(directory.buffer).setUint32(directory.length - 6, 0xffffffff, true);
  assert.throws(() => readStoredZip(directory));
});
test('rechaza rutas peligrosas y archivos duplicados', async () => {
  const unsafe = await bytes(createZip([{ name: '../escape', bytes: new Uint8Array() }]));
  assert.throws(() => readZipFiles(unsafe));
  const duplicate = await bytes(createZip([{ name: 'a', bytes: new Uint8Array() }, { name: 'a', bytes: new Uint8Array() }]));
  assert.throws(() => readZipFiles(duplicate));
});
test('imagen ausente bloquea importación completa; no la reemplaza silenciosamente', async () => {
  const data = fixture(); data.categories[0].accesses[0].thumbnail = { zipImage: 'images/missing.png', mime: 'image/png' };
  const zip = await bytes(createZip([{ name: 'nex-b-config.json', bytes: encode(data) }]));
  assert.throws(() => readStoredZip(zip), /Falta una imagen/);
});
test('ZIP previo sin schemaVersion sigue siendo compatible', async () => {
  const data = fixture(); delete data.schemaVersion;
  const zip = await bytes(createZip([{ name: 'nex-b-config.json', bytes: encode(data) }]));
  assert.deepEqual(readStoredZip(zip), normalizeData(data));
});
