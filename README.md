# BeCity 3.2

Piattaforma locale per architettura, urbanistica e territorio: **CAD · GIS · BIM · Presentazione · Normativa · Contabilità**.
Funziona sul proprio computer, senza installazione, senza Node.js e senza login. I dati restano in locale.

## Avvio rapido (Windows)

1. Scarica il repository (pulsante **Code → Download ZIP**) ed estrai la cartella.
2. Doppio clic su **`BeCity.exe`** (la cartella `app` deve restare accanto all'eseguibile).
3. Si apre la finestra di BeCity in Microsoft Edge o Chrome in modalità applicazione.

L'eseguibile non è firmato digitalmente: al primo avvio Windows SmartScreen può mostrare
“Windows ha protetto il PC” → “Ulteriori informazioni” → “Esegui comunque”. Le impronte SHA-256 sono in `SHA256.txt`.

Se l'avvio non riesce compare un riquadro con i dettagli e la **modalità sicura**; il registro è in `Documenti\BeCity\becity.log`. Per finestre nere o vuote (driver grafici) avvia `BeCity.exe --compat`.

- Linux: `chmod +x BeCity-linux && ./BeCity-linux`
- macOS: `avvia-mac.command` (python3; senza conversione DWG e PostGIS)

Istruzioni complete, dati e sicurezza: [`LEGGIMI.txt`](LEGGIMI.txt). Componenti open source e licenze: [`TERZE_PARTI.txt`](TERZE_PARTI.txt) e `app/licenses/`.

## Struttura

| Percorso | Contenuto |
|---|---|
| `app/` | Applicazione (HTML, CSS, JavaScript, librerie in `app/vendor`, dati di esempio in `app/dati-esempio`) |
| `BeCity.exe`, `BeCity-linux` | Programma di avvio: server locale su 127.0.0.1, conversione DWG ↔ DXF, PostGIS, archivio su disco |
| `launcher/` | Codice sorgente del programma di avvio (Rust) |

## Dati

Con BeCity.exe progetti, file allegati e prezzari sono salvati in `Documenti\BeCity\` (oppure in una cartella `dati` accanto all'eseguibile, modalità portatile).

## Compilare il programma di avvio

```bash
cd launcher
cargo build --release                                   # Linux
WINDRES=x86_64-w64-mingw32-windres cargo build --release --target x86_64-pc-windows-gnu   # Windows (da Linux con mingw-w64)
```
