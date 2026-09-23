import test from 'node:test';
import assert from 'node:assert/strict';
import {
  destinationMatches, waitForCaptureTab, createCaptureThrottle, createBatchCommitter,
  findAccess, CAPTURE_BATCH_SIZE
} from '../src/capture.js';

function captureApi(initial) {
  const listeners = new Set();
  const state = { current: initial };
  return {
    state, listeners,
    onUpdated: {
      addListener: fn => listeners.add(fn),
      removeListener: fn => listeners.delete(fn)
    },
    get: async () => state.current,
    emit: (id, changeInfo, tab) => { for (const fn of [...listeners]) fn(id, changeInfo, tab); }
  };
}

test('destinationMatches compara origen y ruta', () => {
  assert.equal(destinationMatches('https://example.com/ruta?x=1', 'https://example.com/ruta'), true);
  assert.equal(destinationMatches('https://example.com/otra', 'https://example.com/ruta'), false);
  assert.equal(destinationMatches('https://otro.com/ruta', 'https://example.com/ruta'), false);
  assert.equal(destinationMatches('about:blank', 'https://example.com/ruta'), false);
});

test('la espera no resuelve con el complete de about:blank previo', async () => {
  const api = captureApi({ id: 3, url: 'about:blank', status: 'complete' });
  const pending = waitForCaptureTab(api, 3, 'https://example.com/', { timeout: 20 });
  api.emit(3, { status: 'complete' }, { id: 3, url: 'about:blank', status: 'complete' });
  await assert.rejects(pending, /tardó demasiado/);
});

test('la espera no resuelve con el complete de la captura anterior', async () => {
  const api = captureApi({ id: 4, url: 'https://anterior.example/', status: 'complete' });
  const pending = waitForCaptureTab(api, 4, 'https://example.com/nueva', { timeout: 20 });
  api.emit(4, { status: 'complete' }, { id: 4, url: 'https://anterior.example/', status: 'complete' });
  await assert.rejects(pending, /tardó demasiado/);
});

test('la espera resuelve tras loading y complete del destino', async () => {
  const api = captureApi({ id: 5, url: 'about:blank', status: 'complete' });
  const pending = waitForCaptureTab(api, 5, 'https://example.com/pagina');
  api.emit(5, { status: 'loading' }, { id: 5, url: 'https://example.com/pagina', status: 'loading' });
  api.emit(5, { status: 'complete' }, { id: 5, url: 'https://example.com/pagina', status: 'complete' });
  const tab = await pending;
  assert.equal(tab.url, 'https://example.com/pagina');
});

test('la espera tolera redirecciones con loading previo y URL http', async () => {
  const api = captureApi({ id: 6, url: 'about:blank', status: 'complete' });
  const pending = waitForCaptureTab(api, 6, 'https://example.com/inicio');
  api.emit(6, { status: 'loading' }, { id: 6, url: 'https://example.com/inicio', status: 'loading' });
  api.emit(6, { status: 'complete' }, { id: 6, url: 'https://login.otro.example/acceso', status: 'complete' });
  assert.equal((await pending).url, 'https://login.otro.example/acceso');
});

test('la espera ignora eventos de otras pestañas', async () => {
  const api = captureApi({ id: 7, url: 'about:blank', status: 'complete' });
  const pending = waitForCaptureTab(api, 7, 'https://example.com/', { timeout: 20 });
  api.emit(8, { status: 'complete' }, { id: 8, url: 'https://example.com/', status: 'complete' });
  await assert.rejects(pending, /tardó demasiado/);
});

test('resuelve si el loading llega durante navigate y luego un complete redirigido', async () => {
  const api = captureApi({ id: 9, url: 'about:blank', status: 'complete' });
  const pending = waitForCaptureTab(api, 9, 'http://example.com/inicio', {
    navigate: async () => {
      api.emit(9, { status: 'loading' }, { id: 9, url: 'http://example.com/inicio', status: 'loading' });
      return { id: 9, url: 'http://example.com/inicio', status: 'loading' };
    }
  });
  api.emit(9, { status: 'complete' }, { id: 9, url: 'https://example.com/acceso', status: 'complete' });
  assert.equal((await pending).url, 'https://example.com/acceso');
});

test('no resuelve con el resultado loading que devuelve navigate', async () => {
  const api = captureApi({ id: 10, url: 'about:blank', status: 'complete' });
  const pending = waitForCaptureTab(api, 10, 'http://example.com/', {
    timeout: 20,
    navigate: async () => ({ id: 10, url: 'http://example.com/', status: 'loading' })
  });
  await new Promise(resolve => setTimeout(resolve, 5));
  await assert.rejects(pending, /tardó demasiado/);
});

test('marca navigating si api.get trae pendingUrl del destino', async () => {
  const api = captureApi({ id: 11, url: 'about:blank', status: 'loading', pendingUrl: 'http://example.com/inicio' });
  const pending = waitForCaptureTab(api, 11, 'http://example.com/inicio');
  await new Promise(resolve => setTimeout(resolve, 0));
  api.emit(11, { status: 'complete' }, { id: 11, url: 'https://example.com/acceso', status: 'complete' });
  assert.equal((await pending).url, 'https://example.com/acceso');
});

test('el limitador respeta MAX de capturas por segundo', async () => {
  let current = 0;
  const waits = [];
  const throttle = createCaptureThrottle(2, { now: () => current, sleep: async ms => { waits.push(ms); current += ms; } });
  await throttle();
  await throttle();
  assert.deepEqual(waits, [500]);
});

function sampleData(count) {
  return { categories: [{ id: 'c1', accesses: Array.from({ length: count }, (_, index) => ({ id: 'a' + (index + 1), thumbnail: '' })) }] };
}

test('agrupa miniaturas de a 5 y confirma al final', async () => {
  const state = { data: sampleData(12) };
  const sizes = [];
  const batch = createBatchCommitter({
    load: () => state.data,
    save: async candidate => { sizes.push(candidate.categories[0].accesses.filter(a => a.thumbnail).length); state.data = candidate; }
  });
  for (let index = 1; index <= 12; index++) await batch.add('a' + index, 'img-' + index);
  await batch.flush();
  assert.equal(CAPTURE_BATCH_SIZE, 5);
  assert.deepEqual(sizes, [5, 10, 12]);
});

test('omite un acceso borrado antes de confirmar el lote', async () => {
  const state = { data: sampleData(6) };
  const snapshots = [];
  const batch = createBatchCommitter({
    load: () => state.data,
    save: async candidate => { snapshots.push(candidate); state.data = candidate; }
  });
  for (let index = 1; index <= 4; index++) await batch.add('a' + index, 'img-' + index);
  state.data.categories[0].accesses = state.data.categories[0].accesses.filter(access => access.id !== 'a5');
  await batch.add('a5', 'img-5');
  const saved = snapshots.at(-1);
  assert.equal(saved.categories[0].accesses.find(access => access.id === 'a5'), undefined);
  assert.equal(saved.categories[0].accesses.filter(access => access.thumbnail).length, 4);
});

test('no reemplaza una miniatura que ya existía', async () => {
  const state = { data: sampleData(2) };
  state.data.categories[0].accesses[0].thumbnail = 'existente';
  const batch = createBatchCommitter({ load: () => state.data, save: async candidate => { state.data = candidate; } });
  await batch.add('a1', 'nueva');
  await batch.add('a2', 'img-2');
  await batch.flush();
  assert.equal(findAccess(state.data, 'a1').thumbnail, 'existente');
  assert.equal(findAccess(state.data, 'a2').thumbnail, 'img-2');
});
