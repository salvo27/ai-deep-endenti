import { api } from './lib/api.js';
import { h } from './lib/dom.js';
import { fmtDate } from './lib/format.js';
import { renderMarkdown } from './lib/markdown.js';
import { mentionChip } from './views/mention-chip.js';
import { canWrite, currentProjectId, readLocal, writeLocal } from './store.js';
import { ALL, MENTION_SOURCE } from './lib/mentions.js';
import { tx } from './i18n/index.js';

const t = tx.notes;

// Immagini delle note: file JPEG nello spazio privato «note-immagini», indicati nel testo con ![descrizione](immagine:idea/uuid.jpg).
// The immagine: mark is stored syntax, the same in every language.

export const MAX_NOTE_IMAGES = 20;
const PATH = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.jpg';
export const IMAGE_PATH_RE = new RegExp(`^${PATH}$`);
const POINTER_RE = new RegExp(`!\\[([^\\]\\n]*)\\]\\(immagine:(${PATH})\\)`, 'g'); // i18n-ignore: stored syntax
const EMBEDDED_RE = /!\[([^\]\n]*)\]\((data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+)\)/g;

// La prima riga non vuota è il titolo, senza i segni di Markdown.
export function noteTitle(text) {
  const first = String(text || '').split('\n').find((line) => line.trim()) || '';
  return first
    .replace(/!\[[^\]\n]*\]\([^)]*\)/g, '')
    .replace(/^\s*#{1,6}\s+/, '')
    .replace(/^\s*([-*+]|\d{1,3}[.)])\s+/, '')
    .replace(/\*\*|__|[*_\x60]/g, '') // \x60 is the backtick, written so for the text scanner of the tests
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

// Il testo senza la riga del titolo, per non ripeterlo sotto l'intestazione della pagina.
export function noteBody(text, title) {
  const lines = String(text || '').split('\n');
  const index = lines.findIndex((line) => line.trim());
  if (index < 0 || noteTitle(lines[index]) !== title) return String(text || '');
  return lines.slice(index + 1).join('\n').replace(/^\s*\n/, '');
}

export const imagePaths = (text) => new Set([...String(text || '').matchAll(POINTER_RE)].map((m) => m[2]));
export const imagePointer = (path, alt = t.images.description) => `![${String(alt).replace(/[[\]\n]/g, ' ').trim() || t.images.description}](immagine:${path})`; // i18n-ignore: stored syntax

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_BYTES = 900 * 1024;

// Ridotta e ricodificata in JPEG: niente metadati dell'originale (GPS, dispositivo) e peso sotto 1 MB.
export async function resizeNoteImage(source) {
  if (!source || !/^image\//.test(source.type || '')) throw new Error(t.images.chooseImage);
  if (source.size > MAX_FILE_BYTES) throw new Error(t.images.tooLarge);
  let bitmap;
  try {
    bitmap = await createImageBitmap(source);
  } catch {
    throw new Error(t.images.unsupported);
  }
  try {
    for (const side of [1600, 1200, 900]) {
      const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error(t.images.cannotProcess);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.82, 0.7]) {
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
        if (blob && blob.size <= MAX_BYTES) return blob;
      }
    }
  } finally {
    bitmap.close?.();
  }
  throw new Error(t.images.cannotReduce);
}

const urls = new Map();

// Le immagini si scaricano con la sessione dell'utente e si mostrano come blob: nessun link pubblico.
export function imageUrl(path) {
  if (!IMAGE_PATH_RE.test(path)) return Promise.resolve(null);
  if (!urls.has(path)) {
    urls.set(
      path,
      api
        .downloadNoteImage(path)
        .then((blob) => URL.createObjectURL(blob))
        .catch(() => {
          urls.delete(path);
          return null;
        }),
    );
  }
  return urls.get(path);
}

export async function uploadNoteImage(ideaId, source) {
  const blob = await resizeNoteImage(source);
  const path = `${ideaId}/${crypto.randomUUID()}.jpg`;
  await api.uploadNoteImage(path, blob);
  urls.set(path, Promise.resolve(URL.createObjectURL(blob)));
  return path;
}

// Dopo un salvataggio: le immagini tolte dal testo si cancellano, se nessun'altra nota le usa (lo decide il database, guardando
// il progetto aperto). Without a project nothing is deleted.
export async function removeUnusedImages(beforeText, afterText) {
  const project = currentProjectId();
  const after = imagePaths(afterText);
  const removed = [...imagePaths(beforeText)].filter((path) => !after.has(path));
  if (!removed.length || !project) return [];
  const orphans = await api.noteImageOrphans(removed, project);
  await api.removeNoteImages(orphans);
  orphans.forEach((path) => urls.delete(path));
  return orphans;
}

const SWEEP_EVERY = 12 * 3600 * 1000;

