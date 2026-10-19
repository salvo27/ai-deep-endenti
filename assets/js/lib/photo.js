import { PHOTO_MAX_CHARS, isPhotoDataUrl } from './validate.js';

export const PHOTO_SIZE = 256;
const MAX_FILE_BYTES = 15 * 1024 * 1024;

// Ritaglio quadrato al centro e ricodifica in JPEG: la nuova immagine non porta con sé i metadati dell'originale (GPS, dispositivo).
export async function resizePhoto(file) {
  if (!file || !/^image\//.test(file.type || '')) throw new Error('Scegli un\'immagine JPEG, PNG o WebP.');
  if (file.size > MAX_FILE_BYTES) throw new Error('L\'immagine è troppo grande: massimo 15 MB.');
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('Formato non supportato: usa un\'immagine JPEG, PNG o WebP.');
  }
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = PHOTO_SIZE;
  canvas.height = PHOTO_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Il browser non riesce a elaborare l\'immagine.');
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
  bitmap.close?.();
  for (const quality of [0.85, 0.7, 0.5]) {
    const url = canvas.toDataURL('image/jpeg', quality);
    if (url.length <= PHOTO_MAX_CHARS && isPhotoDataUrl(url)) return url;
  }
  throw new Error('Non riesco a ridurre abbastanza l\'immagine.');
}
