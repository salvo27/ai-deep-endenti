// Testi in italiano: è la lingua di riferimento, l'inglese ne segue la forma.
export const profile = {
  language: {
    title: 'Lingua',
    help: 'Il sito usa la lingua del dispositivo: italiano se è in italiano, inglese negli altri casi. Qui puoi sceglierne una per questo dispositivo.',
    label: 'Lingua del sito',
    auto: (name) => `Automatica (${name})`,
    saveFailed: 'Non riesco a salvare la scelta su questo dispositivo.',
  },
};