// Pulizia periodica: immagini di note cancellate definitivamente o mai salvate, caricate da più di 24 ore. Only those of the
// open project, each project with its own turn; without a project nothing is swept.
export async function sweepNoteImages() {
  const project = currentProjectId();
  if (!project || !canWrite()) return 0;
  const key = `pulizieImmagini:${project}`;
  const last = Number(readLocal(key, 0)) || 0;
  if (Date.now() - last < SWEEP_EVERY) return 0;
  writeLocal(key, Date.now());
  try {
    const orphans = await api.noteImageOrphans(null, project);
    for (let i = 0; i < orphans.length; i += 100) await api.removeNoteImages(orphans.slice(i, i + 100));
    return orphans.length;
  } catch {
    return 0;
  }
}

async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${blob.type || 'image/jpeg'};base64,${btoa(binary)}`;
}

function dataUrlToBlob(dataUrl) {
  const [head, data] = dataUrl.split(',');
  const type = /data:([^;]+)/.exec(head)?.[1] || 'image/png';
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

// File .md autonomo: le immagini finiscono dentro il file, così si apre anche fuori dal sito.
export async function noteToMarkdown(note) {
  let body = noteBody(note.data?.body, note.title);
  for (const [pointer, alt, path] of [...body.matchAll(POINTER_RE)]) {
    let replacement = `*[${t.markdown.unavailable(alt)}]*`;
    try {
      replacement = `![${alt}](${await blobToDataUrl(await api.downloadNoteImage(path))})`;
    } catch {
      // resta il segnaposto
    }
    body = body.replace(pointer, () => replacement);
  }
  const date = note.data?.date ? `${t.markdown.date(note.data.date)}\n\n` : '';
  return `# ${note.title}\n\n${date}${body}\n`;
}

// Da un file .md: la prima riga resta il titolo della nota, le immagini incorporate vengono caricate nello spazio privato.
export async function markdownToNote(text, ideaId, { onProgress } = {}) {
  let body = String(text || '').replace(/\r\n?/g, '\n').trimStart();
  const embedded = [...body.matchAll(EMBEDDED_RE)];
  let done = 0;
  for (const [match, alt, dataUrl] of embedded) {
    let replacement = `*[${t.markdown.notImported(alt || t.markdown.unnamed)}]*`;
    if (done < MAX_NOTE_IMAGES) {
      replacement = imagePointer(await uploadNoteImage(ideaId, dataUrlToBlob(dataUrl)), alt);
      done += 1;
      onProgress?.(done, Math.min(embedded.length, MAX_NOTE_IMAGES));
    }
    body = body.replace(match, () => replacement);
  }
  return { title: noteTitle(body), body };
}

export function noteImageNode(path, alt) {
  const img = h('img', { class: 'note-image is-loading', alt: alt || t.images.alt, loading: 'lazy' });
  imageUrl(path).then((url) => {
    if (url) {
      img.src = url;
      img.classList.remove('is-loading');
    } else {
      img.replaceWith(h('span', { class: 'note-image-missing' }, t.images.missing(alt)));
    }
  });
  return img;
}

export const renderNote = (text) => h('div', { class: 'markdown note-body' }, renderMarkdown(text, { image: noteImageNode, links: true, mention: mentionChip }));

const PRINT_WAIT = 8000;

const whenLoaded = (img) =>
  img.complete
    ? Promise.resolve()
    : new Promise((done) => {
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
      });

// PDF dal dialogo di stampa del browser: la nota si copia in un blocco a parte, che in stampa è l'unica cosa visibile.
export async function printNote(note) {
  document.getElementById('print-root')?.remove();
  const body = noteBody(note.data?.body, note.title);
  const root = h(
    'div',
    { id: 'print-root', class: 'print-root' },
    h('h1', null, note.title),
    note.data?.date ? h('p', { class: 'muted' }, fmtDate(note.data.date)) : null,
    body.trim() ? renderNote(body) : null,
  );
  root.querySelectorAll('img').forEach((img) => img.setAttribute('loading', 'eager'));
  document.body.append(root);
  await Promise.all([...imagePaths(body)].map(imageUrl));
  let timer;
  const images = [...root.querySelectorAll('img.note-image')].filter((img) => img.getAttribute('src'));
  await Promise.race([Promise.all(images.map(whenLoaded)), new Promise((done) => (timer = setTimeout(done, PRINT_WAIT)))]);
  clearTimeout(timer);

  const previousTitle = document.title;
  document.title = note.title;
  document.body.classList.add('print-note');
  window.addEventListener(
    'afterprint',
    () => {
      document.title = previousTitle;
      document.body.classList.remove('print-note');
      root.remove();
    },
    { once: true },
  );
  window.print();
}

// A tag is stored as @[Name] or @[tutti] in every language: as plain text it reads @Name, or @ and the reader's word
// for everyone.
const MENTIONS = new RegExp(MENTION_SOURCE, 'g');
const mentionWords = (_, name) => `@${name.trim().toLowerCase() === ALL ? tx.mentions.everyone : name.trim()}`;

/** A short plain text of a note or a message, for alerts, quotes and cards: no images, links as their words, tags said. */
export function noteExcerpt(text, max = 180) {
  const plain = String(text || '')
    .replace(MENTIONS, mentionWords)
    .replace(/!\[[^\]\n]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]\n]+)\]\([^)]*\)/g, '$1')
    .replace(/[#*_\x60>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain;
}
