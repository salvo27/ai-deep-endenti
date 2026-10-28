# ai-deep-endenti

Board condivise per generare, validare e confrontare idee di startup. È un sito statico pubblicato su GitHub Pages; i dati stanno su Supabase e gli aiuti di Claude passano da una Edge Function.

## Cosa c'è

| Sezione | A cosa serve |
|---|---|
| Dashboard | Classifica, idee per fase, esperimenti in corso, cose da fare (con le persone da sentire entro una settimana), novità dall'ultima visita |
| Idee | Colonne per fase (trascinabili) o tabella; ogni idea ha Panoramica (con il riquadro «Prossimo passo» e le decisioni collegate), Lean Canvas, Clienti, Mercato, Deep tech, Esperimenti, Persone e interviste, Voti, Commenti, Storico |
| Esempi | Un'idea compilata per ogni fase, ispirata alla storia di startup note (Uber, Airbnb, Dropbox, Spotify, Netflix, Odeo); in sola lettura, nascondibili, fuori da statistiche e backup |
| Lean Canvas | I nove blocchi classici, ciascuno con il segno "validato con dati" |
| Clienti | Buyer persona a scheda (una per tipo di cliente) con foto, dati demografici, obiezioni e fonti di informazione; Value Proposition Canvas a due lati |
| Mercato | TAM, SAM e SOM in euro con fonti e controlli di coerenza; analisi dei concorrenti con tabella di confronto e grafico a due assi |
| Deep tech | Scala TRL, rischi tecnici e di mercato, design partner, proprietà intellettuale, rapporto con l'ateneo, norme e bandi |
| Esperimenti | Javelin board: assunzione più rischiosa, metodo, criterio di successo deciso prima, risultato, decisione; vista a colonne come il template |
| Persone | Con chi interfacciarsi per ogni idea (clienti da intervistare, esperti, chi serve per realizzarla, ateneo, investitori), con stato, responsabile e prossimo contatto; un clic crea l'intervista |
| Contatti | Le persone da sentire di tutte le idee in un'unica lista: stato, chi se ne occupa e prossimo contatto si cambiano direttamente in tabella; filtri per le mie, quelle senza responsabile e quelle da sentire questa settimana; prima chi è in ritardo. «Registra il colloquio» crea l'intervista e la collega alla persona |
| Interviste | Appunti strutturati, citazioni, intensità del problema, impegno preso. Il tipo distingue i colloqui con una persona dalle ricerche online: solo i colloqui contano nei numeri della dashboard e nella roadmap |
| Chat | Chat di gruppo dal vivo: una «Generale» per tutta la squadra e chat per argomento, collegabili a un'idea (dalla pagina dell'idea: «Chat dell'idea»). Testo formattato, immagini e link cliccabili, risposta a un messaggio specifico con citazione, modifica ed eliminazione dei propri messaggi, non letti ricordati per persona e contatore nel menu. Le chat si archiviano, non si cancellano |
| Menzioni | Con @ in chat, commenti e note si tagga un membro o @tutti, scegliendo da un elenco. Le menzioni sono notifiche importanti, separate dalla campanella: pulsante «@» con il suo contatore, elenco con chi, dove ed estratto, link al punto esatto |
| Appunti | In ogni idea, note con data in cui la prima riga è il titolo: riunioni, link, domande aperte. Pulsanti per dimensione del testo, grassetto, corsivo, elenchi e tabelle, oppure Markdown scritto a mano. Le immagini si caricano dall'editor in uno spazio privato su Supabase; ogni nota si scarica come file .md con le immagini incorporate oppure come PDF dal dialogo di stampa del browser (Salva come PDF), e un file .md si può importare |
| Valutazione | Criteri pesati modificabili, con descrizioni che dicono cosa vuol dire 5 e cosa vuol dire 1 (quelle incomplete sono segnalate); ognuno vota per conto suo, con i voti mancanti evidenziati e, sul telefono, una scheda per idea con le descrizioni sempre visibili; la matrice mostra media, disaccordi e chi non ha ancora votato, e con un tocco i voti di ciascuno; sotto ogni idea le prove raccolte (conversazioni vere, impegni concreti, esperimenti conclusi); le fotografie salvano criteri e voti di un momento e si confrontano tra loro o con adesso, e prima di cambiare pesi o criteri se ne salva una da sola |
| Generatore | Griglia capacità del team × settori, con chi ha ogni competenza e chi conosce ogni settore; ogni cella è uno spunto da cui nasce un'idea |
| Decisioni | Registro di cosa si è deciso, con alternative e motivazioni |
| Squadra | Team Canvas e divisione delle quote con il metodo Demmler |
| Roadmap, Guida e Concetti | Ogni idea ha una roadmap interattiva di 8 fasi e 45 passi in ordine, dalla squadra alla società: per ogni passo cosa fare, come, quando è fatto ed errore da evitare; si spuntano a mano, con autore e data, e si possono togliere; quando i dati della board fanno pensare che un passo sia fatto, la roadmap lo suggerisce. La Guida mostra la roadmap completa e a che punto è ogni idea; i Concetti spiegano circa novanta voci del manuale, collegate ai campi con il pulsante «?» |
| Storico | Ogni salvataggio è una versione con autore, messaggio e differenze; confronto tra versioni, "chi ha scritto cosa", ripristino |
| Cestino | Niente si cancella davvero |
| Team e Profilo | Ruoli, stato della 2FA, registro di sicurezza, dispositivi, password, avvisi del browser, backup |
| Notifiche | Campanella con le novità degli altri (nuove idee, cambi di fase, decisioni, esperimenti conclusi, nuove schede, persone, commenti), avviso a comparsa in tempo reale e, se attivati, avvisi del browser |

