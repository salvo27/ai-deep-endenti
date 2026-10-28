// Questionario di prova per la pagina pubblica: dati inventati, usati dall'anteprima e dai test.
export const TOKEN = 'Qx7pL2mN9vR4tY6wZ1bC3d';

const privacy = Array.from({ length: 40 }, (_, i) => `Frase ${i + 1} dell'informativa di prova.`).join(' ');

export const SURVEY = {
  status: 'aperto',
  title: 'Come organizzi la spesa',
  intro: 'Siamo un gruppo di studenti e stiamo studiando come le persone organizzano la spesa.\nNon vendiamo nulla.',
  privacy: `${privacy} Fine dell'informativa.`,
  thanks: 'Grazie per il tuo tempo!',
  layout: 'una',
  progress: 'contatore',
  show_time: true,
  median_seconds: null,
  appearance: { theme: 'automatico', accent: '#3b4bc8' },
  questions: [
    { id: 'chi', type: 'sezione', label: 'Su di te', help: '', required: false },
    {
      id: 'eta',
      type: 'scelta',
      label: 'Quanti anni hai?',
      help: '',
      required: true,
      options: [
        { id: 'meno-30', label: 'Meno di 30' },
        { id: 'da-30-a-50', label: 'Da 30 a 50' },
        { id: 'oltre-50', label: 'Più di 50' },
      ],
      allow_other: false,
      prefer_not: true,
    },
    { id: 'lavoro', type: 'breve', label: 'Che lavoro fai?', help: '', required: false },
    { id: 'spesa', type: 'sezione', label: 'L\'ultima spesa', help: 'Pensa alle ultime quattro settimane.', required: false },
    {
      id: 'dove',
      type: 'scelte',
      label: 'Dove hai fatto la spesa?',
      help: 'Scegli tutte le risposte giuste.',
      required: false,
      options: [
        { id: 'super', label: 'Supermercato' },
        { id: 'mercato', label: 'Mercato' },
        { id: 'online', label: 'Online' },
      ],
      allow_other: true,
      prefer_not: true,
    },
    { id: 'fatica', type: 'scala', label: 'Quanta fatica ti è costata l\'ultima volta?', help: '', required: false, scale: { points: 5, min_label: 'Nessuna', max_label: 'Moltissima' } },
    { id: 'volte', type: 'numero', label: 'Quante volte hai fatto la spesa?', help: '', required: false, number: { min: 0, max: 60 } },
    { id: 'racconto', type: 'lunga', label: 'Raccontaci l\'ultima volta che hai dimenticato qualcosa.', help: '', required: false },
    { id: 'mail', type: 'email', label: 'La tua email', help: 'Facoltativa: serve solo per ricontattarti.', required: false },
  ],
};
