# India · Built & Lit

[![Live dashboard](https://img.shields.io/badge/live%20dashboard-xkdr.github.io%2FIndia--Built--and--Lit-f57d6a?style=flat-square)](https://xkdr.github.io/India-Built-and-Lit/)
[![License: MIT](https://img.shields.io/badge/license-MIT-1a1a1a?style=flat-square)](LICENSE)
[![Julia](https://img.shields.io/badge/built%20with-Julia-9558B2?style=flat-square&logo=julia&logoColor=white)](https://julialang.org)
[![NighttimeLights.jl](https://img.shields.io/badge/cleaned%20with-NighttimeLights.jl-1a1a1a?style=flat-square)](https://github.com/xKDR/NighttimeLights.jl)
[![Google Earth Engine](https://img.shields.io/badge/built%20on-GEE-4285F4?style=flat-square&logo=googleearth&logoColor=white)](https://earthengine.google.com)

District-level annual **building volume** and monthly **night-time lights**
for ~640 Indian districts. Buildings via Google Earth Engine; VIIRS NTL
cleaned locally with [NighttimeLights.jl](https://github.com/xKDR/NighttimeLights.jl).

| Layer | Source | How it's loaded | Frequency | Years |
|---|---|---|---|---|
| NTL | NOAA VIIRS SL monthly TIFs | Local files via `NighttimeLights.readnl` | Monthly | 2014 → present |
| Building volume | `GOOGLE/Research/open-buildings-temporal/v1` | GEE per-district reduction | Annual | 2016 → 2023 |
| Boundaries | SHRUG PC11 districts | Local shapefile in `data/boundaries/` | — | 2011 vintage |

## Pipeline

```
   ┌────────────────────────┐    ┌────────────────────────────────────┐    ┌──────────────────┐
   │  Buildings:            │    │  Julia                             │    │  Static dashboard│
   │  GEE → CSV per year    │ →  │  • per-district readnl()           │ →  │  HTML + JS       │
   │                        │    │  • clean_complete (PSTT2021)       │    │  + Plotly.js     │
   │  VIIRS:                │    │  • mask + sum → viirs_monthly.csv  │    │                  │
   │  local SL TIFs         │    │  • merge → district_panel.csv      │    │                  │
   └────────────────────────┘    └────────────────────────────────────┘    └──────────────────┘
```

1. **Buildings** — `gee/extract_building_volume.py` queues annual
   `Export.table.toDrive` tasks computing `sum(building_height × pixel_area)`
   per district; `gee/download_from_drive.py` pulls the CSVs into `data/raw/`;
   `julia/clean_buildings.jl` concatenates them into `data/clean/bv_annual.csv`.
2. **VIIRS** — `julia/clean_viirs.jl` loops over SHRUG districts (threaded);
   for each, `NighttimeLights.readnl` loads the bbox of that district from the
   local SL monthly TIFs, then `clean_complete` (the PSTT2021 pipeline) cleans
   the time series before the mask + sum → `data/clean/viirs_monthly.csv`.
   Default TIF paths: `/mnt/giant-disk/ntl/sl/{rad,cf}/` — override with
   `DOI_RAD_PATH` / `DOI_CF_PATH`.
3. **Dashboard** — `make dashboard` stages `bv_annual.csv`,
   `viirs_monthly.csv` and the simplified GeoJSON into `docs/data/`. The
   static page (`docs/index.html` + `app.js`) fetches them at runtime; it
   builds the annual NTL aggregate and the BV⨝NTL join in the browser.
4. **[docs/](docs/)** — served by GitHub Pages.

### Notebook alternative

[`notebooks/`](notebooks/) holds reproducible-research notebooks that produce
the same `data/clean/` outputs from GEE: `building_volume.ipynb` (Python) and
`nighttime_lights.ipynb` (Python → Julia, two kernels). Both expose a
resampling knob. See [notebooks/README.md](notebooks/README.md).

## End-to-end run

```bash
# 1. (one-time) upload SHRUG shapefile as a GEE asset — see gee/README.md
# 2. authenticate GEE and queue the building-volume export
pip install earthengine-api
earthengine authenticate
make export-bv         # one task per year, 2016-2023

# 3. download CSVs from Drive when the tasks finish:
python3 gee/download_from_drive.py \
    --folder Districts-Of-India-Buildings --dest data/raw \
    --pattern 'buildings_.*\.csv'

# 4. (one-time) point Julia env at the local NighttimeLights.jl checkout
make julia-deps

# 5. shapefile → GeoJSONs, VIIRS clean, merge panel
make boundaries        # writes data/clean/districts.geojson + districts_simplified.geojson
make viirs             # per-district readnl + clean_complete + mask + sum
make panel             # joins VIIRS (annual) with building CSVs

# 6. stage data files for the dashboard
make dashboard       # copies cleaned + raw CSVs into docs/data/
make serve           # http://localhost:8080/  (Python's http.server)
```

The dashboard is plain HTML + JS — Plotly.js + PapaParse are pulled from CDN,
and `docs/app.js` fetches the CSVs / GeoJSON at runtime.

## Publishing on GitHub Pages

`make dashboard` stages everything the page needs into `docs/data/`. Commit
that folder along with `docs/index.html` / `docs/app.js` / `docs/style.css`,
push, then in **Settings → Pages**:

- **Source:** Deploy from a branch
- **Branch:** `main` (or whichever) **/ docs**

GitHub will serve the page at `https://<user>.github.io/<repo>/`, fetching the
CSVs and GeoJSON from `https://<user>.github.io/<repo>/data/...`. No server-side
code runs — the JS does all parsing and plotting in the browser.

To refresh published data: re-run the pipeline locally, `make dashboard`,
commit `docs/data/`, push. Pages re-deploys automatically.

## Outputs

The Julia pipeline writes to `data/clean/`:

| File | Schema |
|---|---|
| `viirs_monthly.csv`   | `pc11_s_id, pc11_d_id, pc11_s_n, pc11_d_n, year, month, date, sum_radiance, mean_radiance, n_pixels` — cleaned by `NighttimeLights.clean_complete` |
| `district_panel.csv`  | monthly VIIRS rolled to year ⨝ buildings, one row per (district, year). Buildings come straight from the GEE export in `data/raw/buildings_*.csv` — no Julia cleaning. |
| `districts.geojson`   | district polygons for the choropleth |
