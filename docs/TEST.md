# Test di ai-deep-endenti

Questo documento descrive come sono scritti i test, cosa verificano e cosa resta fuori.

Numeri al 18 ottobre 2026:

| | Test | Copertura |
|---|---|---|
| Database (PostgreSQL 16, script SQL) | 28 controlli | permessi, 2FA, storico, conflitti, ruoli, registro di sicurezza, ultimo accesso reale, note e immagini private, chat (Generale unica, autore fissato, risposte nella stessa chat, eliminazione, non letti), regole dei nuovi tipi di scheda |
| Sito e funzione di Claude (`node:test`, jsdom) | 263 | 96% delle righe e 85% dei rami del codice dell'app |

## 1. Come sono stati scritti

### Metodo

I test sono **white-box**: scritti leggendo il codice, nella stessa sessione in cui il codice veniva scritto, con l'assistenza di Claude. Un requisito frainteso può quindi finire sia nel codice sia nel test. Durante lo sviluppo i test del database hanno già trovato un difetto reale: il trigger controllava lo stato prima di riportare il tipo dell'elemento al valore originale, quindi un tentativo di cambiare tipo veniva rifiutato con un messaggio sbagliato invece di essere ignorato.

### Convenzioni

- Il nome di ogni test è una frase che descrive il comportamento, per esempio `saveWithMerge rebases on the newer version when the edits touch different fields` o `un advisor vota e commenta, ma solo a nome proprio`.
- Ogni test verifica un comportamento, con preparazione, azione e verifica.
- I servizi esterni sono finti: un client Supabase che registra le chiamate (`tests/fakes/supabase-js.mjs`) e dipendenze passate alla funzione di Claude. Nessun test chiama Supabase o Anthropic davvero.
- I test dell'interfaccia girano in un DOM simulato (jsdom) e usano dati di prova comuni (`tests/setup/fixtures.mjs`), volutamente generici: la repo è pubblica, quindi nei test non compaiono idee, persone o dati reali del team.

### Livelli

| Livello | Come | Esempi |
|---|---|---|
| Database | Postgres temporaneo con un ambiente che imita Supabase (`auth.uid()`, `auth.jwt()`, ruoli). Lo schema viene installato due volte per verificare che sia rieseguibile | 2FA obbligatoria, advisor in sola lettura, conflitti di versione, storico immutabile, registro di sicurezza |
| Librerie | Funzioni pure | differenze tra versioni, unione a tre vie, "chi ha scritto cosa", validazione, classifica, Markdown delle risposte di Claude |
| Accesso ai dati e stato | Client Supabase finto | traduzione degli errori, paginazione, filtri, dati dal vivo malformati, bozze locali |
| Interfaccia | jsdom, interazioni simulate | ogni pagina, form, conflitti, ripristino di versioni, login e 2FA, generatore (con le persone per competenza e settore), profilo, team, idee di esempio valide e in sola lettura, nuove schede (persone, buyer persona a scheda con foto ridotta nel browser, VPC, mercato, concorrenti, deep tech, Team Canvas, quote), vista Javelin, roadmap di ogni idea (spunte solo manuali e rimovibili, suggerimenti dai dati, passi facoltativi, esempi in sola lettura), guida e concetti, appunti con immagini (barra di formattazione, titolo dalla prima riga, caricamento, pulizia, import ed export .md), menu laterale, chat (elenco e non letti, invio immediato in ordine con riprova, risposte con citazione, link sicuri, messaggi dal vivo, modifica ed eliminazione, chat dell'idea, archiviazione), notifiche, risincronizzazione dei dati e pulsante Indietro |
| Sicurezza | Test sul DOM e controlli statici sul codice | testo malevolo in ogni campo e in ogni pagina, divieto di `innerHTML` ed `eval`, CSP, versioni fissate delle librerie, solo la chiave anon nel codice, RLS su ogni tabella |
| Funzione di Claude | Handler con dipendenze finte | CORS, autenticazione, limiti di dimensione, compiti ammessi, limite giornaliero, rifiuti e risposte troncate, log senza contenuti |

## 2. Come si eseguono

```bash
npm test
```

```bash
npm run test:coverage
```

```bash
npm run test:db
```

`npm run test:db` richiede PostgreSQL 15 o successivo installato localmente; crea un database temporaneo e lo cancella alla fine. Gli stessi test girano su GitHub Actions a ogni push e su ogni pull request, con Node 22 e il PostgreSQL già presente sui server di GitHub.

## 3. Cosa non è testato

| Mancanza | Rischio |
|---|---|
| Supabase vero | Le regole di accesso sono verificate su un Postgres che imita Supabase. Il comportamento reale di Auth (login, 2FA, recupero password, scadenza dei token) e di Realtime non è provato dai test. |
| Browser vero | jsdom non applica la Content Security Policy, non disegna la pagina e non supporta davvero trascinamento e finestre modali native. |
| Flussi tra più persone | I conflitti di versione sono verificati, ma non due salvataggi realmente contemporanei sul database. |
| Claude vero | Si verifica come la funzione usa la risposta, non la qualità delle risposte. |
| Deploy | Il workflow di GitHub Actions esegue tutti i test prima di pubblicare, ma la pubblicazione su Pages e il deploy della funzione non hanno test propri: si verificano guardando il risultato del workflow. |
| Qualità dei test | La copertura misura il codice eseguito, non gli errori che i test catturerebbero. Il mutation testing non è stato fatto. |
