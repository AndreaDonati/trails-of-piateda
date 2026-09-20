# Contribuire a Sentieri di Piateda

Il catalogo dei sentieri vive nel repository: ogni voce è una cartella con un
file di metadati, una traccia GPX e, facoltativamente, delle foto. Per
aggiungere o correggere una voce si apre una pull request. Non serve saper
programmare: servono un account GitHub, il GPX e qualche riga di testo.

Se non hai il GPX o preferisci non aprire una PR, apri una
[issue di proposta](../../issues/new?template=proposta-sentiero.yml): la
trasformo io in una voce del catalogo.

## Sentiero o percorso?

- **Sentiero** (`content/trails/`): un singolo tracciato segnalato, per esempio
  un tratto con numerazione CAI.
- **Percorso** (`content/routes/`): un itinerario, per esempio un anello o una
  gita di giornata, eventualmente composto da più sentieri.

## Struttura di una voce

```
content/trails/piateda-ambria/
├── trail.yaml        # metadati (route.yaml per i percorsi)
├── track.gpx         # la traccia
└── photos/           # facoltativa
    ├── cima.jpg
    └── ponte.jpg
```

Il nome della cartella è l'identificatore della voce e finisce nell'URL della
pagina. Deve essere in minuscolo, con parole separate da trattini:
`piateda-ambria` va bene, `Piateda_Ambria` no.

## Il file dei metadati

```yaml
name: Da Piateda ad Ambria
summary: Salita nel bosco fino alla piana di Ambria, con vista sulla valle.
difficulty: E
municipalities:
  - Piateda
start:
  name: Piateda Alta, parcheggio della chiesa
  lat: 46.1612
  lon: 9.9375

# Campi facoltativi
description: |
  Testo lungo in Markdown. Può occupare più righe e descrivere
  il percorso, i punti d'acqua, i tratti esposti.
signage: CAI 301
duration_minutes: 180
tags: [bosco, panoramico]
status: open           # open | closed | maintenance
verified_on: 2026-09-15
sources:
  - https://esempio.it/scheda-sentiero
contributors:
  - Nome Cognome
photos:
  - file: cima.jpg
    caption: La vista dalla cima verso la Valtellina
    author: Nome Cognome
cover: cima.jpg
```

Campi obbligatori: `name`, `summary` (massimo 200 caratteri), `difficulty`,
`municipalities`, `start`.

Nei percorsi (`route.yaml`) ci sono due campi in più, entrambi facoltativi:
`loop: true` se è un anello, e `trails: [piateda-ambria, ...]` con gli
identificatori dei sentieri che compone.

Un campo scritto male (per esempio `dificulty`) fa fallire la build: i campi
sconosciuti vengono rifiutati apposta, così un errore di battitura non passa
inosservato.

### Difficoltà

Si usa la scala CAI:

| Sigla | Significato |
| --- | --- |
| `T` | Turistico |
| `E` | Escursionistico |
| `EE` | Escursionisti esperti |
| `EEA` | Escursionisti esperti con attrezzatura |

## La traccia GPX

- Formato GPX 1.1 con almeno un `<trk>` e almeno due punti.
- Tutti i punti devono cadere nell'area di interesse: latitudine tra 45.95 e
  46.35, longitudine tra 9.60 e 10.20. Copre Piateda, i comuni limitrofi e il
  fondovalle. Un punto fuori area fa fallire la build, e di solito significa
  che è stato caricato il GPX sbagliato.
- Se la traccia ha le quote (`<ele>`), il sito calcola dislivello e profilo
  altimetrico. Senza quote la voce funziona lo stesso, ma quei dati mancano.
- Tracce molto lunghe con campionamento al secondo pesano parecchio: se il file
  supera qualche centinaio di kilobyte, riducine i punti prima di committare
  (in GPS Track Editor, GPSBabel o simili).

Lunghezza, dislivello, quote minime e massime e profilo altimetrico sono
calcolati dal GPX durante la build: non vanno scritti a mano. Le quote sono
prima lisciate con una media mobile su 5 punti, così il rumore del GPS non
gonfia il dislivello, e lo stesso trattamento vale per tutte le voci in modo che i numeri
siano confrontabili tra loro. L'unico dato temporale che puoi indicare a mano è
`duration_minutes`.

## Le foto

- Formato JPEG, massimo 2 MB per file e 12 foto per voce.
- Ridimensiona a circa 2000 pixel sul lato lungo prima di committare: una foto
  da telefono scende così sotto il megabyte senza perdite visibili.
- Ogni foto deve avere una posizione. Normalmente arriva dai dati EXIF GPS dello
  scatto. Attenzione: le app di messaggistica cancellano l'EXIF, quindi usa il
  file originale. Se l'EXIF non c'è, indica tu le coordinate nel campo `photos`
  con `lat` e `lon`.
- Il sito pubblica solo la posizione: data, ora, modello di fotocamera e ogni
  altro dato EXIF vengono rimossi dalle immagini pubblicate, e il file
  originale non finisce nel sito.
- Devi avere i diritti sulle foto che carichi. Non caricare foto con persone
  riconoscibili senza il loro consenso.

## Licenza

Il codice del sito è sotto licenza MIT ([LICENSE](LICENSE)). I dati del
catalogo, cioè tutto quello che sta sotto `content/` (metadati, GPX e foto),
sono sotto [CC BY 4.0](LICENSE-DATA).

Aprendo una pull request che tocca `content/` dichiari di avere i diritti sui
dati e sulle foto che aggiungi e accetti che vengano pubblicati con quella
licenza.

## Aprire la pull request

1. Fai un fork del repository e crea un branch.
2. Aggiungi la cartella della voce con i suoi file.
3. Facoltativo ma consigliato: `npm install` e `npm run build` in locale, per
   vedere subito eventuali errori.
4. Apri la pull request e segui la checklist del template.

La stessa build gira automaticamente sulla pull request. Se qualcosa non va, il
log dell'azione nomina la voce e il problema: leggi lì prima di indovinare.
