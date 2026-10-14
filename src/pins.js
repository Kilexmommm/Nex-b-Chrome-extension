export function pinnedAccesses(data, workspaceId) {
  return data.categories.filter(category => category.workspaceId === workspaceId)
    .flatMap(category => category.accesses.filter(access => access.pinned === true).map(access => ({ access, categoryId: category.id })));
}
export function togglePinned(data, accessId) {
  const candidate = structuredClone(data);
  const target = candidate.categories.flatMap(category => category.accesses).find(access => access.id === accessId);
  if (!target) throw new Error('El acceso ya no existe; recarga la página.');
  if (target.pinned) delete target.pinned; else target.pinned = true;
  return candidate;
}
