# ai-deep-endenti

Board condivise per generare, validare e confrontare idee di startup. È un sito statico pubblicato su GitHub Pages; i dati stanno su Supabase e gli aiuti di Claude passano da una Edge Function.

## Cosa c'è

| Sezione | A cosa serve |
|---|---|
| Dashboard | Classifica, idee per fase, esperimenti in corso, cose da fare (con le persone da sentire entro una settimana), novità dall'ultima visita |
| Idee | Colonne per fase (trascinabili) o tabella; ogni idea ha sei schede: Panoramica (con il riquadro «Prossimo passo» e le decisioni collegate), Roadmap, Analisi (Lean Canvas, Clienti, Mercato, Deep tech), Validazione (Esperimenti, Persone e interviste, Questionari), Appunti e Discussione (Commenti, Voti, Storico). Le schede con più sezioni mostrano sotto una seconda riga; ogni sezione ha il suo indirizzo, per esempio `#/idea/<id>/commenti`, e sul telefono le sei schede stanno su due righe |
| Esempi | Un'idea compilata per ogni fase, ispirata alla storia di startup note (Uber, Airbnb, Dropbox, Spotify, Netflix, Odeo); in sola lettura, nascondibili, fuori da statistiche e backup |
| Lean Canvas | I nove blocchi classici, ciascuno con il segno "validato con dati" |
| Clienti | Buyer persona a scheda (una per tipo di cliente) con foto, dati demografici, obiezioni e fonti di informazione; Value Proposition Canvas a due lati |
| Mercato | TAM, SAM e SOM in euro con fonti e controlli di coerenza; analisi dei concorrenti con tabella di confronto e grafico a due assi |
| Deep tech | Scala TRL, rischi tecnici e di mercato, design partner, proprietà intellettuale, rapporto con l'ateneo, norme e bandi |
| Esperimenti | Javelin board: assunzione più rischiosa, metodo, criterio di successo deciso prima, risultato, decisione; vista a colonne come il template |
| Persone | Con chi interfacciarsi per ogni idea (clienti da intervistare, esperti, chi serve per realizzarla, ateneo, investitori), con stato, responsabile e prossimo contatto; un clic crea l'intervista |
| Contatti | Le persone da sentire di tutte le idee in un'unica lista: stato, chi se ne occupa e prossimo contatto si cambiano direttamente in tabella; filtri per le mie, quelle senza responsabile e quelle da sentire questa settimana; prima chi è in ritardo. «Registra il colloquio» crea l'intervista e la collega alla persona |
| Interviste | Appunti strutturati, citazioni, intensità del problema, impegno preso. Il tipo distingue i colloqui con una persona dalle ricerche online: solo i colloqui contano nei numeri della dashboard e nella roadmap |
| Questionari | Per ogni idea, questionari da compilare senza account con un link pubblico revocabile: domande a scelta (con «Altro» e «Preferisco non rispondere»), scala, numero, testo ed email, divise in sezioni, con tema e colore della pagina; le risposte si salvano a ogni schermata. Si creano dalla scheda Validazione dell'idea partendo da un modello che segue il manuale (introduzione, informativa sulla privacy da completare, domande di esempio al passato, email facoltativa) e si trovano tutti nella pagina Questionari. Ognuno ha quattro schede: **Domande** (aggiungere, modificare, duplicare, spostare ed eliminare, scala con un'etichetta per ogni punto, durata stimata dal vivo e avvisi mentre si scrive: condizionale, «d'accordo / in disaccordo», domande che suggeriscono la risposta, premi, soluzione, criteri di selezione svelati, troppe domande, parentesi quadre rimaste, con la forma migliore accanto), **Aspetto e impostazioni** (impaginazione, avanzamento e durata con la scelta consigliata e il perché, tema, colore con contrasto controllato e anteprima, immagine facoltativa della schermata iniziale con la sua descrizione), **Condividi** (bozza, aperto, chiuso, link da copiare e da cambiare) e **Risposte** (imbuto, risposte per domanda con n accanto a ogni percentuale, mancate risposte e abbandoni per domanda, tempi per dispositivo, segnalazioni di qualità con «Escludi le risposte segnalate», CSV con o senza email, cancellazione, chi vuole essere ricontattato aggiunto ai Contatti con un clic) |
| Pagina del questionario | Quella che apre chi risponde, `q.html#<codice>` (o la copia con l'anteprima del colore scelto, per esempio `q-verde.html#<codice>`), senza account: copertina con l'immagine scelta (o una fascia leggera nel colore del questionario), saluto, introduzione con il tempo stimato e la privacy riassunta (il resto si apre sul posto), una domanda per schermata o una sezione per schermata, barra e «Domanda X di Y», righe intere da toccare anche sul telefono con «Indietro» e «Avanti» in basso, dove arriva il pollice, lettere e Invio per rispondere dal computer, temi chiaro, scuro, seppia e contrasto elevato con il colore adattato a ognuno perché resti leggibile, solo le obbligatorie bloccano «Avanti», e prima dell'invio un promemoria gentile ricorda le facoltative saltate; chi chiude a metà ritrova le sue risposte per 30 giorni con un saluto («Rieccoci!») e le domande che mancano, e chi ha già inviato da quel dispositivo vede «Hai già risposto»; le risposte si salvano a ogni «Avanti», un ricaricamento riprende dallo stesso punto e alla fine c'è il grazie |
| Chat | Chat di gruppo dal vivo: una «Generale» per tutta la squadra e chat per argomento, collegabili a un'idea (dalla pagina dell'idea: «Chat dell'idea»). Testo formattato, immagini e link cliccabili, risposta a un messaggio specifico con citazione, modifica ed eliminazione dei propri messaggi, non letti ricordati per persona e contatore nel menu. Le chat si archiviano, non si cancellano |
| Menzioni | Con @ in chat, commenti e note si tagga un membro o @tutti, scegliendo da un elenco. Le menzioni sono notifiche importanti, separate dalla campanella: pulsante «@» con il suo contatore, elenco con chi, dove ed estratto, link al punto esatto |
| Appunti | In ogni idea, note con data in cui la prima riga è il titolo: riunioni, link, domande aperte. Pulsanti per dimensione del testo, grassetto, corsivo, elenchi e tabelle, oppure Markdown scritto a mano. Le immagini si caricano dall'editor in uno spazio privato su Supabase; ogni nota si scarica come file .md con le immagini incorporate oppure come PDF dal dialogo di stampa del browser (Salva come PDF), e un file .md si può importare |
| Valutazione | Criteri pesati modificabili, con descrizioni che dicono cosa vuol dire 5 e cosa vuol dire 1 (quelle incomplete sono segnalate); ognuno vota per conto suo, con i voti mancanti evidenziati e, sul telefono, una scheda per idea con le descrizioni sempre visibili; la matrice mostra media, disaccordi e chi non ha ancora votato, e con un tocco i voti di ciascuno; sotto ogni idea le prove raccolte (conversazioni vere, impegni concreti, esperimenti conclusi); le fotografie salvano criteri e voti di un momento e si confrontano tra loro o con adesso, e prima di cambiare pesi o criteri se ne salva una da sola |
| Generatore | Griglia capacità del team × settori, con chi ha ogni competenza e chi conosce ogni settore; ogni cella è uno spunto da cui nasce un'idea |
| Decisioni | Registro di cosa si è deciso, con alternative e motivazioni |
| Squadra | Team Canvas e divisione delle quote con il metodo Demmler |
| Roadmap e Guida | Ogni idea ha una roadmap interattiva di 8 fasi e 45 passi in ordine, dalla squadra alla società: per ogni passo cosa fare, come, quando è fatto ed errore da evitare; si spuntano a mano, con autore e data, e si possono togliere; quando i dati della board fanno pensare che un passo sia fatto, la roadmap lo suggerisce. La Guida ha due schede: Roadmap, con la roadmap completa e a che punto è ogni idea, e Concetti (`#/guida/concetti`), che spiega circa novanta voci del manuale, collegate ai campi con il pulsante «?». Il vecchio indirizzo `#/concetti` porta ancora lì |
| Storico | Ogni salvataggio è una versione con autore, messaggio e differenze; confronto tra versioni, "chi ha scritto cosa", ripristino |
| Cestino | Niente si cancella davvero |
| Membri e Profilo | Membri (`#/membri`, prima Team, il vecchio indirizzo funziona ancora): ruoli, stato della 2FA, registro di sicurezza, backup. Profilo: dispositivi, password, avvisi del browser |
| Notifiche | Campanella con le novità degli altri (nuove idee, cambi di fase, decisioni, esperimenti conclusi, nuove schede, persone, commenti), avviso a comparsa in tempo reale e, se attivati, avvisi del browser. Per email: menzioni non lette dopo una decina di minuti e un riepilogo il lunedì mattina, spegnibili dal Profilo |

Il menu laterale raggruppa le pagine in **Lavoro** (Dashboard, Idee, Valutazione, Esperimenti, Interviste, Questionari, Contatti, Decisioni, Chat), **Strumenti** (Generatore, Guida), **Team** (Squadra, Membri) e **Sistema** (Storico, Cestino); in fondo ci sono Profilo ed Esci, che chiede conferma perché per rientrare servono password e codice di verifica. Sul telefono la ricerca è un pulsante con la lente che apre una riga larga quanto lo schermo; da tastiera si apre con «/».

Claude può criticare una board, proporre il prossimo esperimento, preparare domande per le interviste, sintetizzarle e suggerire idee per una cella del generatore. Le risposte sono formattate (titoli, elenchi, tabelle) senza mai interpretare HTML.

Ruoli: **admin** gestisce il team, **membro** crea e modifica, **advisor** legge, commenta e vota.

## Struttura

```
index.html                  pagina unica con Content Security Policy
q.html                      pagina pubblica dei questionari, senza login (assets/js/public/, assets/css/survey.css)
assets/css/app.css          stile (tema chiaro e scuro)
assets/js/
  config.js                 URL del progetto e chiave anon (pubbliche per costruzione)
  main.js, app.js           avvio, controllo di accesso, rotte
  auth.js                   login, 2FA, recupero password
  schema.js                 definizione di ogni board: campi, stati, validazione
  store.js                  stato condiviso, aggiornamenti dal vivo, salvataggi
  router.js                 rotte con hash (#/idee, #/idea/:id, ...) e vecchi indirizzi rimandati ai nuovi
  examples.js               idee di esempio in sola lettura, una per fase
  roadmap.js, concepts.js   fasi e passi della roadmap, concetti del manuale
  scoring.js, ai.js, export.js
  survey-*.js               modello, controlli mentre si scrive e statistiche dei questionari
  lib/                      accesso ai dati, DOM sicuro, differenze tra versioni, validazione
  views/                    una pagina per file
supabase/
  schema.sql                tabelle, regole di accesso, storico, registro di sicurezza
  functions/claude/         Edge Function che chiama Claude
  functions/notify/         Edge Function delle email (menzioni e riepilogo del lunedì, inviate con Brevo)
tests/                      test del database, delle librerie, dell'interfaccia e della funzione
docs/SICUREZZA.md           principi e misure di sicurezza
docs/TEST.md                come sono scritti i test e cosa coprono
```

Per aggiungere una board basta una nuova definizione in `schema.js`, il tipo nel vincolo `kind` di `schema.sql` e una voce nel menu (`NAV_GROUPS` in `views/shell.js`).

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

3. Gli altri li aggiunge l'admin dal sito (Membri), dopo averli creati come al punto 1.
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
2. solo se passano, pubblica su GitHub Pages `index.html`, `q.html` e `assets/` (niente test, documenti o schema), più una copia `q-<colore>.html` per ogni colore della tavolozza, con l'anteprima del link in quel colore (`scripts/anteprime.mjs`; le immagini si rifanno con `npm run anteprime`);
3. se sono cambiati i file in `supabase/functions/claude/` o in `supabase/functions/notify/`, ripubblica la funzione cambiata.

Sulle pull request esegue solo i test. Se un test fallisce, il sito resta alla versione precedente.

Da fare una volta sola:

- **Settings › Pages › Build and deployment › Source: GitHub Actions.** Il sito sarà su `https://salvo27.github.io/ai-deep-endenti/`.
- **Facoltativo, per pubblicare la funzione da GitHub:** crea un token su [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) e aggiungilo in **Settings › Secrets and variables › Actions** come `SUPABASE_ACCESS_TOKEN`. Il token dà accesso a tutti i progetti del tuo account Supabase, non solo a questo: se preferisci non metterlo su GitHub, il passaggio viene saltato e la funzione si pubblica a mano con il comando del punto 4.

Lo schema del database non si applica mai da solo. Per applicarlo da GitHub: **Actions › Test e pubblicazione › Run workflow**, con "Applica supabase/schema.sql" spuntato (serve lo stesso segreto). Dopo l'applicazione il workflow lancia i controlli di sicurezza di Supabase.

### 6. Primo avvio

Le idee discusse finora (con criteri, generatore, Lean Canvas, esperimenti e la prima decisione) sono già state importate direttamente nel database. Non stanno nel codice, perché la repo è pubblica: in generale, nessun contenuto delle board va scritto nei file della repo.

## Notifiche via email

La funzione `notify` manda due tipi di email con [Brevo](https://www.brevo.com), solo ai membri del team con la verifica in due passaggi attiva:

- **Menzioni.** Se qualcuno ti tagga e non apri la menzione entro una decina di minuti, arriva un'email con tutte le menzioni nuove non lette: chi ti ha taggato, dove, un estratto e il link al punto esatto. Una menzione non parte mai due volte e non parte se l'hai già letta. Quelle che esistevano quando è stato installato lo schema non partono mai, e nemmeno quelle più vecchie di un giorno (le ricorda il riepilogo).
- **Riepilogo del lunedì.** Un'email a testa con tre parti, ognuna solo se c'è qualcosa da dire: «Da fare questa settimana» (contatti da sentire in ritardo o entro domenica, esperimenti ancora da avviare o scaduti, idee senza prossimo passo, sempre quelli di cui sei responsabile), «Nel team negli ultimi 7 giorni» (nuove idee, idee con più modifiche, interviste fatte senza contare la ricerca a tavolino e quante con un impegno concreto, esperimenti conclusi, decisioni prese) e «Da leggere» (menzioni e messaggi in chat non letti). Se non c'è niente, l'email non parte. Dei contatti esterni compare solo il ruolo, mai il nome. L'admin, nella pagina Membri, vede l'anteprima della sua versione con quante persone la riceverebbero e può mandarla subito a tutti: l'invio a mano si segna con il giorno, quindi un secondo clic nello stesso giorno non manda nulla e il lunedì dopo parte comunque quello automatico.

Ognuno può spegnere ciascuna delle due dal Profilo, nella scheda Email; all'inizio sono accese tutte e due.

Come funziona: due job di `pg_cron` nel database chiamano la funzione con `pg_net`. Le menzioni ogni 10 minuti; il riepilogo il lunedì alle 6:00 UTC, cioè le 7:00 in Italia con l'ora solare e le 8:00 con l'ora legale (`pg_cron` ragiona in UTC: così è sempre lunedì mattina, senza cambiare nulla due volte l'anno). Ogni chiamata porta un segreto condiviso letto dal Vault di Supabase: finché il segreto non c'è, i job non fanno nulla. Se mancano le impostazioni di Brevo, la funzione non manda nulla e risponde quali mancano.

### Messa in funzione delle email

1. **Brevo.** Crea l'account su [brevo.com](https://www.brevo.com). In **Senders, Domains & Dedicated IPs › Senders** aggiungi l'indirizzo da cui partono le email e verificalo con il codice che arriva a quell'indirizzo. Meglio un indirizzo di un dominio tuo, autenticato in **Domains** (DKIM e DMARC): con un indirizzo Gmail o simili le email rischiano di finire nello spam. Poi in **SMTP & API › API Keys** crea una chiave.
2. **Segreto condiviso.** Generane uno lungo e casuale (almeno 32 caratteri), per esempio con:

   ```bash
   openssl rand -hex 32
   ```

3. **Segreti della funzione.** Crea il file `supabase/.env` (è escluso dalla repo) con queste righe, mettendo i tuoi valori al posto dei segnaposto:

   ```
   NOTIFY_SECRET=segreto-generato-al-punto-2
   BREVO_API_KEY=chiave-creata-su-brevo
   BREVO_SENDER_EMAIL=indirizzo-verificato-su-brevo
   BREVO_SENDER_NAME=ai-deep-endenti
   SITE_URL=https://salvo27.github.io/ai-deep-endenti/
   ```

   Poi caricalo e cancella il file:

   ```bash
   supabase secrets set --env-file supabase/.env --project-ref ixhnqeabctkpflwkdarj
   ```

   ```bash
   rm supabase/.env
   ```

   `BREVO_SENDER_NAME` è facoltativo (predefinito `ai-deep-endenti`).
4. **Schema.** Applica `supabase/schema.sql` (punto 1 di «Messa in funzione», oppure da GitHub Actions). Lo schema attiva `pg_cron` e `pg_net`, crea le tabelle e i due job (`notify-mentions` e `notify-weekly`). Alla prima applicazione segna come già gestite tutte le menzioni esistenti; rieseguirlo non tocca quelle nuove.
5. **Vault.** Nel SQL Editor salva l'indirizzo della funzione e lo stesso segreto del punto 2, al posto del segnaposto. Il segreto non va scritto in nessun file della repo:

   ```sql
   select vault.create_secret('https://ixhnqeabctkpflwkdarj.supabase.co/functions/v1/notify', 'notify_url', 'Indirizzo della funzione notify');
   select vault.create_secret('INCOLLA-QUI-IL-SEGRETO-DEL-PUNTO-2', 'notify_secret', 'Segreto condiviso con la funzione notify');
   ```

   Per cambiare il segreto in futuro (insieme a `NOTIFY_SECRET` del punto 3):

   ```sql
   select vault.update_secret((select id from vault.secrets where name = 'notify_secret'), 'INCOLLA-QUI-IL-NUOVO-SEGRETO');
   ```

6. **Pubblicazione.** La funzione si pubblica da sola con il workflow (se c'è il segreto `SUPABASE_ACCESS_TOKEN`), oppure a mano. Va pubblicata senza verifica del token, perché la chiama `pg_cron` con il segreto condiviso:

   ```bash
   supabase functions deploy notify --project-ref ixhnqeabctkpflwkdarj --use-api --no-verify-jwt
   ```

### Provare

Una chiamata a mano dal terminale, con il segreto del punto 2 al posto del segnaposto:

```bash
curl -s -X POST https://ixhnqeabctkpflwkdarj.supabase.co/functions/v1/notify -H 'content-type: application/json' -H 'x-notify-secret: INCOLLA-QUI-IL-SEGRETO' -d '{"job":"weekly"}'
```

La risposta contiene solo numeri, per esempio `{"job":"weekly","configured":true,"sent":2,"empty":1,...}`. Con `"configured":false`, il campo `missing` dice quali impostazioni mancano. Attenzione: il riepilogo mandato a mano conta come quello della settimana in corso, quindi una seconda prova nella stessa settimana non manda nulla (il lunedì dopo arriva normalmente). Per le menzioni usa `{"job":"mentions"}`: parte solo per chi ha menzioni non lette da almeno 10 minuti (chiedi a un collega di taggarti e aspetta senza aprirle).

Dal SQL Editor si prova la catena completa, Vault e `pg_net` compresi, e si controlla l'esito:

```sql
select public.notify_call('mentions');
select status_code, content, error_msg from net._http_response order by created desc limit 5;
select jobname, schedule, active from cron.job;
select status, return_message, start_time from cron.job_run_details order by start_time desc limit 10;
```

`notify_call` restituisce `null` se nel Vault manca uno dei due segreti. I log della funzione (**Edge Functions › notify › Logs**) contengono solo conteggi, mai nomi, indirizzi o testi.

### Spegnere

- **Una persona:** dal Profilo, scheda Email.
- **Tutti, per un po':** cancella il segreto dal Vault. I job continuano a girare ma non chiamano più la funzione, anche se lo schema viene riapplicato. Per riaccendere, ricrea il segreto come al punto 5.

  ```sql
  delete from vault.secrets where name = 'notify_secret';
  ```

- **Solo l'invio:** `supabase secrets unset BREVO_API_KEY --project-ref ixhnqeabctkpflwkdarj`. La funzione risponde `"configured":false` e non segna nulla; quando la chiave torna, partono solo le menzioni dell'ultimo giorno.
- **Fermare i job:** `select cron.unschedule('notify-mentions'); select cron.unschedule('notify-weekly');`. Riapplicando lo schema vengono ricreati: per uno stop duraturo conviene il Vault.

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

**Rimuovere qualcuno.** Dal sito (Membri) perde subito l'accesso ai dati. Per bloccare anche l'account, disattivalo o eliminalo in Authentication › Users.

**Backup.** Membri › Esporta un backup completo scarica idee, storico e commenti in JSON. I file di backup sono esclusi da git.

**Svuotare il cestino per sempre.** Il sito non cancella mai davvero. Se serve, l'admin fa prima un backup e poi, dal SQL Editor, elimina gli elementi nel cestino insieme a quelli delle idee archiviate; storico e commenti collegati spariscono con loro:

```sql
begin;
delete from public.items where idea_id in (select id from public.items where deleted_at is not null);
delete from public.items where deleted_at is not null;
commit;
```

**Ruoli e accessi.** Ogni ingresso, uscita e cambio di ruolo finisce nel registro di sicurezza, visibile agli admin nella pagina Membri.

## Documenti

- [Sicurezza](docs/SICUREZZA.md)
- [Test](docs/TEST.md)
