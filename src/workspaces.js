import { normalizeData } from './model.js';

// Resume qué se perdería al eliminar un Workspace, sin modificar los datos.
export function workspaceDeletionImpact(data, workspaceId) {
  const workspace = data.workspaces.find(item => item.id === workspaceId);
  if (!workspace) throw new Error('El Workspace ya no existe.');
  const categories = data.categories.filter(item => item.workspaceId === workspaceId);
  return {
    workspace,
    categories: categories.length,
    subcategories: categories.filter(item => item.parentId).length,
    accesses: categories.reduce((total, item) => total + item.accesses.length, 0)
  };
}

export function workspaceDeletionSummary(data, workspaceId) {
  const impact = workspaceDeletionImpact(data, workspaceId);
  const count = (value, singular, plural) => value + ' ' + (value === 1 ? singular : plural);
  return 'Se eliminará el Workspace “' + impact.workspace.name + '” con ' +
    count(impact.categories, 'categoría', 'categorías') + ', ' +
    count(impact.subcategories, 'subcategoría', 'subcategorías') + ' y ' +
    count(impact.accesses, 'acceso', 'accesos') + '.';
}

// Solo elimina cuando la confirmación explícita llegó (`confirmed === true`).
// Devuelve null si el usuario cancela y no toca los datos.
export function deleteWorkspace(data, workspaceId, confirmed = false) {
  workspaceDeletionImpact(data, workspaceId);
  if (!confirmed) return null;
  if (data.workspaces.length <= 1) throw new Error('No puedes eliminar el último Workspace.');
  const candidate = structuredClone(data);
  candidate.workspaces = candidate.workspaces.filter(item => item.id !== workspaceId);
  candidate.categories = candidate.categories.filter(item => item.workspaceId !== workspaceId);
  if (!candidate.workspaces.some(item => item.id === candidate.activeWorkspaceId)) {
    const removedIndex = data.workspaces.findIndex(item => item.id === workspaceId);
    candidate.activeWorkspaceId = candidate.workspaces[Math.min(removedIndex, candidate.workspaces.length - 1)].id;
  }
  return normalizeData(candidate);
}
