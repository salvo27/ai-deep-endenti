// Testi in italiano: è la lingua di riferimento, l'inglese ne segue la forma.
// Il guscio del sito: menu laterale con il selettore del progetto, ricerca, persone online e uscita.
export const shell = {
  // Gruppi del menu. Il dispositivo ricorda quelli chiusi con una chiave che non cambia con la lingua (views/shell.js).
  groups: {
    work: 'Lavoro',
    tools: 'Strumenti',
    team: 'Team',
    system: 'Sistema',
  },
  nav: {
    dashboard: 'Dashboard',
    ideas: 'Idee',
    scoring: 'Valutazione',
    experiments: 'Esperimenti',
    interviews: 'Interviste',
    surveys: 'Questionari',
    contacts: 'Contatti',
    decisions: 'Decisioni',
    chat: 'Chat',
    generator: 'Generatore',
    guide: 'Guida',
    squad: 'Squadra',
    members: 'Membri',
    expenses: 'Spese',
    history: 'Storico',
    trash: 'Cestino',
    projects: 'Progetti',
    profile: 'Profilo',
    signOut: 'Esci',
  },
  sections: 'Sezioni',
  menu: 'Menu',
  project: {
    label: 'Progetto',
    // Una voce del selettore: nome del progetto e mio ruolo.
    option: (name, role) => `${name} · ${role}`,
    choose: 'Scegli un progetto',
    none: 'Nessun progetto aperto',
  },
  search: {
    placeholder: 'Cerca nelle board',
    open: 'Cerca',
    close: 'Chiudi la ricerca',
    empty: 'Nessun risultato.',
  },
  signOut: {
    title: 'Vuoi uscire?',
    message: 'Per rientrare servono password e codice di verifica.',
    ok: 'Esci',
  },
  chatUnread: (n) => (n === 1 ? '1 messaggio da leggere' : `${n} messaggi da leggere`),
  presence: {
    label: 'Online ora',
    count: (n) => `${n} online`,
  },
  live: {
    title: 'Aggiornamenti dal vivo',
    on: 'Aggiornamenti dal vivo attivi',
    off: 'Aggiornamenti dal vivo non attivi: ricarica per vedere le novità',
  },
  offline: 'Sei offline: le modifiche non verranno salvate finché non torna la connessione.',
  user: {
    label: (name) => `Profilo di ${name}`,
    anonymous: 'chi è entrato',
  },
};
