// Testi in italiano: è la lingua di riferimento, l'inglese ne segue la forma.
// Disponibilità: ognuno segna quando è impegnato, il sito trova gli orari liberi in comune.

// Davanti a 1, 8 e 11 l'articolo si apostrofa: «dall'8», «fino all'11», «l'1». È una regola dell'italiano: sta solo qui.
const ELIDED = { il: "l'", dal: "dall'", al: "all'", del: "dell'" };

/** L'articolo davanti al giorno di una data (chiave AAAA-MM-GG), apostrofato quando serve. */
export function withDay(word, key, text) {
  return [1, 8, 11].includes(Number(String(key).slice(8, 10))) ? `${ELIDED[word]}${text}` : `${word} ${text}`;
}

const capital = (text) => String(text).charAt(0).toUpperCase() + String(text).slice(1);

export const availability = {
  // Le chiavi lun ... dom sono quelle salvate: qui solo i nomi da mostrare.
  days: { lun: 'lunedì', mar: 'martedì', mer: 'mercoledì', gio: 'giovedì', ven: 'venerdì', sab: 'sabato', dom: 'domenica' },
  daysShort: { lun: 'lun', mar: 'mar', mer: 'mer', gio: 'gio', ven: 'ven', sab: 'sab', dom: 'dom' },
  week: (mondayKey, from, sundayKey, to) => `${withDay('dal', mondayKey, from)} ${withDay('al', sundayKey, to)}`,
  slot: (day, date, start, end) => `${day} ${date}, ${start}-${end}`,
  // Per i lettori di schermo: «9-10» si leggerebbe male.
  hourSpan: (hour) => `dalle ${hour} alle ${hour + 1}`,
  // Il titolo che il database dà all'elemento, da mostrare dove compare.
  itemTitle: 'Impegni',
  views: { label: 'Vista', team: 'Orari della squadra', mine: 'I miei impegni' },
  hour: 'Ora',
  nav: {
    thisWeek: 'Questa settimana',
    nextWeek: 'La prossima settimana',
    inWeeks: (n) => `Tra ${n} settimane`,
    previous: 'Settimana precedente',
    next: 'Settimana successiva',
  },
  team: {
    intro: 'Ognuno segna quando è impegnato e il sito trova gli orari in cui siete liberi. Chi non ha segnato i suoi impegni non conta.',
    markYours: 'Segna i tuoi impegni',
    bestTitle: 'Orari migliori',
    chooseSomeone: 'Scegli almeno una persona qui sotto.',
    noneMarkedThisWeek: 'Nessuna delle persone scelte ha segnato i suoi impegni per questa settimana.',
    noneMarkedWeek: 'Nessuna delle persone scelte ha segnato i suoi impegni per la settimana scelta.',
    noCommonThisWeek: 'Nessun orario libero in comune in questa settimana.',
    noCommonWeek: (week) => `Nessun orario libero in comune ${week}.`,
    notCounting: (list) => `Non contano: ${list}.`,
    allFree: 'tutti liberi',
    busy: (count, names) => `${count === 1 ? 'manca' : 'mancano'} ${names}`,
    unknownFor: (names) => `non si sa per ${names}`,
    gridLabel: (week) => `Persone libere ${week}`,
    freeOf: (free, counted) => `${free} liberi su ${counted}`,
    nobodyMarked: 'nessuno ha segnato i suoi impegni',
    cellWhen: (day, date, span) => `${day} ${date} ${span}`,
    cell: (when, what) => `${when}: ${what}`,
    pastCell: (when, what) => `${when}: ${what}, già passato`,
    past: 'già passato',
    tapHour: 'Tocca un\'ora per vedere chi è libero.',
    free: 'Liberi',
    busyPeople: 'Impegnati',
    unknown: 'Non si sa',
    legend: 'Nelle caselle: quanti sono liberi su quanti hanno segnato i loro impegni.',
    nobodyFree: 'Nessuno libero',
    everyoneFree: 'Tutti liberi',
    whoTitle: 'Chi deve esserci',
    whoHelp: 'Tocca una persona per toglierla o aggiungerla al calcolo. La scelta resta su questo dispositivo.',
    counts: 'conta',
    notCounts: 'non conta',
    neverMarked: 'non ha ancora segnato i suoi impegni',
    notMarked: 'non ha segnato i suoi impegni',
    expired: 'orario tipo scaduto',
    expiredOn: (key, date) => `orario tipo scaduto ${withDay('il', key, date)}`,
    countsUntil: (key, date) => `conta fino ${withDay('al', key, date)}`,
    updated: (when) => `aggiornato ${when}`,
  },
  mine: {
    intro: 'Tocca o trascina sulle ore in cui sei impegnato: lezioni, lavoro, allenamenti. Non serve dire cosa fai.',
    touchHint: 'Per scorrere la pagina, trascina sulla colonna delle ore.',
    scopeLabel: 'Cosa modifichi',
    base: 'Orario tipo',
    week: 'Una settimana precisa',
    until: 'Valido fino al',
    untilHelp: 'Per esempio la fine del semestre. Dopo questa data non conti più finché non la sposti. Lascia vuoto se non scade.',
    baseExpired: (key, date) => `Il tuo orario tipo è scaduto ${withDay('il', key, date)}: controllalo e cambia la data.`,
    onlyThisWeek: 'Per ora vale l\'orario tipo: quello che cambi qui vale solo per questa settimana.',
    onlyWeek: (week) => `Per ora vale l'orario tipo: quello che cambi qui vale solo ${week}.`,
    differentThisWeek: 'Questa settimana hai un orario diverso dall\'orario tipo.',
    differentWeek: (week) => `${capital(week)} hai un orario diverso dall'orario tipo.`,
    backToBase: 'Torna all\'orario tipo',
    weekBaseExpired: (key, date) => `Il tuo orario tipo è scaduto ${withDay('il', key, date)}: nei giorni a righe non conti. Se cambi qualcosa qui, vale tutta la settimana come la vedi.`,
    weekBaseUntil: (key, date) => `Il tuo orario tipo vale fino ${withDay('al', key, date)}: nei giorni a righe non conti. Se cambi qualcosa qui, vale tutta la settimana come la vedi.`,
    baseGrid: 'Il mio orario tipo',
    weekGrid: (week) => `I miei impegni ${week}`,
    cellBusy: (day, span) => `${day} ${span}, impegnato`,
    cellExpired: (label) => `${label}, orario tipo scaduto`,
    save: 'Salva i miei impegni',
    saving: 'Salvataggio in corso',
    unsaved: 'Modifiche non salvate',
    savedWhen: (when) => `Salvato ${when}`,
    notYetSaved: 'Finché non salvi, non conti negli orari migliori',
    leaveQuestion: 'Hai impegni non salvati. Uscire comunque?',
    leaveTitle: 'Impegni non salvati',
    leave: 'Esci',
    firstMessage: 'Primi impegni',
    updateMessage: 'Impegni aggiornati',
    saved: 'Impegni salvati.',
  },
};
