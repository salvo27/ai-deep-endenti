# Progetti (multi-tenant)

Il sito ospita più **progetti**. Ogni progetto è una board completa e isolata: idee e schede, storico, commenti, chat, menzioni, questionari e risposte, spese, squadra, membri. Una persona può stare in più progetti e passa dall'uno all'altro con un selettore; dentro un progetto vede solo i dati di quel progetto.

Questo documento è il contratto: i test del database (`supabase/tests/database/`) e del sito lo verificano punto per punto.

## Chi decide cosa

| Figura | Dove vale | Cosa può fare |
|---|---|---|
| **Amministratore della piattaforma** (`platform_admins`) | ovunque | Crea, rinomina, archivia e riattiva progetti; aggiunge e toglie persone in qualunque progetto e ne cambia il ruolo; aggiunge e toglie altri amministratori della piattaforma (ne resta sempre almeno uno); legge il registro di sicurezza di tutto. **Non legge i contenuti di un progetto** se non ne è membro: per vederli deve aggiungersi, e l'aggiunta finisce nel registro. |
| **Admin del progetto** (`members.role = 'admin'`) | nel suo progetto | Gestisce il team del progetto (aggiunge persone già registrate che non sono ancora in nessun progetto o che stanno già in uno dei suoi, cambia ruoli, toglie), rinomina il progetto, legge il registro del progetto; in più tutto quello che fa un membro. Chi sta solo nei progetti di altri lo aggiunge un amministratore della piattaforma. In ogni progetto resta sempre almeno un admin. |
| **Membro** (`member`) | nel suo progetto | Crea e modifica le board. |
| **Advisor** (`advisor`) | nel suo progetto | Legge, commenta, vota, scrive in chat; modifica solo i propri voti e impegni. |

Tutto richiede la verifica in due passaggi (`aal2` nel token), come prima. Un progetto archiviato non si legge e non si scrive più da nessun membro (i dati restano): lo riattiva solo un amministratore della piattaforma.

## Database

### Tabelle nuove

- `projects (id, name, created_by, created_at, archived_at)`: nome da 1 a 80 caratteri senza spazi ai bordi. Si scrive solo con le funzioni qui sotto, mai direttamente; non si cancella, si archivia.
- `platform_admins (user_id, created_by, created_at)`: si scrive solo con le funzioni o dal SQL Editor.
- `profiles (user_id, display_name, color, language, created_at)`: nome e colore valgono in tutti i progetti; `language` è `'en'`, `'it'` o `null` (= segue il dispositivo) e decide la lingua di email e risposte di Claude. Ognuno modifica solo il proprio profilo; lo vede chi condivide almeno un progetto con lui e l'amministratore della piattaforma.

### Tabelle che cambiano

- `members` diventa `(project_id, user_id, role, created_at)` con chiave `(project_id, user_id)`. Nome e colore passano a `profiles`.
- `project_id` (non nullo, con indice) si aggiunge a `items`, `revisions`, `comments`, `chats`, `chat_messages`, `mentions`, `survey_responses`, `survey_events`; `audit_log.project_id` può essere nullo per gli eventi della piattaforma; `email_weekly` diventa per persona, progetto e settimana.
- `project_id` lo scrive il database: in `items` e `chats` lo dà chi crea e non cambia più; nelle altre tabelle lo copia un trigger dall'elemento, dalla chat o dal questionario a cui appartengono, ignorando quello che manda il client. Un'idea collegata (`idea_id`) e una chat collegata a un'idea devono stare nello stesso progetto, e una risposta in chat può citare solo un messaggio della stessa chat.
- Le unicità diventano per progetto: una sola scheda `criteria`, `generator`, `teamcanvas`, `equity` per progetto; un voto e un elemento «Impegni» per persona e progetto; un foglio ore per persona, progetto e settimana; una chat «Generale» per progetto, creata insieme al progetto. Il codice del link pubblico di un questionario resta unico in tutto il sito.

### Funzioni

