import test from 'node:test';
import assert from 'node:assert/strict';
import { groupTitleForUrl, groupColorFor, proposeTabGroups, planGroupActions, groupingSummary, GROUP_COLORS } from '../src/grouping.js';
import { DEFAULT_DATA } from '../src/model.js';

const rules = DEFAULT_DATA.autoTagRules;
let nextId = 1;
const tab = (url, extra = {}) => ({ id: nextId++, windowId: 1, groupId: -1, pinned: false, url, ...extra });

test('el título sale de la regla automática más específica o del dominio sin www', () => {
  assert.equal(groupTitleForUrl('https://mail.google.com/mail/u/0/#inbox', rules), 'Gmail');
  assert.equal(groupTitleForUrl('https://www.google.com/search?q=x', rules), 'Google');
  assert.equal(groupTitleForUrl('https://www.figma.com/file/abc', rules), 'Figma');
  assert.equal(groupTitleForUrl('https://usuario.github.io/demo', rules), 'GitHub');
  assert.equal(groupTitleForUrl('https://www.ejemplo.cl/a', rules), 'ejemplo.cl');
  assert.equal(groupTitleForUrl('chrome://settings', rules), '');
  assert.equal(groupTitleForUrl('file:///Users/a/b.html', rules), '');
  assert.equal(groupTitleForUrl('no es url', rules), '');
});

test('4 Gmail con URLs distintas forman un solo grupo «Gmail» y Figma otro', () => {
  const tabs = [
    tab('https://mail.google.com/mail/u/0/#inbox'), tab('https://mail.google.com/mail/u/0/#sent'),
    tab('https://mail.google.com/mail/u/1/#inbox'), tab('https://mail.google.com/mail/u/0/#label/x'),
    tab('https://www.figma.com/file/1'), tab('https://figma.com/file/2'),
    tab('https://solo.example.com/')
  ];
  const proposals = proposeTabGroups(tabs, rules);
  assert.deepEqual(proposals.map(p => [p.title, p.tabIds.length]), [['Gmail', 4], ['Figma', 2]]);
  assert.ok(GROUP_COLORS.includes(proposals[0].color));
  assert.equal(proposals[0].existingGroupId, null);
});

test('excluye fijadas, páginas de la extensión y no web; exige mínimo 2', () => {
  const tabs = [
    tab('https://github.com/a', { pinned: true }), tab('https://github.com/b'),
    tab('chrome-extension://abc/newtab.html'), tab('chrome-extension://abc/newtab.html'),
    tab('chrome://extensions'), tab('about:blank'),
    tab('https://notion.so/x', { windowType: 'popup' }), tab('https://notion.so/y')
  ];
  assert.deepEqual(proposeTabGroups(tabs, rules, { extensionOrigin: 'chrome-extension://abc/' }), []);
});

test('agrupa por ventana salvo que se reúnan en la ventana actual', () => {
  const tabs = [
    tab('https://miro.com/1', { windowId: 1 }), tab('https://miro.com/2', { windowId: 1 }),
    tab('https://miro.com/3', { windowId: 2 }), tab('https://miro.com/4', { windowId: 2 }),
    tab('https://docs.google.com/a', { windowId: 1 }), tab('https://docs.google.com/b', { windowId: 2 })
  ];
  const perWindow = proposeTabGroups(tabs, rules);
  assert.deepEqual(perWindow.map(p => [p.title, p.windowId, p.tabIds.length]).sort(), [['Miro', 1, 2], ['Miro', 2, 2]]);
  const gathered = proposeTabGroups(tabs, rules, { targetWindowId: 7 });
  assert.deepEqual(gathered.map(p => [p.title, p.windowId, p.tabIds.length]), [['Miro', 7, 4], ['Docs', 7, 2]]);
});

test('reutiliza el grupo existente con el mismo título (sin distinguir mayúsculas) y omite lo ya agrupado', () => {
  const existingGroups = [{ id: 50, windowId: 1, title: 'gmail', color: 'red' }, { id: 60, windowId: 2, title: 'Figma', color: 'blue' }];
  const a = tab('https://mail.google.com/1', { groupId: 50 });
  const b = tab('https://mail.google.com/2');
  const f1 = tab('https://figma.com/1', { groupId: 99 });
  const f2 = tab('https://figma.com/2', { groupId: 99 });
  const solo = tab('https://figma.com/3', { windowId: 2 });
  const proposals = proposeTabGroups([a, b, f1, f2, solo], rules, { existingGroups });
  const gmail = proposals.find(p => p.title === 'gmail');
  assert.equal(gmail.existingGroupId, 50);
  assert.equal(gmail.color, 'red');
  assert.deepEqual(gmail.pendingTabIds, [b.id]);
  // Una sola pestaña basta si ya hay un grupo con ese nombre en su ventana.
  const figma2 = proposals.find(p => p.windowId === 2);
  assert.equal(figma2.existingGroupId, 60);
  assert.deepEqual(figma2.tabIds, [solo.id]);
  // El grupo de ventana 1 (Figma en otro grupo sin título coincidente) se propone nuevo.
  assert.equal(proposals.find(p => p.title === 'Figma' && p.windowId === 1).existingGroupId, null);
  // Todo ya agrupado: no hay nada que proponer.
  assert.deepEqual(proposeTabGroups([a, tab('https://mail.google.com/3', { groupId: 50 })], rules, { existingGroups }), []);
});

test('planGroupActions reutiliza por título, fusiona renombrados y respeta el mínimo', () => {
  const existingGroups = [{ id: 9, windowId: 1, title: 'Trabajo' }];
  const actions = planGroupActions([
    { title: 'Trabajo', windowId: 1, tabIds: [1, 2] },
    { title: ' trabajo ', windowId: 1, tabIds: [2, 3] },
    { title: 'Diseño', windowId: 1, tabIds: [4, 5] },
    { title: 'Diseño', windowId: 2, tabIds: [6] },
    { title: '   ', windowId: 1, tabIds: [7, 8] }
  ], existingGroups);
  assert.deepEqual(actions, [
    { title: 'Trabajo', windowId: 1, tabIds: [1, 2, 3], groupId: 9, color: null },
    { title: 'Diseño', windowId: 1, tabIds: [4, 5], groupId: null, color: groupColorFor('Diseño') }
  ]);
});

test('el color es estable por nombre y el resumen es legible', () => {
  assert.equal(groupColorFor('Gmail'), groupColorFor('gmail '));
  assert.ok(GROUP_COLORS.includes(groupColorFor('Figma')));
  assert.equal(groupingSummary({ created: 2, reused: 1, tabs: 9 }), '2 grupos creados y 1 grupo reutilizado · 9 pestañas agrupadas.');
  assert.equal(groupingSummary({ created: 1, tabs: 1 }), '1 grupo creado · 1 pestaña agrupada.');
  assert.equal(groupingSummary(), 'No había pestañas que agrupar.');
});
