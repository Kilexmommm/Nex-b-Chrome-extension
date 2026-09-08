const key = tag => tag.trim().toLocaleLowerCase();

export function collectTags(data) {
  const unique = new Map();
  const add = tag => { if (tag.trim() && !unique.has(key(tag))) unique.set(key(tag), tag.trim()); };
  data.categories.forEach(category => category.accesses.forEach(access => access.tags.forEach(add)));
  Object.values(data.autoTagRules).forEach(add);
  return [...unique.values()].sort((a, b) => a.localeCompare(b));
}

// The token at the caret is replaced, not appended beside a half-written tag.
export function tagToken(value, caret = value.length) {
  const start = caret === 0 ? 0 : value.lastIndexOf(',', caret - 1) + 1;
  const comma = value.indexOf(',', caret);
  const end = comma < 0 ? value.length : comma;
  return { start, end, query: key(value.slice(start, caret)) };
}
export function suggestTags(tags, value, caret = value.length) {
  const { start, end, query } = tagToken(value, caret);
  const selected = new Set((value.slice(0, start) + value.slice(end)).split(',').map(key).filter(Boolean));
  return tags.filter(tag => !selected.has(key(tag)) && key(tag).includes(query)).slice(0, 30);
}
export function insertTag(value, tag, caret = value.length) {
  const { start, end } = tagToken(value, caret);
  const before = value.slice(0, start).split(',').map(s => s.trim()).filter(Boolean);
  const after = value.slice(end).split(',').map(s => s.trim()).filter(Boolean);
  const used = new Set();
  const unique = entries => entries.filter(entry => { if (used.has(key(entry))) return false; used.add(key(entry)); return true; });
  const prefix = unique([...before, tag]).join(', ') + ', ';
  return { value: prefix + unique(after).join(', '), caret: prefix.length };
}