Claude può criticare una board, proporre il prossimo esperimento, preparare domande per le interviste, sintetizzarle e suggerire idee per una cella del generatore. Le risposte sono formattate (titoli, elenchi, tabelle) senza mai interpretare HTML.

Ruoli: **admin** gestisce il team, **membro** crea e modifica, **advisor** legge, commenta e vota.

## Struttura

```
index.html                  pagina unica con Content Security Policy
assets/css/app.css          stile (tema chiaro e scuro)
assets/js/
  config.js                 URL del progetto e chiave anon (pubbliche per costruzione)
  main.js, app.js           avvio, controllo di accesso, rotte
  auth.js                   login, 2FA, recupero password
  schema.js                 definizione di ogni board: campi, stati, validazione
  store.js                  stato condiviso, aggiornamenti dal vivo, salvataggi
  router.js                 rotte con hash (#/idee, #/idea/:id, ...)
  examples.js               idee di esempio in sola lettura, una per fase
  roadmap.js, concepts.js   fasi e passi della roadmap, concetti del manuale
  scoring.js, ai.js, export.js
  lib/                      accesso ai dati, DOM sicuro, differenze tra versioni, validazione
  views/                    una pagina per file
supabase/
  schema.sql                tabelle, regole di accesso, storico, registro di sicurezza
  functions/claude/         Edge Function che chiama Claude
tests/                      test del database, delle librerie, dell'interfaccia e della funzione
docs/SICUREZZA.md           principi e misure di sicurezza
docs/TEST.md                come sono scritti i test e cosa coprono
```

Per aggiungere una board basta una nuova definizione in `schema.js`, il tipo nel vincolo `kind` di `schema.sql` e una voce nel menu.

Quando si aggiunge o si toglie un file JavaScript, `npm run preload` aggiorna in `index.html` l'elenco dei moduli da precaricare (un test controlla che sia allineato): così il browser li scarica tutti insieme invece che a cascata.

## Messa in funzione

