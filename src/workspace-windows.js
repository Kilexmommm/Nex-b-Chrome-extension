import { accessUrl } from './model.js';
import { openSectionInNewWindow } from './tabs.js';
export function workspaceWindowGroups(data) {
  return data.workspaces.map(workspace => {
    const accesses = data.categories.filter(category => category.workspaceId === workspace.id).flatMap(category => category.accesses);
    const urls = new Set();
    for (const access of accesses) { try { urls.add(accessUrl(access.url)); } catch {} }
    return { id: workspace.id, name: workspace.name, accesses, count: urls.size };
  });
}
export async function openWorkspaceWindows(data, selectedIds, api, locks) {
  const selected = new Set(selectedIds);
  const results = [];
  for (const group of workspaceWindowGroups(data)) {
    if (!selected.has(group.id) || !group.count) continue;
    try { results.push({ id: group.id, name: group.name, ...await openSectionInNewWindow(group.accesses, group.name, api, locks) }); }
    catch (error) { results.push({ id: group.id, name: group.name, opened: 0, failed: group.count, grouped: false, titled: false, error: error.message }); }
  }
  return results;
}
