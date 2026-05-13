# Districts of India

District-level annual **building volume** and monthly **night-time lights** for
~640 Indian districts, derived from Google Earth Engine.

| Layer | Source | How it's loaded | Frequency | Years |
|---|---|---|---|---|
| NTL | `NOAA/VIIRS/DNB/MONTHLY_V1/VCMSLCFG` | GEE per-district reduction | Monthly | 2014 → present |
| Building volume | `GOOGLE/Research/open-buildings-temporal/v1` | GEE per-district reduction | Annual | 2016 → 2023 |
| Boundaries | SHRUG PC11 districts | Local shapefile in `data/boundaries/` | — | 2011 vintage |

## Pipeline

```
   ┌────────────────────────────┐    ┌──────────────────────────┐    ┌──────────────────┐
   │  GEE (Python)              │    │  Julia                   │    │  Static dashboard│
   │  • VIIRS:   yearly CSVs    │ →  │  • concat VIIRS years    │ →  │  HTML + JS       │
   │  • Building: yearly CSVs   │    │  • merge into panel      │    │  + Plotly.js     │
   │    (per-district reduce)   │    │                          │    │                  │
   └────────────────────────────┘    └──────────────────────────┘    └──────────────────┘
```

1. **VIIRS** — `gee/extract_viirs_monthly.py` queues one task per year that
   reduces `avg_rad` to (district, month) sum/mean/count using the SHRUG
   polygons. NOAA's VCMSLCFG product is already stray-light-corrected and
   gap-filled, so we let that stand as the cleaning step. CSVs land in Drive
   folder `Districts-Of-India-VIIRS`.
2. **Buildings** — `gee/extract_building_volume.py` queues one task per year
   computing `sum(building_height × pixel_area)` per district from
   Open Buildings 2.5D Temporal. CSVs land in Drive folder
   `Districts-Of-India-Buildings`.
3. **Download** — `gee/download_from_drive.py` pulls both sets of CSVs into
   `data/raw/`.
4. **Julia** — `julia/clean_viirs.jl` concatenates per-year VIIRS CSVs into
   one tidy panel; `julia/merge_panel.jl` rolls VIIRS monthly to annual and
   joins with the buildings panel.
3. **[dashboard/build_dashboard.py](dashboard/build_dashboard.py)** — generates
   a single self-contained `docs/index.html` with Plotly.
4. **[docs/](docs/)** — output directory served by GitHub Pages.

## End-to-end run

```bash
# 1. (one-time) upload SHRUG shapefile as a GEE asset — see gee/README.md
# 2. authenticate GEE and queue both exports
pip install earthengine-api
earthengine authenticate
make export-bv         # buildings 2016-2023, one task per year
make export-viirs      # VIIRS monthly 2014-2025, one task per year

# 3. download CSVs from Drive when the tasks finish:
python3 gee/download_from_drive.py \
    --folder Districts-Of-India-Buildings --dest data/raw \
    --pattern 'buildings_.*\.csv'
python3 gee/download_from_drive.py \
    --folder Districts-Of-India-VIIRS --dest data/raw \
    --pattern 'viirs_monthly_.*\.csv'

# 4. (one-time) instantiate the Julia env
make julia-deps

# 5. shapefile → GeoJSONs, concat VIIRS years, merge panel
make boundaries        # writes data/clean/districts.geojson + districts_simplified.geojson
make viirs             # concatenates data/raw/viirs_monthly_*.csv
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
