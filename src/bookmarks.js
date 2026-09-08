import { normalizeData, webUrl } from './model.js';

export async function readBookmarkFolder(api, folderId) {
  const [folder] = await api.get(folderId);
  if (!folder || folder.url) throw new Error('Selecciona una carpeta de favoritos válida.');
  // Deliberately not getTree/getSubTree: no recursive import or background traversal.
  const children = await api.getChildren(folderId);
  return { folder, children };
}

export function planBookmarkImport(data, children, { workspaceId, categoryId = '', name, folderId = '', folderTitle = '' }, uid) {
  if (!data.workspaces.some(w => w.id === workspaceId)) throw new Error('Selecciona un Workspace válido.');
  const candidate = structuredClone(data);
  const categories = candidate.categories.filter(c => c.workspaceId === workspaceId);
  let target = categoryId ? categories.find(c => c.id === categoryId) : null;
  if (categoryId && !target) throw new Error('La sección no pertenece a este Workspace.');
  const sectionName = (name || '').trim().slice(0, 120);
  if (!target) {
    if (!sectionName) throw new Error('Escribe el nombre de la sección.');
    target = categories.find(c => !c.parentId && c.name.toLocaleLowerCase() === sectionName.toLocaleLowerCase());
  }
  const seen = new Set(categories.flatMap(c => c.accesses.map(a => webUrl(a.url))));
  const stats = { added: 0, duplicates: 0, unsupported: 0, folders: 0 };
  const additions = [];
  for (const item of children) {
    if (!item.url) { stats.folders++; continue; }
    let url;
    try { url = webUrl(item.url); } catch { stats.unsupported++; continue; }
    if (seen.has(url)) { stats.duplicates++; continue; }
    seen.add(url);
    additions.push({ id: uid('access'), title: (item.title?.trim() || new URL(url).hostname).slice(0, 300),
      url, tags: [], thumbnail: '', matchType: 'document', bookmarkId: folderId ? item.id : '',
      bookmarkFolderId: folderId, bookmarkMissing: false });
  }
  stats.added = additions.length;
  if (additions.length || folderId) {
    if (!target) {
      target = { id: uid('category'), workspaceId, name: sectionName, parentId: '', bookmarkFolderId: '', bookmarkFolderTitle: '', accesses: [] };
      candidate.categories.push(target);
    }
    if (folderId) {
      target.bookmarkFolderId = folderId;
      target.bookmarkFolderTitle = folderTitle.slice(0, 120);
    }
    target.accesses.push(...additions);
  }
  return { data: normalizeData(candidate), stats };
}

export function syncBookmarkSection(data, categoryId, children, uid) {
  const candidate = structuredClone(data);
  const target = candidate.categories.find(category => category.id === categoryId);
  if (!target?.bookmarkFolderId) throw new Error('Esta sección no está vinculada a una carpeta de Favoritos.');
  const seenUrls = new Set(candidate.categories.filter(c => c.workspaceId === target.workspaceId)
    .flatMap(c => c.accesses.map(access => webUrl(access.url))));
  const valid = [], folderBookmarkIds = new Set();
  const stats = { added: 0, duplicates: 0, unsupported: 0, missing: 0, restored: 0, folders: 0 };
  for (const item of children) {
    if (!item.url) { stats.folders++; continue; }
    let url;
    try { url = webUrl(item.url); } catch { stats.unsupported++; continue; }
    folderBookmarkIds.add(item.id);
    valid.push({ item, url });
  }
  for (const access of target.accesses) {
    if (access.bookmarkFolderId !== target.bookmarkFolderId) continue;
    const missing = !folderBookmarkIds.has(access.bookmarkId);
    if (access.bookmarkMissing !== missing) {
      access.bookmarkMissing = missing;
      if (missing) stats.missing++; else stats.restored++;
    }
  }
  for (const { item, url } of valid) {
    const linked = target.accesses.find(access => access.bookmarkFolderId === target.bookmarkFolderId && access.bookmarkId === item.id);
    if (linked) { linked.bookmarkMissing = false; continue; }
    if (seenUrls.has(url)) { stats.duplicates++; continue; }
    seenUrls.add(url);
    target.accesses.push({ id: uid('access'), title: (item.title?.trim() || new URL(url).hostname).slice(0, 300), url,
      tags: [], thumbnail: '', matchType: 'document', bookmarkId: item.id, bookmarkFolderId: target.bookmarkFolderId, bookmarkMissing: false });
    stats.added++;
  }
  return { data: normalizeData(candidate), stats };
}

export function placeAccess(candidate, access, { sourceCategoryId, workspaceId, categoryId }, uid) {
  if (!candidate.workspaces.some(w => w.id === workspaceId)) throw new Error('Selecciona un Workspace válido.');
  const source = candidate.categories.find(c => c.id === sourceCategoryId);
  let target = candidate.categories.find(c => c.id === categoryId && c.workspaceId === workspaceId);
  if (!target && categoryId === '__new') {
    target = { id: uid('category'), name: 'General', workspaceId, parentId: '', accesses: [] };
    candidate.categories.push(target);
  }
  if (!target) throw new Error('Selecciona una categoría del Workspace de destino.');
  const index = source?.accesses.findIndex(a => a.id === access.id) ?? -1;
  const foundElsewhere = candidate.categories.some(c => c !== source && c.accesses.some(a => a.id === access.id));
  if (foundElsewhere) throw new Error('El acceso cambió de ubicación; cancela y vuelve a editar.');
  if (index >= 0 && source === target) target.accesses[index] = access;
  else {
    if (index >= 0) source.accesses.splice(index, 1);
    target.accesses.push(access);
  }
  return candidate;
}