- `is_platform_admin()`, `my_role(p_project)`, `can_read(p_project)`, `can_write(p_project)`, `is_admin(p_project)`, `can_manage(p_project)` (= admin del progetto o amministratore della piattaforma). Le versioni senza argomenti spariscono.
- `my_projects()`: i progetti non archiviati di chi chiama, con il suo ruolo. `all_projects()`: per l'amministratore della piattaforma, tutti i progetti con numero di membri e di admin.
- `create_project(p_name)`, `rename_project(p_project, p_name)`, `archive_project(p_project)`, `unarchive_project(p_project)`, `add_platform_admin(p_email)`, `remove_platform_admin(p_user)`.
- `add_member(p_project, p_email, p_display_name, p_role)`: crea il profilo se manca, senza mai rinominare chi ne ha già uno. L'admin di un progetto aggiunge solo un account in nessun progetto o chi condivide già un progetto con lui: per chi sta solo nei progetti di altri risponde `user_not_found`, come per un indirizzo senza account, così nessun admin scopre chi c'è sulla piattaforma né porta nel suo progetto la persona di un altro team. L'amministratore della piattaforma aggiunge chiunque. Ruolo e uscita dal progetto si cambiano su `members` con le regole di accesso (solo `can_manage`) e il trigger dell'ultimo admin.
- Registro di sicurezza: quello che un amministratore della piattaforma fa in un progetto di cui non è admin porta `details.by = 'platform_admin'`, e la pagina Membri lo mostra come «Un amministratore della piattaforma», non come un ex membro.
- `members_overview(p_project)`: come prima (nome, colore, ruolo, email, ultimo accesso, 2FA), ma solo per quel progetto e con l'ultima attività calcolata sui dati di quel progetto.
- `create_item(p_project, p_kind, p_title, p_status, p_data, p_idea, p_message)`; le altre operazioni sugli elementi ricavano il progetto dall'elemento.
- `chat_overview(p_project)`; `mark_mentions_read(p_project, p_ids)` segna lette solo le menzioni di quel progetto («Segna tutte come lette» non tocca gli altri); `note_image_orphans(p_project, p_paths)` e `survey_image_orphans(p_project, p_paths)` guardano solo le immagini di quel progetto.
- Gli identificativi di elementi e chat li sceglie il database quando li crea il sito: nessuno può dare a un elemento nuovo l'id di una chat o di un'idea di un altro progetto.
- Un'unica istruzione che cambia o toglie membri di più progetti viene rifiutata (`not_allowed`): si lavora un progetto alla volta.
- Menzioni: `@[tutti]` e `@[Nome]` cercano solo tra i membri del progetto del testo.
- Email: i dati per la funzione `notify` portano progetto, nome del progetto e lingua di chi riceve; il riepilogo del lunedì è uno per persona e per progetto.

### Errori

Il database non scrive mai frasi per le persone: ogni `raise exception` ha come messaggio un codice inglese in snake_case, senza dati personali né valori inseriti, e il sito lo traduce nella lingua di chi legge (`tx.serverErrors[codice]`). Il SQLSTATE (`using errcode`) dice di che tipo di errore si tratta:

| SQLSTATE | Gruppo | Esempi |
|---|---|---|
| `42501` | permesso negato da una funzione | `not_allowed` |
| `22023` | valore non valido | `invalid_project_name`, `invalid_role`, `invalid_status`, `title_required`, `invalid_timesheet`, `timesheet_overlap` |
| `P0001` | regola violata | `last_platform_admin`, `last_project_admin`, `cross_project`, `chat_archived`, `message_deleted`, `timesheet_future_day` |
| `P0002` | non trovato | `project_not_found`, `user_not_found`, `idea_not_found`, `expense_group_not_found` |

L'elenco completo è quello dei `raise exception` di `supabase/schema.sql`, con i testi in `assets/js/i18n/it/server-errors.js` (le vecchie frasi, il riferimento) e `assets/js/i18n/en/server-errors.js`: `tests/unit/server-errors.test.mjs` controlla che ogni codice abbia il suo SQLSTATE, sempre lo stesso, e il suo testo nelle due lingue, e che nessun testo resti senza codice. Un codice nuovo si aggiunge allo schema e ai due file dei testi insieme.

La pagina pubblica dei questionari non riceve eccezioni: `submit_survey` risponde `{ status: 'errore', reason, question? }` con `reason` un codice snake_case (`invalid_answers`, `already_submitted`, `survey_full`, …), i cui testi stanno in `assets/js/public/texts.js` (`server`), perché quella pagina non carica nulla del sito; lo stesso test li controlla. Gli stati delle funzioni pubbliche (`ok`, `errore`, `non_trovato`, `chiuso`, `aperto`) sono valori del protocollo e restano come sono.

I codici delle funzioni dei progetti:

| Caso | SQLSTATE | Messaggio |
|---|---|---|
| Permesso negato da una funzione | `42501` | `not_allowed` |
| Progetto inesistente o archiviato | `P0002` | `project_not_found` |
| Nome del progetto non valido | `22023` | `invalid_project_name` |
| Ruolo non valido | `22023` | `invalid_role` |
| Nessun account con quell'email | `P0002` | `user_not_found` |
| Ultimo amministratore della piattaforma | `P0001` | `last_platform_admin` |
| Ultimo admin del progetto | `P0001` | `last_project_admin` |
| Collegamento a un elemento di un altro progetto | `P0001` | `cross_project` |

Le regole di accesso sulle tabelle rifiutano con il `42501` di Postgres.

### Storage e tempo reale

- Le immagini restano dove sono: la prima cartella del percorso è un'idea, un questionario, un gruppo di spese o una chat, e `storage_project(name)` ne ricava il progetto (solo per chi quel progetto lo può leggere). Leggere, caricare e cancellare seguono i ruoli di quel progetto, come prima. Nessun file va spostato.
- La presenza online usa un canale per progetto, `board:<id del progetto>`, autorizzato da `can_read` di quel progetto. Gli aggiornamenti dal vivo delle tabelle passano già dalle regole di accesso, quindi ognuno riceve solo quelli dei suoi progetti.
- `members` e `profiles` non mandano più aggiornamenti dal vivo: le cancellazioni arriverebbero a tutti i collegati, di ogni progetto. Il sito rilegge i membri entrando nelle pagine e a intervalli, come fa già con gli elementi.
- L'ultima attività in `members_overview` conta accessi e sessioni solo per chi ha un solo progetto: per chi ne ha più di uno conta solo quello che ha fatto in quel progetto, così un admin non vede cosa fa una persona negli altri.

### Aggiornamento dei dati esistenti

Lo schema resta uno script che si può rieseguire senza perdere dati. Alla prima esecuzione su un database a squadra unica:

1. crea il progetto `ai-deep-endenti` e ci mette tutte le righe esistenti, senza creare revisioni né menzioni nuove e senza far partire email;
2. copia nome e colore di ogni membro nel suo profilo, con l'italiano come lingua (il sito di allora era solo in italiano); i profili creati dopo restano senza lingua;
3. rende amministratori della piattaforma gli admin di allora (solo se non ce n'è ancora nessuno);
4. le esecuzioni successive non cambiano nulla.

Il test `supabase/tests/database/*aggiornamento*` parte dallo schema di prima (`tests/db/legacy-schema.sql`) con dati di ogni tipo e lo prova.

## Sito

- Il progetto scelto si ricorda sul dispositivo; senza scelta valida si apre il primo di `my_projects()`. Chi non ha progetti vede la schermata «non fai parte di nessun progetto» (l'amministratore della piattaforma vede invece la pagina Progetti, e il suo Profilo: ogni altro indirizzo porta alla pagina Progetti).
- Il selettore nel menu elenca i progetti di `my_projects()`; cambiare progetto ricarica dati, presenza e chat di quel progetto. Con modifiche non salvate la pagina aperta chiede prima, come per ogni uscita: chi resta resta nel progetto di prima e nulla cambia.
- Un link con `?progetto=` aperto in una scheda dove il sito è già aperto apre quel progetto se è un altro dei miei, sulla pagina del link; altrimenti il parametro sparisce e la pagina si apre nel progetto aperto.
- Chi non può più leggere il progetto aperto (tolto, o progetto archiviato) lo scopre alla risincronizzazione: un membro vede la schermata di chi non ne fa più parte; l'amministratore della piattaforma, per cui `members_overview` risponde sempre, lo scopre da `my_projects()` e il sito si ricarica sulla pagina Progetti, in un altro suo progetto o in nessuno.
- Quello che il dispositivo ricorda di un progetto vale solo per quel progetto: bozze degli elementi nuovi, ultima visita della dashboard, chi conta negli impegni, notifiche lette. Il valore unico di prima dei progetti vale per il primo progetto aperto dopo l'aggiornamento, poi sparisce.
- Pagina **Progetti** (`#/progetti`), solo per l'amministratore della piattaforma: elenco con membri e admin, creazione, rinomina, archiviazione, persone e ruoli di ogni progetto, amministratori della piattaforma.
- La pagina **Membri** resta all'admin del progetto, limitata al suo progetto.
- I link delle email portano il progetto, così aprono il progetto giusto.
