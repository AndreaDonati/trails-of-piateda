# Modulo di segnalazione problemi

Questo documento descrive il flusso di segnalazione di un problema su un
sentiero o percorso ("Segnala un problema"), come è fatto il Google Form a
cui il sito rimanda, e come ricrearlo o riconfigurarlo.

## Come funziona il flusso

Ogni pagina di dettaglio, quando il modulo è configurato, mostra un pulsante
"Segnala un problema". Il pulsante apre un pannello sulla pagina stessa in
cui il visitatore può, facoltativamente, scegliere un punto sulla mappa. Alla
conferma, il sito apre in una nuova scheda il Google Form, con due campi
pre-compilati:

- il nome e l'URL dell'entry (sentiero o percorso);
- le coordinate (il punto scelto sulla mappa, oppure il primo punto della
  traccia se non è stato scelto nulla).

Tipo di problema, descrizione, foto e contatto vengono compilati dal
visitatore direttamente nel form, non sul sito. Le risposte arrivano in un
Google Sheet collegato al form, che il proprietario del sito inoltra al
gruppo di volontari che si occupa della manutenzione dei sentieri.

Le segnalazioni non sono mai mostrate sul sito: non esiste una pagina che
legga il foglio Google, né una copia delle segnalazioni nel repository.

## Domande del modulo

Il form va creato una sola volta su Google Forms, con le domande seguenti,
in questo ordine:

| # | Domanda | Tipo | Note |
|---|---------|------|------|
| 1 | Sentiero o percorso | Risposta breve | Pre-compilata dal sito |
| 2 | Posizione (lat, lon) | Risposta breve | Pre-compilata dal sito |
| 3 | Tipo di problema | Scelta multipla | Opzioni: Ostacolo sul sentiero / Frana o danno / Segnaletica mancante o danneggiata / Altro |
| 4 | Descrizione | Paragrafo | Obbligatoria |
| 5 | Foto | Caricamento file | Fino a 5 file, 10 MB ciascuno |
| 6 | Contatto (facoltativo) | Risposta breve | — |

Nota sulla domanda "Foto": aggiungere una domanda di caricamento file in un
Google Form obbliga chi risponde ad accedere con un account Google (è un
requisito di Google Forms, non del sito). È una scelta consapevole: si è
ritenuto più utile poter allegare foto del problema che evitare il login.
Il pannello sul sito lo dichiara esplicitamente prima che il visitatore
apra il form.

## Impostazioni del form

Nelle impostazioni del form (icona ingranaggio):

- "Raccogli indirizzi email": disattivato (facoltativo, non richiesto — il
  campo "Contatto" nel form serve a questo se il segnalante vuole essere
  ricontattato).
- "Limita a 1 risposta": disattivato (un visitatore deve poter inviare più
  segnalazioni).
- Collegare le risposte a un nuovo Google Sheet (menu Risposte → icona del
  foglio di calcolo verde), così le segnalazioni arrivano in una tabella che
  il proprietario del sito può condividere o esportare per i volontari.

## Come ottenere gli id dei campi pre-compilati

Il sito costruisce l'URL del form aggiungendo parametri di pre-compilazione
di Google Forms. Per ottenere gli id dei due campi da pre-compilare (Sentiero
o percorso, Posizione):

1. Aprire il form in modalità compilazione (non editor) e cliccare sui tre
   puntini in alto a destra → "Ottieni link precompilato" ("Get pre-filled
   link").
2. Compilare la domanda "Sentiero o percorso" con un valore riconoscibile,
   ad esempio `TEST-ENTRY`, e la domanda "Posizione (lat, lon)" con un
   valore altrettanto riconoscibile, ad esempio `0.0000, 0.0000`.
3. Cliccare "Ottieni link" ("Get link") e copiare l'URL generato.
4. Nell'URL, cercare i parametri `entry.<numero>=TEST-ENTRY` e
   `entry.<numero>=0.0000%2C+0.0000`. Il numero dopo `entry.` in ciascuno è
   l'id del campo corrispondente.

Il sito costruisce quindi l'URL della segnalazione come:

```
<PUBLIC_REPORT_FORM_URL>?usp=pp_url&entry.<ENTRY_ID>=<nome e URL>&entry.<POSITION_ID>=<lat>, <lon>
```

dove `<PUBLIC_REPORT_FORM_URL>` è l'URL del form che termina in `/viewform`,
`<ENTRY_ID>` è l'id trovato per "Sentiero o percorso" e `<POSITION_ID>` è
l'id trovato per "Posizione (lat, lon)".

## Come configurare il sito

Il sito legge tre variabili d'ambiente al momento della build:

- `PUBLIC_REPORT_FORM_URL`: l'URL del form (quello che termina in
  `/viewform`).
- `PUBLIC_REPORT_FORM_FIELD_ENTRY`: l'id del campo "Sentiero o percorso"
  (il numero dopo `entry.`).
- `PUBLIC_REPORT_FORM_FIELD_POSITION`: l'id del campo "Posizione (lat, lon)".

In produzione: repository Settings → Secrets and variables → Actions →
scheda Variables, dove vanno create le tre variabili con questi nomi. Sono
variabili (`vars`), non secret, perché non contengono nulla di sensibile e
devono restare leggibili anche nelle build delle pull request aperte da
fork (che non hanno accesso ai secret del repository).

In locale: copiare `.env.example` in `.env` e valorizzare le stesse tre
variabili.

### Comportamento quando non sono impostate

Se una qualunque delle tre variabili manca al momento della build, il
pulsante "Segnala un problema" non compare sulle pagine di dettaglio e non
resta alcun riferimento alla segnalazione nell'HTML generato.

## Checklist di verifica

Dopo aver creato o modificato il form e impostato le variabili:

1. Aprire una pagina di dettaglio del sito (build con le variabili
   impostate).
2. Cliccare "Segnala un problema" e scegliere un punto sulla mappa.
3. Confermare e verificare che il form si apra in una nuova scheda.
4. Controllare che i campi "Sentiero o percorso" e "Posizione (lat, lon)"
   siano pre-compilati con l'entry corretta e le coordinate scelte.
5. Compilare tipo, descrizione e (facoltativo) una foto e un contatto, poi
   inviare il form.
6. Aprire il Google Sheet collegato e verificare che sia comparsa una nuova
   riga con i dati inviati.
