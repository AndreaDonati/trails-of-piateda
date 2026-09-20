# Sentieri di Piateda

Catalogo dei sentieri e dei percorsi escursionistici del comune di Piateda (SO)
e dei comuni limitrofi. Sito statico: i dati stanno nel repository, la
pubblicazione avviene su GitHub Pages a ogni push su `main`, non c'è nessun
server né database da gestire.

Sito: <https://andreadonati.github.io/trails-of-piateda/>

Per aggiungere un sentiero o correggerne uno, vedi
[CONTRIBUTING.md](CONTRIBUTING.md).

## Cosa contiene

- Un elenco filtrabile di sentieri e percorsi, con scheda per ciascuno.
- Statistiche e profilo altimetrico calcolati dal GPX durante la build.
- Una mappa con terreno 3D navigabile, tracce colorate per difficoltà e foto
  geolocalizzate.
- Un pulsante per segnalare ostacoli o danni su un sentiero, che apre un modulo
  Google precompilato.

## Struttura

```
content/          # il catalogo: una cartella per sentiero o percorso
  trails/<slug>/  # trail.yaml + track.gpx + photos/
  routes/<slug>/  # route.yaml + track.gpx + photos/
src/
  content.config.ts   # schema dei metadati (Zod)
  lib/                # elaborazione GPX, foto, configurazione mappa
  layouts/, components/, pages/, styles/
tests/            # test Vitest e fixture
docs/             # documentazione operativa
openspec/         # documenti di progettazione del cambiamento
```

## Sviluppo in locale

Serve Node 24 o superiore.

```bash
npm install
npm run dev      # sviluppo su http://localhost:4321
npm run build    # build statica in dist/
npm run preview  # anteprima della build
npm test         # test
npx astro check  # controllo dei tipi
```

## Come la build valida i dati

La build fallisce, con codice di uscita diverso da zero, se una voce del
catalogo non è valida. Il messaggio di errore nomina sempre la voce e il
problema. Vengono controllati:

- il nome della cartella e la presenza dei file previsti;
- i campi dei metadati, compresi i campi sconosciuti (rifiutati) e i riferimenti
  a sentieri inesistenti;
- il GPX: formato, presenza di una traccia con almeno due punti, coordinate
  dentro l'area di interesse;
- le foto: formato, dimensione, numero, presenza di una posizione.

La stessa build gira su ogni pull request come controllo obbligatorio, quindi
una contribuzione non valida non arriva al sito.

## Configurazione

Le variabili d'ambiente sono elencate in [.env.example](.env.example). In
locale si copiano in un file `.env`; in CI arrivano dalle variabili del
repository.

| Variabile | A cosa serve |
| --- | --- |
| `SITE_URL` | Dominio del sito pubblicato |
| `BASE_PATH` | Sottocartella su GitHub Pages |
| `PUBLIC_REPORT_FORM_URL` | Modulo Google per le segnalazioni |
| `PUBLIC_REPORT_FORM_FIELD_ENTRY` | Id del campo precompilato con la voce |
| `PUBLIC_REPORT_FORM_FIELD_POSITION` | Id del campo precompilato con le coordinate |

Senza le tre variabili del modulo, il pulsante di segnalazione non compare.
Come creare il modulo e ricavare gli id dei campi:
[docs/report-form.md](docs/report-form.md).

## Mappa e tile

Le tile della mappa e i dati di elevazione arrivano da servizi pubblici senza
chiave di accesso, configurati in un unico file, `src/lib/mapConfig.ts`:

- sfondo topografico: OpenTopoMap (CC BY-SA, attribuzione obbligatoria);
- elevazione per il 3D e l'ombreggiatura: Mapterhorn, con AWS Terrain Tiles
  come alternativa già annotata nel file.

Per cambiare fornitore si modifica quel file. Se un servizio non risponde, la
mappa continua a funzionare in 2D.

## Licenze

Codice sotto [MIT](LICENSE). Dati del catalogo, cioè tutto `content/`, sotto
[CC BY 4.0](LICENSE-DATA).
