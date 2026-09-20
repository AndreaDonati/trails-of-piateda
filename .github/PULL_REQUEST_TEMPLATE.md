<!--
Grazie per il contributo. Se questa PR aggiunge o modifica un sentiero o
un percorso, compila la checklist qui sotto. Se è una modifica al codice
del sito, puoi cancellare la checklist e descrivere solo il cambiamento.
-->

## Cosa cambia

<!-- Breve descrizione: cosa aggiunge o modifica questa PR e perché. -->

## Checklist per un nuovo sentiero/percorso

- [ ] La cartella dell'entry si trova in `content/trails/<slug>/` o `content/routes/<slug>/`, con `<slug>` in kebab-case (minuscolo, parole separate da trattini)
- [ ] È presente `trail.yaml` (o `route.yaml`) con i campi obbligatori: `name`, `summary`, `difficulty` (uno tra `T`, `E`, `EE`, `EEA`), `municipalities`, `start`
- [ ] È presente `track.gpx` con almeno un elemento `<trk>`, e la traccia ricade nell'area di Piateda e dintorni
- [ ] Se sono incluse foto, sono in `photos/`, formato JPEG, ciascuna ≤ 2 MB, non più di 12 per entry, geotaggate oppure con `lat`/`lon` indicati nei metadati, di cui possiedo i diritti, senza persone identificabili senza il loro consenso
- [ ] Accetto che i dati e le foto siano pubblicati con licenza CC BY 4.0 (`LICENSE-DATA`)
- [ ] Ho eseguito `npm run build` in locale (opzionale, ma consigliato: la CI esegue la stessa build e il suo log indica il nome dell'entry e il problema in caso di errore)
