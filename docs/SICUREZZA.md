# Sicurezza di ai-deep-endenti

Il sito contiene le idee del team, le interviste a potenziali clienti e le valutazioni interne: informazioni riservate che non devono uscire. È anche un sito statico su una repo pubblica, quindi tutto il codice è visibile a chiunque. La sicurezza non può dipendere dal fatto che il codice sia segreto: deve stare nel database e nella progettazione.

L'approccio è quello della progettazione sicura (Secure by Design): molti problemi non nascono da attacchi sofisticati ma da un design poco preciso, quindi si cerca di rendere impossibili gli stati non validi invece di inseguire le vulnerabilità una per una.

## Principi applicati

| Principio | In pratica |
|---|---|
| **Negato di default** | Tutte le tabelle hanno la Row Level Security; senza una regola esplicita non si legge né si scrive nulla. Lo schema non si installa se una tabella pubblica non ha la RLS. Il ruolo `anon` non ha alcun permesso. |
| **Minimo privilegio** | Tre ruoli: l'advisor legge, commenta e vota; il membro modifica le board; solo l'admin gestisce il team. Ognuno modifica solo i propri voti, commenti e profilo. La chiave di servizio esiste solo dentro la Edge Function. |
| **Validazione a strati** | Dimensione, poi formato, poi regole di dominio: nel sito (`schema.js`), nel database (vincoli e trigger) e nella funzione di Claude. |
| **Valido per costruzione** | Ogni salvataggio passa da `sanitizeSnapshot`, che scarta campi sconosciuti e valori malformati. Il database rifiuta stati non ammessi per il tipo di board, titoli vuoti e collegamenti a elementi che non sono idee, e impedisce di cambiare tipo, autore, data di creazione e versione. |
| **Nessuna fiducia nei dati esterni** | I dati che arrivano dal vivo vengono applicati solo se ben formati e più recenti. Le risposte di Claude sono accettate solo come testo, con lunghezza limitata. Il codice QR della 2FA è accettato solo come immagine SVG inline. |
| **Errori senza dati personali** | All'esterno solo messaggi generici in italiano; i dettagli tecnici non arrivano all'interfaccia e i log della funzione non contengono il contenuto delle board. |
| **Tracciabilità** | Ogni modifica è una revisione immutabile, con autore, messaggio e differenze. Ingressi, uscite e cambi di ruolo nel team finiscono in un registro di sicurezza leggibile solo dagli admin. |
| **Resilienza** | Se Claude, la presenza o gli aggiornamenti dal vivo non funzionano, il resto del sito continua a funzionare. I dati si riallineano col database entrando nelle pagine, al ritorno sulla scheda, dopo una riconnessione e ogni minuto; una risposta vuota inattesa non svuota il sito. Le bozze restano sul dispositivo se la connessione cade durante una modifica. |
| **Minimizzazione dei dati** | A Claude vanno solo i contenuti delle board, mai nomi delle persone del team, la lista delle persone con cui interfacciarsi, contatti degli intervistati, foto o identificativi. L'esportazione Markdown esclude contatti, persone e foto; la divisione delle quote resta solo nel database. |
| **Foto delle buyer persona** | Il browser ritaglia l'immagine, la riduce a 256 pixel e la ricodifica in JPEG, così i metadati dell'originale (posizione GPS, dispositivo) non vengono salvati. Si accettano solo immagini JPEG, PNG o WebP in base64 sotto i 120.000 caratteri, mai SVG, sia al salvataggio sia alla visualizzazione. L'editor invita a usare foto di repertorio o generate, non quelle di persone reali. |
| **Chat** | Leggono e scrivono solo i membri con 2FA, advisor compresi; autore, data e chat di un messaggio li fissa il database, e ognuno modifica o elimina solo i propri. Un messaggio eliminato perde davvero il testo. La chat «Generale» è una sola e non si archivia; nelle chat archiviate non si scrive. I non letti sono calcolati dal database per la persona che chiede. Le chat non vengono mai inviate a Claude. Una risposta può citare solo un messaggio della stessa chat. |
| **Link** | In chat e note diventano cliccabili solo gli indirizzi `http://`, `https://` e `mailto:`, che si aprono in una nuova scheda con `rel="noopener noreferrer nofollow"`: la pagina aperta non può controllare il sito e non riceve da dove arriva. Nelle risposte di Claude i link restano testo, perché potrebbero venire da contenuti non affidabili. |
| **Immagini di note e chat** | Stanno nello spazio privato `note-immagini` di Supabase Storage: le leggono e caricano solo i membri con 2FA, le cancellano solo admin e membri, con nomi del tipo `idea/uuid.jpg` e solo JPEG sotto 1 MB. Il browser le riduce e le ricodifica (niente metadati), le scarica con la sessione dell'utente e le mostra come `blob:`, senza link pubblici. Un'immagine senza puntatore in nessuna nota (cestino compreso) e in nessun messaggio viene cancellata: subito se tolta dal testo, altrimenti dalla pulizia periodica dopo 24 ore. Le versioni vecchie nello storico non contano come puntatore. |

