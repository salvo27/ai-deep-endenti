// Testi in italiano: è la lingua di riferimento, l'inglese ne segue la forma.
export const notes = {
  // La scheda Appunti di un'idea.
  tab: {
    intro: 'Riunioni, link, domande aperte e idee sparse su questa idea. Ogni nota è un testo Markdown, con immagini.',
    newNote: 'Nuova nota',
    empty: 'Nessuna nota. Scrivete qui gli appunti delle riunioni e tutto ciò che non sta in una scheda.',
  },
  // La pagina di una nota.
  page: {
    downloadMarkdown: 'Scarica .md',
    downloadPdf: 'Scarica PDF',
    fileName: 'nota',
    empty: 'La nota è vuota.',
  },
  // Le immagini di note e chat: ridotte nel browser, poi mostrate dallo spazio privato.
  images: {
    chooseImage: 'Scegli un\'immagine JPEG, PNG o WebP.',
    tooLarge: 'L\'immagine è troppo grande: massimo 25 MB.',
    unsupported: 'Formato non supportato: usa un\'immagine JPEG, PNG o WebP.',
    cannotProcess: 'Il browser non riesce a elaborare l\'immagine.',
    cannotReduce: 'Non riesco a ridurre abbastanza l\'immagine.',
    // La descrizione scritta nel testo quando l'immagine non ne ha una.
    description: 'immagine',
    alt: 'Immagine della nota',
    missing: (alt) => (alt ? `Immagine non più disponibile: ${alt}` : 'Immagine non più disponibile'),
  },
  // Il file .md di una nota, scaricato o importato.
  markdown: {
    date: (date) => `Data: ${date}`,
    unavailable: (alt) => `immagine non disponibile: ${alt}`,
    notImported: (alt) => `immagine non importata: ${alt}`,
    unnamed: 'senza nome',
  },
};