Il progetto Supabase `ai-deep-endenti` (ref `ixhnqeabctkpflwkdarj`) è già configurato: schema applicato, autenticazione impostata, funzione di Claude pubblicata. I comandi qui sotto servono per rifarlo o per applicare modifiche future, dalla cartella della repo e con la [Supabase CLI](https://supabase.com/docs/guides/cli) collegata al tuo account (`supabase login`).

```bash
supabase link --project-ref ixhnqeabctkpflwkdarj
```

### 1. Database

```bash
supabase db query --linked -f supabase/schema.sql
```

Lo schema si può rieseguire senza perdere dati. Se una tabella pubblica non ha la Row Level Security, lo script si ferma con un errore. Dopo ogni modifica conviene lanciare i controlli di Supabase:

```bash
supabase db advisors --linked
```

Restano tre avvisi voluti: `add_member`, `members_overview` e `my_role` sono chiamabili da chi ha fatto login, e ognuna controlla i permessi al suo interno.

### 2. Autenticazione

La configurazione sta in `supabase/config.toml`: registrazioni pubbliche disattivate, password di almeno 12 caratteri con minuscole, maiuscole e numeri, verifica in due passaggi con app di autenticazione, indirizzi del sito. Si applica con:

```bash
supabase config push --project-ref ixhnqeabctkpflwkdarj
```

Attenzione: il comando applica subito le modifiche senza chiedere conferma, e per i valori che non sono nel file usa i predefiniti della CLI. Prima di aggiungere impostazioni, controlla che il file contenga tutto ciò che vuoi mantenere.

Il servizio email predefinito di Supabase ha limiti molto bassi: per il recupero password configura un SMTP, oppure reimposta le password dalla dashboard.

### 3. Account

1. **Authentication › Users › Add user › Create new user**: email, password temporanea, "Auto Confirm User".
2. Il primo admin si aggiunge dal SQL Editor:

   ```sql
   select public.add_member('email-dell-admin', 'Nome Cognome', 'admin');
   ```

3. Gli altri li aggiunge l'admin dal sito (Team), dopo averli creati come al punto 1.
4. Al primo accesso ognuno attiva la verifica in due passaggi: senza, il database non restituisce nulla, e cambia la password temporanea dal Profilo.

### 4. Claude

La funzione legge il segreto `ANTHROPIC_API_KEY`: si modifica in **Edge Functions › Secrets** nella dashboard. `ALLOWED_ORIGINS` contiene le origini da cui il sito può chiamarla (`https://salvo27.github.io,http://localhost:8080`).

Per ripubblicare la funzione dopo una modifica:

```bash
supabase functions deploy claude --project-ref ixhnqeabctkpflwkdarj --use-api
```

Variabili facoltative: `AI_DAILY_LIMIT` (richieste per persona nelle ultime 24 ore, predefinito 40), `CLAUDE_MODEL` (predefinito `claude-opus-5-5`), `CLAUDE_EFFORT` (predefinito `medium`). Le risposte rifiutate dai filtri di sicurezza di Claude vengono ripetute automaticamente su un modello alternativo (`fallbacks: "default"`).

### 5. Pubblicazione automatica

Il workflow `.github/workflows/deploy.yml` parte a ogni push su `main`:

1. esegue i test del sito, della funzione e del database;
2. solo se passano, pubblica su GitHub Pages `index.html` e `assets/` (niente test, documenti o schema);
3. se sono cambiati i file in `supabase/functions/`, ripubblica la funzione di Claude.

Sulle pull request esegue solo i test. Se un test fallisce, il sito resta alla versione precedente.

Da fare una volta sola:

- **Settings › Pages › Build and deployment › Source: GitHub Actions.** Il sito sarà su `https://salvo27.github.io/ai-deep-endenti/`.
- **Facoltativo, per pubblicare la funzione da GitHub:** crea un token su [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) e aggiungilo in **Settings › Secrets and variables › Actions** come `SUPABASE_ACCESS_TOKEN`. Il token dà accesso a tutti i progetti del tuo account Supabase, non solo a questo: se preferisci non metterlo su GitHub, il passaggio viene saltato e la funzione si pubblica a mano con il comando del punto 4.

Lo schema del database non si applica mai da solo. Per applicarlo da GitHub: **Actions › Test e pubblicazione › Run workflow**, con "Applica supabase/schema.sql" spuntato (serve lo stesso segreto). Dopo l'applicazione il workflow lancia i controlli di sicurezza di Supabase.

### 6. Primo avvio

Le idee discusse finora (con criteri, generatore, Lean Canvas, esperimenti e la prima decisione) sono già state importate direttamente nel database. Non stanno nel codice, perché la repo è pubblica: in generale, nessun contenuto delle board va scritto nei file della repo.

## Sviluppo in locale

```bash
npm install
```

```bash
npm test
```

```bash
npm run test:db
```

```bash
npm run serve
```

Il sito locale è su `http://localhost:8080`. `npm run test:db` richiede PostgreSQL 15 o successivo installato (per esempio `brew install postgresql@16`).

## Operazioni frequenti

**Qualcuno ha perso il telefono.** Se ha un secondo dispositivo, entra con quello e rimuove il vecchio dal Profilo. Altrimenti l'admin, dal SQL Editor:

```sql
delete from auth.mfa_factors where user_id = (select id from auth.users where email = 'email-della-persona');
```

Al login successivo gli verrà chiesto di attivare un nuovo dispositivo. Conviene anche chiudere le sue sessioni da Authentication › Users.

**Rimuovere qualcuno.** Dal sito (Team) perde subito l'accesso ai dati. Per bloccare anche l'account, disattivalo o eliminalo in Authentication › Users.

**Backup.** Team › Esporta un backup completo scarica idee, storico e commenti in JSON. I file di backup sono esclusi da git.

**Svuotare il cestino per sempre.** Il sito non cancella mai davvero. Se serve, l'admin fa prima un backup e poi, dal SQL Editor, elimina gli elementi nel cestino insieme a quelli delle idee archiviate; storico e commenti collegati spariscono con loro:

```sql
begin;
delete from public.items where idea_id in (select id from public.items where deleted_at is not null);
delete from public.items where deleted_at is not null;
commit;
```

**Ruoli e accessi.** Ogni ingresso, uscita e cambio di ruolo finisce nel registro di sicurezza, visibile agli admin nella pagina Team.

## Documenti

- [Sicurezza](docs/SICUREZZA.md)
- [Test](docs/TEST.md)