## Minacce considerate

| Minaccia | Esempio | Contromisura |
|---|---|---|
| Lettura dei dati senza account | Chiamare l'API di Supabase con la chiave anon presa dal codice | RLS su tutte le tabelle, nessun permesso al ruolo `anon`, funzioni RPC non eseguibili da `anon` |
| Password rubata | Qualcuno scopre la password di un membro | 2FA obbligatoria, verificata dal database: le regole richiedono `aal2` nel token, non basta l'interfaccia |
| Account creati da estranei | Registrazione aperta per errore | Le registrazioni sono disattivate e, anche se un estraneo entrasse con la 2FA, senza una riga in `members` non vede nulla |
| Promozione a admin | Un membro modifica il proprio ruolo con una chiamata diretta | Trigger che consente il cambio di ruolo solo agli admin; deve sempre restare almeno un admin |
| Storico falsificato | Riscrivere chi ha fatto cosa | Revisioni scritte solo da un trigger; nessun permesso di inserimento, modifica o cancellazione per gli utenti |
| Perdita di dati | Cancellazione per errore o di proposito | Le board non si cancellano: vanno nel cestino. Le revisioni non si cancellano |
| Sovrascrittura tra colleghi | Due persone salvano la stessa board | Ogni salvataggio indica la versione di partenza; se nel frattempo è cambiata, il sito unisce le modifiche e chiede solo dove si sovrappongono |
| Codice malevolo nel browser | Uno script inserito nel titolo di un'idea | Tutto il testo è inserito come testo (mai HTML); Content Security Policy senza `unsafe-inline`; link `javascript:` neutralizzati |
| Abuso di Claude | Richieste in massa che consumano il budget | Solo membri con 2FA, limite per persona nelle ultime 24 ore, contesto e corpo limitati in dimensione, origini consentite esplicite |
| Prompt injection | Un'intervista contiene istruzioni rivolte a Claude | Il contenuto è passato come dato tra tag `<board>`, il prompt dice di ignorare istruzioni al suo interno, Claude non ha strumenti né accesso al database |
| Sessione dimenticata aperta | Un computer condiviso | Disconnessione dopo 4 ore di inattività; "Esci da tutti i dispositivi" nel Profilo |
| Segreti nella repo | Chiave Anthropic o di servizio committata | Le chiavi stanno nei segreti di Supabase; `.gitignore` esclude `.env` e i backup; un test verifica che nel codice ci sia solo la chiave anon |

## Cose da sapere

- **La chiave anon è pubblica per costruzione.** Serve solo a identificare il progetto: senza un account del team con 2FA non apre nulla. Non va confusa con la chiave di servizio, che non deve mai uscire da Supabase.
- **GitHub Pages non permette di impostare intestazioni HTTP.** La Content Security Policy è dichiarata con un tag `meta`, che non supporta `frame-ancestors`: il sito potrebbe essere incorniciato da un'altra pagina. Il rischio è basso, perché ogni azione importante chiede conferma, ma un dominio con intestazioni proprie lo eliminerebbe.
- **La sessione sta nel `localStorage` del browser**, come in tutte le app Supabase. La difesa principale contro il furto è non permettere script estranei: niente HTML generato dai dati e una CSP restrittiva.
- **Supabase non ha codici di recupero per la 2FA.** Conviene registrare due dispositivi; in alternativa l'admin rimuove il fattore dal database (procedura nel README).
- **Il database controlla dimensioni, tipi, stati e collegamenti, non il formato di ogni singolo campo** delle board: quello lo garantisce il sito. Un membro che usa l'API direttamente può salvare campi inattesi nel proprio JSON, ma non può uscire dalle regole di accesso né falsificare lo storico.
- **La presenza online** passa da un canale privato autorizzato dal database: la vedono solo i membri con 2FA.
- **I dati inviati a Claude** passano dall'API di Anthropic. Non includono persone o contatti, ma includono il contenuto delle idee.
