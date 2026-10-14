import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { canCloseDialog, bindDialogDismiss } from '../src/dialogs.js';
import { pinnedAccesses, togglePinned } from '../src/pins.js';
import { normalizeData, retainAccessMetadata } from '../src/model.js';
import { createBackupZip, readStoredZip } from '../src/backup.js';
import { projectSyncData, applyRemoteData } from '../src/sync.js';
import { workspaceWindowGroups, openWorkspaceWindows } from '../src/workspace-windows.js';
import { createRepository } from '../src/storage.js';
import { memoryArea, locks } from './helpers.js';
function library() {
 const data=normalizeData();
 data.workspaces.push({id:'other',name:'Otro',type:'standard'},{id:'empty',name:'Vacío',type:'standard'});
 data.categories[0].accesses=[{id:'one',title:'Uno',url:'https://example.com/',tags:[],matchType:'exact',thumbnail:''}];
 data.categories.push({id:'two',workspaceId:'other',name:'Otro',parentId:'',accesses:[{id:'local',title:'Local',url:'file:///tmp/a.html',tags:[],matchType:'exact',thumbnail:''},{id:'web',title:'Web',url:'https://other.test/',tags:[],matchType:'exact',thumbnail:''}]});
 return data;
}
test('cierre de diálogos: guardado bloquea todos y cada operación bloquea su propio diálogo',()=>{
 for(const id of ['accessDialog','settingsDialog','recaptureDialog','bookmarksDialog','windowsDialog']) assert.equal(canCloseDialog(id,{saving:true}),false);
 for(const [id,key] of [['accessDialog','imageBusy'],['recaptureDialog','recaptureBusy'],['bookmarksDialog','bookmarkBusy'],['windowsDialog','windowsBusy']]) {
  assert.equal(canCloseDialog(id,{[key]:true}),false);assert.equal(canCloseDialog('workspaceDialog',{[key]:true}),true);
 }
 assert.equal(canCloseDialog('accessDialog',{}),true);
});
test('fijar y desfijar no duplica, no mueve y no modifica la copia original',()=>{
 const original=library(),pinned=normalizeData(togglePinned(original,'one'));
 assert.equal(original.categories[0].accesses[0].pinned,undefined);
 assert.equal(pinned.categories[0].accesses.length,1);
 assert.deepEqual(pinnedAccesses(pinned,'general').map(item=>item.access.id),['one']);
 assert.deepEqual(pinnedAccesses(pinned,'other'),[]);
 assert.equal('pinned' in normalizeData(togglePinned(pinned,'one')).categories[0].accesses[0],false);
 assert.throws(()=>togglePinned(original,'missing'),/ya no existe/);
});
test('editar, persistir, sincronizar y restaurar ZIP conserva fijados',async()=>{
 const pinned=normalizeData(togglePinned(library(),'one')), original=pinned.categories[0].accesses[0];
 pinned.categories[0].accesses[0]=retainAccessMetadata({...original,title:'Editado',pinned:undefined},original);
 assert.equal(pinned.categories[0].accesses[0].pinned,true);
 const repo=createRepository(memoryArea(),locks()),snapshot=await repo.load(); await repo.save(pinned,snapshot.revision);
 assert.equal((await repo.load()).data.categories[0].accesses[0].pinned,true);
 const zip=new Uint8Array(await createBackupZip(pinned).arrayBuffer());assert.equal(readStoredZip(zip).categories[0].accesses[0].pinned,true);
 const projected=projectSyncData(pinned);assert.equal(projected.categories[0].accesses[0].pinned,true);
 const synced=applyRemoteData(library(),projected); assert.equal(synced.categories[0].accesses[0].pinned,true);
});
test('solo pinned booleano verdadero se conserva al normalizar',()=>{
 const data=library();data.categories[0].accesses[0].pinned='false';assert.equal('pinned' in normalizeData(data).categories[0].accesses[0],false);
});
function browser() {
 const windows=[];return {windows:{create:async options=>{windows.push(options);return{id:windows.length,tabs:options.url.map((url,i)=>({id:windows.length*100+i,url}))};}},
 tabs:{group:async()=>1},tabGroups:{update:async()=>{}},extension:{isAllowedFileSchemeAccess:async()=>false},created:windows};
}
test('ventanas por Workspace: selección, deduplicación, grupos vacíos y archivos sin permiso',async()=>{
 const data=library();data.categories[0].accesses.push({...data.categories[0].accesses[0],id:'copy'});
 assert.deepEqual(workspaceWindowGroups(data).map(item=>item.count),[1,2,0]);
 const api=browser();const results=await openWorkspaceWindows(data,['other','empty','other'],api,locks());
 assert.equal(results.length,1);assert.equal(results[0].opened,1);assert.equal(results[0].failed,1);
 assert.deepEqual(api.created[0].url,['https://other.test/']);
 assert.equal(api.created.length,1);
});
test('fallar un Workspace permite abrir los siguientes; sin selección no crea nada',async()=>{
 const data=library(),api=browser(),create=api.windows.create;
 api.windows.create=async options=>{if(options.url[0]==='https://example.com/')throw new Error('Ventana bloqueada');return create(options);};
 const results=await openWorkspaceWindows(data,['general','other'],api,locks());
 assert.equal(results[0].opened,0);assert.equal(results[0].failed,1);assert.equal(results[1].opened,1);
 assert.deepEqual(await openWorkspaceWindows(data,[],api,locks()),[]);
});

test('cerrar la elección de sincronización resuelve como cancelación; elegir conserva el resultado',async()=>{
 const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
 const source=app.slice(app.indexOf('function askFirstSync()'),app.indexOf('async function activateSync()'));
 for(const choice of [null,'local','cloud','merge']) {
  const dialog=new EventTarget();dialog.open=false;dialog.showModal=()=>dialog.open=true;
  dialog.close=()=>{if(dialog.open){dialog.open=false;queueMicrotask(()=>dialog.dispatchEvent(new Event('close')));}};
  const controls={syncChoiceDialog:dialog,syncChoiceLocal:{},syncChoiceCloud:{},syncChoiceMerge:{}};
  const ask=vm.runInNewContext(source+'\naskFirstSync',{$:id=>controls[id]});
  const result=ask();if(choice===null)dialog.close();else controls['syncChoice'+choice[0].toUpperCase()+choice.slice(1)].onclick();
  assert.equal(await result,choice);
 }
});
test('cierre uniforme distingue clic fuera, clic dentro y arrastre desde dentro; bloquear Escape funciona sin foco en formulario',()=>{
 const doc=new EventTarget(),dialog=new EventTarget(),control={};let closed=0;
 dialog.id='accessDialog';dialog.open=true;dialog.ownerDocument=doc;
 dialog.querySelector=selector=>selector==='form'?{}:control;dialog.querySelectorAll=()=>[control];
 dialog.getBoundingClientRect=()=>({left:10,right:50,top:10,bottom:50});dialog.close=()=>closed++;
 const state={saving:false};bindDialogDismiss(dialog,()=>state);
 const pointer=(type,x)=>{const event=new Event(type);event.clientX=x;event.clientY=x;dialog.dispatchEvent(event);};
 pointer('pointerdown',20);pointer('click',0);assert.equal(closed,0);
 pointer('pointerdown',0);pointer('click',0);assert.equal(closed,1);
 state.saving=true;control.onclick();pointer('pointerdown',0);pointer('click',0);assert.equal(closed,1);
 const escape=new Event('keydown',{cancelable:true});escape.key='Escape';doc.dispatchEvent(escape);assert.equal(escape.defaultPrevented,true);
 state.saving=false;control.onclick();assert.equal(closed,2);
});
