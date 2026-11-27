// Testi in italiano: è la lingua di riferimento, l'inglese ne segue la forma.
// Accesso, verifica in due passaggi, password e schermate di chi non può entrare.
export const auth = {
  email: 'Email',
  password: 'Password',
  showPassword: 'Mostra password',
  hidePassword: 'Nascondi password',
  codeLabel: 'Codice a sei cifre',
  sixDigits: 'Il codice ha sei cifre.',
  signOut: 'Esci',
  login: {
    title: 'Accedi',
    subtitle: 'Gli account li crea l\'amministratore del team.',
    submit: 'Accedi',
    forgot: 'Password dimenticata?',
    missing: 'Inserisci email e password.',
  },
  reset: {
    title: 'Recupera la password',
    submit: 'Invia il link',
    back: 'Torna all\'accesso',
    invalidEmail: 'Inserisci un indirizzo email valido.',
    sent: 'Se l\'indirizzo appartiene a un account riceverai un\'email con il link. Dopo il link servirà comunque il codice dell\'app di autenticazione.',
  },
  verify: {
    title: 'Verifica in due passaggi',
    subtitle: 'Apri l\'app di autenticazione e inserisci il codice.',
    device: 'Dispositivo',
    code: 'Codice dell\'app di autenticazione',
    submit: 'Verifica',
  },
  enroll: {
    title: 'Attiva la verifica in due passaggi',
    subtitle: 'È obbligatoria per tutti: protegge le idee del team anche se qualcuno scopre la tua password.',
    steps: [
      'Installa un\'app di autenticazione: Google Authenticator, Microsoft Authenticator, 1Password o simili.',
      'Scansiona il codice QR, oppure inserisci a mano la chiave qui sotto.',
      'Scrivi il codice a sei cifre che compare nell\'app.',
    ],
    qrAlt: 'Codice QR da scansionare con l\'app di autenticazione',
    code: 'Codice',
    submit: 'Attiva',
    cancel: 'Annulla',
    done: 'Verifica in due passaggi attivata.',
  },
  newPassword: {
    title: 'Scegli una nuova password',
    password: 'Nuova password',
    confirm: 'Ripeti la password',
    hint: 'Almeno 12 caratteri, con minuscole, maiuscole e un numero.',
    submit: 'Salva la nuova password',
    done: 'Password aggiornata.',
  },
  // Le regole della password (lib/validate.js).
  passwordRules: {
    tooShort: 'La password deve avere almeno 12 caratteri.',
    tooLong: 'La password può avere al massimo 128 caratteri.',
    mix: 'Usa lettere minuscole, maiuscole e almeno un numero.',
    mismatch: 'Le due password non coincidono.',
  },
  // Chi è entrato ma non può aprire nessun progetto: perché non ne ha, o perché è stato tolto da quello aperto.
  notMember: {
    noneTitle: 'Non fai parte di nessun progetto',
    noneText: 'Il tuo account esiste, ma nessuno ti ha ancora aggiunto a un progetto. Chiedi a un amministratore di aggiungerti.',
    removedTitle: 'Non fai più parte di questo progetto',
    removedText: 'Un admin ti ha tolto dal progetto, oppure il progetto è stato archiviato. Ricarica la pagina per aprire un altro dei tuoi progetti.',
    reload: 'Ricarica',
  },
  error: {
    title: 'Qualcosa non ha funzionato',
    fallback: 'Riprova tra poco.',
    retry: 'Riprova',
  },
  idleSignedOut: 'Sei stato disconnesso per inattività.',
};
