import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const endpoint = process.env.NEXB_CDP_ENDPOINT || 'http://127.0.0.1:9228';
const extensionPath = resolve(new URL('..', import.meta.url).pathname);
class CDP {
  constructor(url) { this.socket = new WebSocket(url); this.pending = new Map(); this.events = []; this.id = 0; this.socket.addEventListener('message', event => { const msg = JSON.parse(event.data); if (msg.id) { const task = this.pending.get(msg.id); this.pending.delete(msg.id); msg.error ? task?.reject(new Error(JSON.stringify(msg.error))) : task?.resolve(msg.result); } else this.events.push(msg); }); }
  async ready() { if (this.socket.readyState === 1) return; await new Promise((resolve, reject) => { this.socket.addEventListener('open', resolve, { once: true }); this.socket.addEventListener('error', reject, { once: true }); }); }
  async send(method, params = {}) { await this.ready(); const id = ++this.id; return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.socket.send(JSON.stringify({ id, method, params })); }); }
  async evaluate(expression) { const value = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (value.exceptionDetails) throw new Error(JSON.stringify(value.exceptionDetails)); return value.result.value; }
  close() { this.socket.close(); }
}
const sockets = [];
async function connect(url) { const client = new CDP(url); sockets.push(client); await client.ready(); return client; }
async function page(browser, url) {
  const { targetId } = await browser.send('Target.createTarget', { url });
  const targets = await (await fetch(endpoint + '/json/list')).json();
  const client = await connect(targets.find(item => item.id === targetId).webSocketDebuggerUrl);
  await client.send('Runtime.enable'); await client.send('Page.enable'); return client;
}
async function wait(client, expression) {
  for (let i = 0; i < 100; i++) { if (await client.evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error('Timeout: ' + expression);
}
const checks = [];
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=';
let browser;
try {
  const info = await (await fetch(endpoint + '/json/version')).json();
  browser = await connect(info.webSocketDebuggerUrl);
  const { id } = await browser.send('Extensions.loadUnpacked', { path: extensionPath });
  const client = await page(browser, `chrome-extension://${id}/newtab.html`);
  await wait(client, "document.getElementById('footerVersion')?.textContent === 'v2.1.1'");
  assert.equal(await client.evaluate("document.getElementById('footerKofi').href"), 'https://ko-fi.com/G5A528GFJQ'); checks.push('carga real, versión y Ko-fi');
  const fixture = await client.evaluate(`(async () => { const {normalizeData}=await import('./src/model.js'); const data=normalizeData(); data.categories[0].accesses=Array.from({length:45}, (_,i)=>({id:'test-'+i,title:'Recurso de prueba '+i,url:'https://example.com/'+i,tags:[],matchType:'exact',thumbnail:${JSON.stringify(png)}})); return data; })()`);
  await client.evaluate(`chrome.storage.local.clear().then(()=>chrome.storage.local.set({workspaceData:${JSON.stringify(fixture)},workspaceDataBackup:${JSON.stringify(fixture)},workspaceRevision:5}))`);
  await client.send('Page.reload');
  await wait(client, "document.querySelectorAll('.card').length === 40");
  const migration = await client.evaluate("(async()=>{const all=await chrome.storage.local.get(null); const {createImageStore}=await import('./src/image-store.js'); const image=all.workspaceData.data.categories[0].accesses[0].thumbnail; return {version:all.workspaceData.imageStorageVersion,reference:image,exists:await createImageStore().hasAll([image])};})()");
  assert.equal(migration.version, 1); assert.match(migration.reference, /^nexb-image:/); assert.equal(migration.exists, true); checks.push('migración real a IndexedDB y paginación de 40 tarjetas');
  await wait(client, "!!document.querySelector('.thumbnail-image[src^=\"blob:\"]')"); checks.push('miniaturas desde blobs reales');
  const backup = await client.evaluate("(async()=>{const {backupTask}=await import('./src/backup-client.js'); const {materializeImages,createImageStore}=await import('./src/image-store.js'); const {workspaceData}=await chrome.storage.local.get('workspaceData'); const data=await materializeImages(workspaceData.data,createImageStore()); const zip=await backupTask('export',data); const restored=await materializeImages(await backupTask('import',null,await zip.arrayBuffer()),createImageStore()); return {count:restored.categories[0].accesses.length,image:restored.categories[0].accesses[0].thumbnail};})()");
  assert.equal(backup.count, 45); assert.equal(backup.image, png); checks.push('exportación e importación ZIP en Worker real');
  await client.evaluate("document.querySelector('.category-collapse').click()");
  await wait(client, "document.querySelector('.cards').hidden === true");
  await client.send('Page.reload'); await wait(client, "document.querySelector('.cards')?.hidden === true"); checks.push('plegado de sección persiste tras recarga');
  await client.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 800, deviceScaleFactor: 1, mobile: false });
  await client.evaluate("document.querySelector('.category-collapse').click(); document.getElementById('mainMenuToggle').click(); document.querySelector('[data-main-action=titlesOnly]').click()");
  await wait(client, "document.documentElement.dataset.titlesOnly === 'true'");
  assert.equal(await client.evaluate("getComputedStyle(document.querySelector('.card-open')).display"), 'none');
  assert.notEqual(await client.evaluate("getComputedStyle(document.querySelector('.card-title-link')).display"), 'none');
  await client.send('Page.reload'); await wait(client, "document.documentElement.dataset.titlesOnly === 'true' && !!document.querySelector('.card-title-link')"); checks.push('solo títulos, acceso por título y persistencia en ancho 360px');
  await client.evaluate("document.getElementById('openSettings').click(); document.getElementById('settingsDesignTab').click(); document.getElementById('thumbnailShadow').checked=false; document.getElementById('cardStyle').value='flat'; document.getElementById('cardBorder').value='none'; document.getElementById('cardBorderColor').value='#123456'; document.getElementById('settingsForm').requestSubmit()");
  await wait(client, "!document.getElementById('settingsDialog').open && document.documentElement.dataset.thumbnailShadow === 'false'");
  await client.send('Page.reload'); await wait(client, "document.documentElement.dataset.thumbnailShadow === 'false' && !!document.querySelector('.thumb')");
  const design = await client.evaluate("({shadow:getComputedStyle(document.querySelector('.thumb')).boxShadow,border:getComputedStyle(document.querySelector('.thumb')).borderTopWidth,color:document.documentElement.style.getPropertyValue('--card-border-color')})");
  assert.equal(design.shadow, 'none'); assert.equal(design.border, '0px'); assert.equal(design.color, '#123456'); checks.push('diseño guardado desde formulario, sin sombra y borde plano 0px');
  const permissions = await client.evaluate("chrome.permissions.getAll()");
  assert.ok(!permissions.permissions.includes('clipboardRead')); assert.ok(!permissions.permissions.includes('identity.email')); checks.push('permisos opcionales ausentes en instalación limpia');
  await client.evaluate("document.getElementById('mainMenuToggle').click(); document.querySelector('[data-main-action=titlesOnly]').click(); document.getElementById('searchToggle').click()");
  const narrow = await client.evaluate("({picker:document.getElementById('workspacePicker').getBoundingClientRect().width,search:document.getElementById('accessSearch').getBoundingClientRect().width,overflow:document.documentElement.scrollWidth>innerWidth})");
  assert.ok(narrow.picker >= 200); assert.ok(narrow.search >= 200); assert.equal(narrow.overflow, false); checks.push('selector y búsqueda legibles sin desbordamiento a 360px');
  const inventoryUrl = endpoint + '/json/version?inventory=' + Date.now();
  const inventoryPage = await page(browser, inventoryUrl);
  await wait(inventoryPage, "document.readyState === 'complete'");
  await inventoryPage.evaluate("document.title='Título de inventario muy largo para probar su truncado y búsqueda'");
  await client.evaluate("document.getElementById('openInventory').click()");
  await new Promise(resolve => setTimeout(resolve, 500));
  await wait(client, "!!Array.from(document.querySelectorAll('.inventory-row-title')).find(node=>node.title.startsWith('Título de inventario'))");
  const inventory = await client.evaluate("(()=>{const heading=Array.from(document.querySelectorAll('.inventory-row-title')).find(node=>node.title.startsWith('Título de inventario'));const row=heading.closest('.inventory-row'); return {text:heading.textContent,title:heading.title,url:row.title,search:row.querySelector('input').dataset.search,visibleUrl:!!row.querySelector('.inventory-row-url')};})()");
  assert.equal(inventory.text.length, 30); assert.ok(inventory.title.length > 30); assert.equal(inventory.url, inventoryUrl); assert.ok(inventory.search.includes('truncado y búsqueda')); assert.equal(inventory.visibleUrl, false); checks.push('inventario real: truncado, nombre completo para búsqueda y URL en tooltip');
  await client.evaluate("document.getElementById('inventoryDialog').close()");
  const grouping = await client.evaluate("(async()=>{const {openSectionInNewWindow}=await import('./src/tabs.js'); const result=await openSectionInNewWindow([{url:'https://example.com/one'},{url:'https://example.com/two'}],'Prueba · Recursos',chrome,navigator.locks);const group=await chrome.tabGroups.get(result.groupId);const tabs=await chrome.tabs.query({windowId:result.windowId});await chrome.windows.remove(result.windowId);return {result,title:group.title,count:tabs.length};})()");
  assert.equal(grouping.result.grouped, true); assert.equal(grouping.result.titled, true); assert.equal(grouping.title, 'Prueba · Recursos'); assert.equal(grouping.count, 2); checks.push('ventana y grupo nativos reales con título Workspace · sección');
  const errors = client.events.filter(event => event.method === 'Runtime.exceptionThrown'); assert.equal(errors.length, 0, JSON.stringify(errors));
  await client.send('Page.captureScreenshot').then(result => writeFile('/tmp/nexb-211-panel.png', Buffer.from(result.data, 'base64')));
  console.log(JSON.stringify({ browser: info.Browser, extensionId: id, checks, exceptions: errors.length }, null, 2));
} finally { for (const client of sockets) client.close(); }
