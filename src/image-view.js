import { isImageRef } from './image-store.js';

// Only visible thumbnails acquire blobs; detached nodes release their object URLs.
export function createImageView(store, allowRemote) {
  const entries = new Map();
  async function load(img) {
    const entry = entries.get(img);
    if (!entry || entry.loading) return;
    entry.loading = true;
    const generation = ++entry.generation;
    try {
      if (entry.value.startsWith('https:') && !allowRemote()) { img.alt = 'Imagen remota desactivada'; return; }
      const url = isImageRef(entry.value) ? URL.createObjectURL(await store.get(entry.value)) : entry.value;
      if (entries.get(img) !== entry || generation !== entry.generation || !img.isConnected) { if (url.startsWith('blob:')) URL.revokeObjectURL(url); return; }
      entry.url = url;
      img.src = url;
    } catch { img.alt = 'Imagen no disponible'; }
  }
  const observer = new IntersectionObserver(items => {
    for (const item of items) {
      if (item.isIntersecting) load(item.target);
      else {
        const entry = entries.get(item.target);
        if (!entry) continue;
        entry.generation++;
        if (entry.url?.startsWith('blob:')) URL.revokeObjectURL(entry.url);
        entry.url = ''; entry.loading = false;
        item.target.removeAttribute('src');
      }
    }
  }, { rootMargin: '200px' });
  function release(img) {
    observer.unobserve(img);
    const entry = entries.get(img);
    if (entry?.url?.startsWith('blob:')) URL.revokeObjectURL(entry.url);
    entries.delete(img);
  }
  new MutationObserver(() => {
    for (const img of entries.keys()) if (!img.isConnected) release(img);
  }).observe(document.body, { childList: true, subtree: true });
  return {
    set(img, value) {
      release(img);
      img.removeAttribute('src');
      if (!value) return;
      entries.set(img, { value, generation: 0 });
      observer.observe(img);
    },
    clear(root) { for (const img of entries.keys()) if (root.contains(img)) release(img); },
    refresh() {
      for (const [img, entry] of [...entries]) { const value = entry.value; this.set(img, value); }
    }
  };
}
