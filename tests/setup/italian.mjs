// Finds Italian left in what should be English: in the source of the site (string literals) and in rendered pages.
// A heuristic, tuned on the site's own texts: accented letters, the commonest Italian function words and the words
// of the interface that do not exist in English.

const FUNCTION_WORDS = [
  'il', 'lo', 'gli', 'della', 'delle', 'dello', 'degli', 'del', 'dei', 'dal', 'dalla', 'nel', 'nella', 'nelle', 'sul', 'sulla',
  'una', 'uno', 'di', 'da', 'per', 'con', 'che', 'non', 'sono', 'questo', 'questa', 'questi', 'queste', 'quando', 'anche',
  'ancora', 'già', 'più', 'solo', 'tutti', 'tutte', 'ogni', 'nessun', 'nessuna', 'nessuno', 'oppure', 'perché', 'come', 'dove',
  'chi', 'cosa', 'tra', 'fra', 'qui', 'ecco', 'hai', 'ha', 'è', 'sei', 'puoi', 'devi', 'deve', 'serve', 'manca', 'mancano',
];

const UI_WORDS = [
  'salva', 'salvato', 'salvata', 'annulla', 'conferma', 'chiudi', 'elimina', 'eliminato', 'modifica', 'modifiche', 'aggiungi',
  'cerca', 'nuovo', 'nuova', 'indietro', 'avanti', 'esci', 'carica', 'scarica', 'risposte', 'risposta', 'domande', 'domanda',
  'membri', 'membro', 'spese', 'spesa', 'idee', 'stato', 'titolo', 'nome', 'colore', 'ruolo', 'oggi', 'ieri', 'domani',
  'settimana', 'mese', 'anno', 'giorno', 'giorni', 'appunti', 'commenti', 'commento', 'voti', 'storico', 'cestino', 'ripristina',
  'questionario', 'questionari', 'esperimento', 'esperimenti', 'intervista', 'interviste', 'decisione', 'decisioni', 'contatti',
  'persone', 'squadra', 'valutazione', 'generatore', 'guida', 'profilo', 'impegni', 'ore lavorate', 'gruppo', 'saldi', 'movimenti',
  'statistiche', 'condividi', 'aspetto', 'impostazioni', 'errore', 'riprova', 'caricamento', 'invia', 'inviato', 'scegli',
  'apri', 'aperto', 'chiuso', 'bozza', 'fatto', 'fatta', 'da fare', 'mostra', 'nascondi', 'tutto', 'niente', 'nessuno',
  'lavoro', 'strumenti', 'sistema', 'sezioni', 'sezione', 'pagina', 'pagine', 'avvio', 'ricarica', 'scheda', 'schede', 'elenco',
  'tabella', 'colonne', 'fase', 'fasi', 'passo', 'passi', 'prossimo', 'prossima', 'ultimo', 'ultima', 'primo', 'prima', 'dopo',
  'sempre', 'mai', 'mentre', 'senza', 'sotto', 'sopra', 'accanto', 'aggiornato', 'aggiornata', 'ricerca', 'filtro', 'filtri',
  'persona', 'ruoli', 'accesso', 'utente', 'utenti', 'sì', 'grazie', 'benvenuto', 'esempio', 'esempi', 'vedi', 'leggi',
];

const WORDS = new Set([...FUNCTION_WORDS, ...UI_WORDS]);
const ACCENTED = /[àèéìòùÀÈÉÌÒÙ]/;

/** The Italian words found in a text, in order of appearance and without repeats. */
export function italianWords(text) {
  const found = [];
  const lower = String(text ?? '').toLowerCase();
  for (const phrase of [...WORDS].filter((w) => w.includes(' '))) if (lower.includes(phrase)) found.push(phrase);
  for (const word of lower.match(/[a-zàèéìòù]+/g) || []) {
    if ((WORDS.has(word) || ACCENTED.test(word)) && !found.includes(word)) found.push(word);
  }
  return found;
}

// Words that both languages use, or that appear in English texts as names: never counted alone.
const SHARED = new Set(['idea', 'canvas', 'roadmap', 'chat', 'dashboard', 'team', 'advisor', 'admin', 'ok', 'email', 'link', 'pitch']);

/** True when a string reads as Italian: an accented letter, or at least one Italian word that English never uses. */
export function looksItalian(text) {
  const words = italianWords(text).filter((w) => !SHARED.has(w));
  return words.length > 0;
}

/** The string literals of a JavaScript source, without comments, with their line numbers. */
export function stringLiterals(source) {
  const out = [];
  let line = 1;
  let i = 0;
  const s = source;
  while (i < s.length) {
    const c = s[i];
    if (c === '\n') {
      line++;
      i++;
    } else if (c === '/' && s[i + 1] === '/') {
      while (i < s.length && s[i] !== '\n') i++;
    } else if (c === '/' && s[i + 1] === '*') {
      const end = s.indexOf('*/', i + 2);
      const stop = end < 0 ? s.length : end + 2;
      line += (s.slice(i, stop).match(/\n/g) || []).length;
      i = stop;
    } else if (c === "'" || c === '"' || c === '`') {
      const start = i;
      const startLine = line;
      i++;
      let depth = 0;
      while (i < s.length) {
        if (s[i] === '\\') i += 2;
        else if (c === '`' && s[i] === '$' && s[i + 1] === '{') {
          depth++;
          i += 2;
        } else if (c === '`' && depth > 0 && s[i] === '}') {
          depth--;
          i++;
        } else if (s[i] === c && depth === 0) break;
        else {
          if (s[i] === '\n') line++;
          i++;
        }
      }
      out.push({ line: startLine, text: s.slice(start + 1, i) });
      i++;
    } else i++;
  }
  return out;
}
