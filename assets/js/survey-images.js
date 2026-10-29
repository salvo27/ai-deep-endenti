import { api } from './lib/api.js';
import { resizeNoteImage } from './notes.js';
import { canWrite, readLocal, writeLocal } from './store.js';

// Immagine della schermata iniziale dei questionari: JPEG ridotto e ripulito nel browser come quelli delle note,
// nello spazio pubblico «questionari-immagini», percorso <questionario>/<uuid>.jpg.

export async function uploadSurveyCover(surveyId, file) {
  const blob = await resizeNoteImage(file);
  const path = `${surveyId}/${crypto.randomUUID()}.jpg`;
  await api.uploadSurveyImage(path, blob);
  urls.set(path, Promise.resolve(URL.createObjectURL(blob)));
  return path;
}

const urls = new Map();

// Il sito non carica immagini da altri indirizzi: si scaricano e si mostrano come blob.
export function surveyCoverUrl(path) {
  if (!urls.has(path)) {
    urls.set(
      path,
      api
        .downloadSurveyImage(path)
        .then((blob) => URL.createObjectURL(blob))
        .catch(() => {
          urls.delete(path);
          return null;
        }),
    );
  }
  return urls.get(path);
}

const SWEEP_EVERY = 12 * 3600 * 1000;

// Pulizia periodica: immagini che nessun questionario usa più (cambiate, tolte o mai salvate), caricate da più di 24 ore.
export async function sweepSurveyImages() {
  if (!canWrite()) return 0;
  const last = Number(readLocal('pulizieImmaginiQuestionari', 0)) || 0;
  if (Date.now() - last < SWEEP_EVERY) return 0;
  writeLocal('pulizieImmaginiQuestionari', Date.now());
  try {
    const orphans = await api.surveyImageOrphans(null);
    for (let i = 0; i < orphans.length; i += 100) await api.removeSurveyImages(orphans.slice(i, i + 100));
    return orphans.length;
  } catch {
    return 0;
  }
}
