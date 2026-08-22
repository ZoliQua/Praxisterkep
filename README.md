# Magyar-Alapellatas · Praxistérkép

Interaktív térkép a magyar alapellátási körzetekről: betöltetlenség, időtartam,
érintett lakosság, trendek — havonta frissülő NEAK-adatokból. Első ütemben
fogorvosi alapellátás, később háziorvosi.

- Terv: [`docs/PLAN.md`](docs/PLAN.md)
- Fejlesztési szabályok: [`CLAUDE.md`](CLAUDE.md)

## Futtatás

```bash
# ETL (Python 3.12+): letöltés -> parse -> geokódolás -> validálás -> build
pip install -r etl/requirements.txt
python etl/run.py --month 2026-08

# ETL tesztek
cd etl && python -m pytest

# Web (React + Vite + TS) — az ETL kimenetét fogyasztja
cd web && npm install && npm run dev

# Web tesztek és éles build
cd web && npm test && npm run build
```

A megyehatár-réteg (`data/geo/counties.geojson`) OSM-ből származik
(© OpenStreetMap közreműködők, ODbL), Overpass-lekérdezésből egyszerűsítve.

## Adatfolyam

- Nyers források (audit): `data/raw/YYYY-MM/` — a git-történet maga az adattörténet.
- Havi snapshot: `data/YYYY-MM/dental.json`, plusz `data/latest.json` és
  `data/timeseries.json`.
- A pipeline validálási hibánál nem publikál (a havi GitHub Actions futás
  ilyenkor issue-t nyit).

Szerző: **Dr. Dúl Zoltán** · Adatforrások: NEAK, OKFŐ, KSH, OpenStreetMap.
Az adatok tájékoztató jellegűek.
