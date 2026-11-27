// Testi in italiano: è la lingua di riferimento, l'inglese ne segue la forma.
export const mentions = {
  // Chi ti ha taggato e dove: «Bruno ti ha taggato nella nota «Idea alfa»».
  tagged: (who, where) => `${who} ti ha taggato ${where}`,
  inChat: (title) => `in «${title}»`,
  inNote: (title) => `nella nota «${title}»`,
  inComment: (title) => `in un commento su «${title}»`,
  note: 'nota',
  card: 'una scheda',
  // Il tag di tutto il progetto si salva sempre come @[tutti] (lo legge il database): qui solo come si mostra.
  everyone: 'tutti',
  wholeTeam: 'Tutta la squadra',
  notifyEveryone: 'avvisa tutta la squadra',
  // Il segnaposto che il database mette nell'anteprima al posto di un'immagine.
  image: 'immagine',
  suggestions: 'Persone da taggare',
  // Il pulsante @ in alto, con l'elenco delle menzioni.
  panel: {
    title: 'Menzioni',
    unread: (count) => `Menzioni, ${count} da leggere`,
    markAllRead: 'Segna tutte come lette',
    empty: 'Nessuna menzione. Quando qualcuno ti tagga con @ in chat, nei commenti o nelle note, lo vedi qui.',
  },
};
