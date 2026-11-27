# Test di ai-deep-endenti

Questo documento descrive come sono scritti i test, cosa verificano e cosa resta fuori. Nessun test gira contro il progetto Supabase vero: il database è una copia locale, i servizi esterni sono finti.

Numeri al 28 novembre 2026:

| | Test | Copertura |
|---|---|---|
| Database, file pgTAP per argomento (PGlite) | 613 in 8 file | progetti e amministratori della piattaforma (chi crea, rinomina, archivia e riattiva, cosa legge l'amministratore della piattaforma, registro di sicurezza), membri e profili (aggiunte, ruoli, ultimo admin, un progetto per istruzione, chi vede chi, ultimo accesso calcolato sul progetto), isolamento dei dati (`project_id` scritto dal database, regole per progetto, id scelti dal database, collegamenti tra progetti rifiutati), immagini e presenza per progetto, aggiornamento da squadra unica senza perdere righe, email per persona e progetto nella lingua di chi riceve, regole tra progetti (progetti archiviati, uscite, conteggi di un solo progetto) |
| Database, file psql di prima (`tests/db/schema.test.sql`) | 81 controlli su PGlite, 87 su GitHub con due connessioni vere | dentro un progetto: permessi, 2FA, storico, conflitti, ruoli, registro di sicurezza, ultimo accesso che non torna indietro quando la sessione si chiude, note e immagini private, chat (Generale unica, autore fissato, risposte nella stessa chat, eliminazione, non letti), menzioni (create dal database, private, rimosse con il messaggio), fotografie della valutazione, regole dei tipi di scheda, spese con scontrini mai considerati orfani, impegni e ore lavorate modificabili solo da chi li ha creati, questionari e link pubblico con i loro limiti; con due connessioni anche le gare sull'ultimo admin e sui contatori dei questionari |
| Sito e Edge Functions (`node:test`, jsdom) | 3016 in 120 file, di cui 1338 con il sito in inglese | 98% delle righe e 88% dei rami del codice del sito e delle due funzioni, senza contare i moduli dei testi (coperti per intero) |
| Browser vero (Playwright con Chrome, anteprime con dati finti) | 250, cioè 125 su computer e 125 su telefono; 8 valgono solo per uno dei due e sull'altro si saltano | 51 pagine su computer e telefono senza errori né elementi fuori schermo, barra di salvataggio dei voti mai coperta, menu che si chiude toccando fuori, un solo pannello aperto alla volta, Profilo ed Esci visibili nel menu del telefono, schede che non riempiono la cronologia, ore degli impegni segnate col dito, col mouse e con la tastiera, righe delle ore lavorate leggibili sul telefono e orari scritti da tastiera, pagina pubblica dei questionari (schermate, salvataggi, ripresa, errori, aspetto, campo trappola, nessuna richiesta fuori dal server locale) |

In più `npm run test:db` controlla per primo che lo schema si installi e si riesegua senza errori.

## 1. Come sono scritti

### Metodo

I test si scrivono prima del codice: si scrive il test che fallisce, si verifica che fallisca per il motivo giusto, poi si scrive il codice che lo fa passare. Il contratto dei progetti ([PROGETTI.md](PROGETTI.md)) è verificato punto per punto dai file del database e del sito.

I test sono anche **white-box**: scritti leggendo il codice, nella stessa sessione in cui il codice veniva scritto, con l'assistenza di Claude. Un requisito frainteso può quindi finire sia nel codice sia nel test. Durante lo sviluppo i test del database hanno già trovato un difetto reale: il trigger controllava lo stato prima di riportare il tipo dell'elemento al valore originale, quindi un tentativo di cambiare tipo veniva rifiutato con un messaggio sbagliato invece di essere ignorato.

### Convenzioni

Sono quelle del nostro progetto Cubami. I file scritti prima dei progetti usano ancora `test(...)` con frasi spesso in inglese, per esempio `diffLines finds added and removed lines around unchanged ones`; i file nuovi e quelli riscritti seguono le regole qui sotto.

- **`describe` e `it` con frasi in italiano che descrivono il comportamento.** `describe` dice di cosa si parla (`chat del progetto aperto`), `it` cosa succede (`un messaggio di un altro progetto non compare nella chat aperta`). Chi legge l'elenco dei test legge le regole del sito.
- **Tabelle di casi.** Quando lo stesso comportamento vale per più valori, i casi stanno in una lista e ogni caso diventa un `it` con il valore nel nome, per esempio `con ${used} richieste su 3 nelle ultime 24 ore la risposta è ${status}`. Un caso che fallisce si riconosce dal nome.
- **Test ai confini.** Si prova il valore appena dentro e appena fuori il limite: una menzione di 9, 10 e 11 minuti fa (l'email parte dopo 10), un nome di progetto di 80 e di 81 caratteri, anche con le emoji, 2, 3 e 4 richieste a Claude con un limite di 3.
- Ogni test verifica un comportamento, con preparazione, azione e verifica.
- I servizi esterni sono finti: un client Supabase che registra le chiamate (`tests/fakes/supabase-js.mjs`) e dipendenze passate alle funzioni di Claude e delle email (chi chiama, `can_read`, `is_admin`, Brevo, il database). Nessun test chiama Supabase, Anthropic o Brevo davvero.
- I test dell'interfaccia girano in un DOM simulato (jsdom) e usano dati di prova comuni (`tests/setup/fixtures.mjs`), con progetti e persone di fantasia: la repo è pubblica, quindi nei test non compaiono idee, persone o dati reali.
- **Lingua dei test.** La preparazione (`tests/setup/register.mjs`) fissa la lingua del dispositivo all'italiano prima di caricare il sito, così i test danno lo stesso risultato su ogni computer. Un file in inglese (`*-en.test.mjs`) chiama `useLanguage('en')` in cima e poi carica i moduli del sito con `await import(...)`, perché la lingua si decide quando il sito si carica; ogni file gira in un processo suo, quindi la scelta resta in quel file. Quasi tutti i test in inglese controllano anche che nel risultato, o nella pagina disegnata, non resti nessuna parola italiana.
- **File pgTAP.** Uno per argomento in `supabase/tests/database/`, numerati nell'ordine in cui si leggono (`00_ambiente_di_prova`, `01_progetti_e_amministratori`, ..., `07_regole_tra_progetti`). Ognuno si apre con un commento che dice cosa prova e quali progetti e persone usa, dichiara con `select plan(N)` quanti controlli devono girare e finisce con `finish()` e `rollback`. Le descrizioni dei controlli sono frasi in inglese sul comportamento, per esempio `nobody reads the images of an archived project, not even its admin`. Le persone di prova sono lettere (`tests.uid('a')`), e `tests.login('a')`, `tests.anon()` e `tests.logout()` di `tests/db/helpers.sql` fanno agire come una persona con la 2FA, come chi non ha un account o come il SQL Editor. Un file che deve partire dallo schema a squadra unica lo dice in cima con `-- base: legacy` e applica lo schema di adesso con `\ir`.

### Livelli

| Livello | Come | Esempi |
|---|---|---|
| Database | PGlite (il vero Postgres compilato in WebAssembly) con pgTAP e un ambiente che imita Supabase (`tests/db/supabase-stub.sql`: ruoli, `auth.uid()`, `auth.jwt()`, Storage, Realtime). Ogni file parte da un database nuovo con lo schema installato due volte, per verificare che sia rieseguibile | isolamento tra progetti, amministratore della piattaforma che non legge i contenuti, ultimo admin, un progetto per istruzione, id scelti dal database, cartelle delle immagini e canale di presenza per progetto, progetti archiviati, aggiornamento da squadra unica, 2FA obbligatoria, advisor in sola lettura, conflitti di versione, storico immutabile, questionari |
| Contratto tra sito, funzioni e database | Lettura dei sorgenti e dello schema | ogni funzione che il sito o le Edge Functions chiamano esiste nello schema con quei parametri, e quelle delle Edge Functions si possono eseguire con la chiave che usano; nessuna chiamata alle vecchie funzioni senza progetto; ogni tabella usata esiste; ogni `raise exception` scrive un codice, sempre con lo stesso SQLSTATE, che ha il suo testo nelle due lingue; le righe finte delle funzioni hanno le colonne del database |
| Librerie | Funzioni pure | differenze tra versioni, unione a tre vie, "chi ha scritto cosa", validazione, classifica, Markdown delle risposte di Claude, lingua del dispositivo, date e numeri nella lingua di chi legge |
| Accesso ai dati e stato | Client Supabase finto | codici di errore messi in parole nella lingua di chi legge, letture filtrate sul progetto aperto e nessuna lettura senza progetto, backup del solo progetto aperto, paginazione, filtri, dati dal vivo malformati, bozze locali |
| Interfaccia | jsdom, interazioni simulate | ogni pagina, form, conflitti, ripristino di versioni, login e 2FA, scelta del progetto all'avvio (link dell'email, progetto ricordato, nessun progetto), selettore del progetto, pagina Progetti, Membri del progetto aperto, lingua dal Profilo, generatore, idee di esempio, nuove schede, roadmap, guida e concetti, appunti con immagini, menzioni, chat e campanella per progetto, risincronizzazione dei dati e pulsante Indietro |
| Testi e lingue | Moduli dei testi e sorgenti del sito | l'inglese ha le stesse voci dell'italiano, che fa da riferimento; nessun trattino lungo né spazio doppio; nessuna frase inglese rimasta uguale all'italiana; il rilevatore di italiano (`tests/setup/italian.mjs`) non trova testi italiani nel codice fuori dai moduli dei testi (una riga si esclude con `i18n-ignore`); nessun file resta segnato `// i18n: da tradurre`; lo stesso per i testi della pagina pubblica dei questionari |
| Sicurezza | Test sul DOM e controlli statici sul codice | testo malevolo in ogni campo e in ogni pagina, divieto di `innerHTML` ed `eval`, CSP, versioni fissate delle librerie, solo la chiave anon nel codice, RLS su ogni tabella |
| Funzione di Claude | Handler con dipendenze finte | CORS, autenticazione, limiti di dimensione, progetto della richiesta controllato con `can_read` prima di tutto (chi non può leggerlo non consuma richieste), compiti ammessi, limite giornaliero della persona in tutti i progetti, istruzioni ed errori nella lingua della richiesta, rifiuti e risposte troncate, log senza contenuti |
| Funzione delle email | Handler con dipendenze finte e Brevo finto; nel database Vault e `pg_net` finti | segreto condiviso, chiamate dal sito solo dalle origini ammesse e dall'admin di quel progetto (`is_admin`), un'email per persona e progetto, progetti archiviati o lasciati senza email, lingua del profilo, link che portano il progetto, anteprima senza invii, invio a mano segnato con il giorno, menzioni raggruppate e segnate una volta sola, sezioni del riepilogo ed email vuota non inviata, testo degli utenti sempre come testo nell'HTML, log solo con numeri |
| Browser vero | Playwright con il Chrome installato, un server locale e le anteprime con dati finti (`tests/e2e/preview.html` per il sito, `tests/e2e/q-preview.html` per la pagina pubblica dei questionari), senza login né Supabase, in italiano (`it-IT`), a 1280 per 800 e a 375 per 812 con il tocco | pagine senza errori né scorrimento orizzontale, menu e pannelli, impegni e ore lavorate con dito, mouse e tastiera, compilazione di un questionario dall'inizio al grazie |

## 2. Come si eseguono

```bash
npm test
```

Tutti i test del sito e delle Edge Functions.

```bash
npm run test:coverage
```

Gli stessi con la copertura. Per un file caricato da più file di test la tabella finale può mostrare la copertura di uno solo di loro: i numeri di questo documento uniscono i risultati di tutti i file di test, dal rapporto lcov di Node.

```bash
npm run test:db
```

I test del database su PGlite: non serve installare PostgreSQL né Docker, e girano uguali su Windows, macOS e GitHub. Prima controlla che lo schema si installi e si riesegua, poi esegue il file psql di prima e i file pgTAP, ognuno su un database nuovo. Il file di prima è scritto per psql: `tests/db/run.mjs` ne toglie i comandi di psql, trasforma ogni `\echo 'ok - ...'` in una riga di risultato, lo esegue un'istruzione alla volta come psql e, dei blocchi che chiedono due connessioni vere (`dblink`), che PGlite non sa aprire, tiene solo il ramo che li segna come saltati.

```bash
node tests/db/run.mjs 03_
```

Solo i file pgTAP il cui nome comincia così, senza il file di prima e senza il controllo dell'installazione: comodo mentre si scrive un argomento.

```bash
npm run test:db:pg
```

Il file psql di prima su un PostgreSQL vero, con `tests/db/run.sh`: serve bash e PostgreSQL 15 o successivo installato; crea un database temporaneo, installa lo schema due volte, esegue il file con psql, compresi i blocchi con due connessioni vere, e alla fine lo cancella. Sui computer senza PostgreSQL non gira: lo esegue GitHub.

```bash
npx playwright test
```

I test con il browser vero. Usano il Chrome già installato, senza scaricare browser, e avviano da soli il server locale (`tests/e2e/server.mjs`, porta 8091, che si cambia con `E2E_PORT`).

A ogni push su `main` e su ogni pull request GitHub Actions esegue, con Node 22, `npm test`, `npm run test:db`, `npm run test:db:pg` con il PostgreSQL del runner e `npx playwright test` con il Chrome del runner; sito e funzioni si pubblicano solo se passano tutti.

## 3. Cosa non è testato

| Mancanza | Rischio |
|---|---|
| Supabase vero | Le regole di accesso sono verificate su un Postgres che imita Supabase. Il comportamento reale di Auth (login, 2FA, recupero password, scadenza dei token), di Realtime (consegna degli aggiornamenti e delle cancellazioni, autorizzazione del canale di presenza) e di Storage non è provato dai test. |
| Browser vero | jsdom non applica la Content Security Policy, non disegna la pagina e non supporta davvero trascinamento e finestre modali native. I test con Chrome girano solo in italiano e sulle anteprime: le pagine in inglese, la pagina Progetti e il selettore del progetto sono provati solo in jsdom. |
| Flussi tra più persone | I conflitti di versione sono verificati, ma non due salvataggi realmente contemporanei sul database. Le poche gare provate con due connessioni vere (ultimo admin, contatori e limiti dei questionari) girano solo su GitHub o con PostgreSQL installato, non su PGlite. |
| Aggiornamento su dati veri | Il passaggio da squadra unica a progetti è provato partendo dallo schema di prima con dati di prova di ogni tipo, non su una copia del database vero. |
| Claude vero | Si verifica come la funzione usa la risposta, non la qualità delle risposte né che arrivino davvero nella lingua chiesta. |
| Email vere | Brevo è finto: non si prova come le email appaiono nei programmi di posta né se arrivano. |
| Qualità delle traduzioni | I test controllano che l'inglese abbia tutte le voci e che non resti italiano, non che l'inglese sia buono. Il rilevatore di italiano è un'euristica tarata sui testi del sito: una parola italiana che non conosce gli sfugge. |
| Deploy | Il workflow di GitHub Actions esegue tutti i test prima di pubblicare, ma la pubblicazione su Pages e il deploy delle funzioni non hanno test propri: si verificano guardando il risultato del workflow. |
| Qualità dei test | La copertura misura il codice eseguito, non gli errori che i test catturerebbero. Il mutation testing non è stato fatto. |
