import { normalizeData } from './model.js';

export function sectionSiblings(data, section) {
  return data.categories.filter(c => c.workspaceId === section.workspaceId && c.parentId === section.parentId);
}

export function reorderSection(data, sectionId, direction) {
  if (![1, -1].includes(direction)) throw new Error('Dirección inválida.');
  const section = data.categories.find(c => c.id === sectionId);
  if (!section) throw new Error('La sección ya no existe.');
  const siblings = sectionSiblings(data, section);
  const other = siblings[siblings.findIndex(c => c.id === sectionId) + direction];
  const candidate = structuredClone(data);
  if (!other) return candidate;
  const a = candidate.categories.findIndex(c => c.id === sectionId);
  const b = candidate.categories.findIndex(c => c.id === other.id);
  [candidate.categories[a], candidate.categories[b]] = [candidate.categories[b], candidate.categories[a]];
  return normalizeData(candidate);
}

export function moveSection(data, sectionId, workspaceId) {
  const candidate = structuredClone(data);
  const section = candidate.categories.find(c => c.id === sectionId);
  if (!section) throw new Error('La sección ya no existe.');
  if (!candidate.workspaces.some(w => w.id === workspaceId)) throw new Error('Selecciona un Workspace válido.');
  if (section.workspaceId === workspaceId) throw new Error('Elige otro Workspace.');
  const children = candidate.categories.filter(c => c.parentId === sectionId);
  section.workspaceId = workspaceId;
  // A moved subcategory becomes a top-level section; its old parent stays put.
  section.parentId = '';
  children.forEach(child => { child.workspaceId = workspaceId; });
  return normalizeData(candidate);
}
