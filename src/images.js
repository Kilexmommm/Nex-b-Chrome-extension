import { LIMITS } from './model.js';

export async function resizeImage(blob) {
  if (!blob || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(blob.type)) throw new Error('Usa una imagen PNG, JPEG, WebP o GIF.');
  if (blob.size > LIMITS.image) throw new Error('La imagen supera 8 MB. Recorta la captura antes de pegarla.');
  const bitmap = await createImageBitmap(blob);
  try {
    if (bitmap.width * bitmap.height > 40_000_000) throw new Error('Imagen demasiado grande; usa una captura más pequeña.');
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    const canvas = new OffscreenCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const result = await canvas.convertToBlob({ type: 'image/webp', quality: 0.82 });
    return bytesToDataUrl(new Uint8Array(await result.arrayBuffer()), 'image/webp');
  } finally { bitmap.close(); }
}

export function bytesToDataUrl(bytes, mime) {
  const chunks = [];
  for (let i = 0; i < bytes.length; i += 16384) chunks.push(String.fromCharCode(...bytes.subarray(i, i + 16384)));
  return `data:${mime};base64,${btoa(chunks.join(''))}`;
}
