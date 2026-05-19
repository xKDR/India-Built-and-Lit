# Notebooks — reproducible pipelines

Two notebooks that reproduce the data behind the dashboard. They're written
for **Google Colab** (and run locally too). They are the notebook counterpart
of the scripts in `../gee/` and `../julia/`.

| Notebook | Kernel(s) | Produces | Resampling knob |
|---|---|---|---|
| [`building_volume.ipynb`](building_volume.ipynb) | Python 3 | `bv_annual.csv` | `SCALE_M` (GEE reduction scale, default 100 m) |
| [`nighttime_lights.ipynb`](nighttime_lights.ipynb) | Python 3 **then** Julia | `viirs_monthly.csv` | `EXPORT_SCALE_M` (GEE export scale, default 1000 m) |

The district boundary is fetched over HTTP from the committed
[`data/boundaries/districts_simplified.geojson`](../data/boundaries/districts_simplified.geojson)
— no local file or prior `make boundaries` run needed.

## building_volume.ipynb — single kernel

Pure Python. Reduces Open Buildings 2.5D Temporal to per-district annual
built-up volume, pulls each year's result straight into pandas with
`getInfo()` (no Drive, no export tasks), then plots a national trend, a
choropleth and a top-20 bar chart. Run top-to-bottom on Colab.

## nighttime_lights.ipynb — two kernels, bridged by Google Drive

Colab runs one kernel per notebook, and a runtime switch **wipes `/content`**.
This notebook bridges the switch with **Google Drive** (the same pattern as
xKDR's [Russia-Ukraine notebook](https://colab.research.google.com/github/xKDR/Shedding-light-on-the-Russia-Ukraine-war/blob/main/reproducible_research.ipynb)):

1. **Part 1 (Python)** mounts Drive, then `Export.image.toDrive` writes the
   monthly VIIRS rasters into a Drive folder (`India-Built-and-Lit-VIIRS`).
2. At the **⚠️ banner**, change the Colab runtime: **Runtime → Change runtime
   type → Julia**. `/content` is cleared, but the rasters are on Drive.
3. **Part 2 (Julia)** re-mounts Drive, reads the rasters back, runs
   `NighttimeLights.clean_complete` (PSTT2021 cleaning), aggregates to
   districts, writes `viirs_monthly.csv` back to the same Drive folder, and
   plots the national monthly series.

Because the rasters and the output CSV live on Drive, nothing is lost across
the kernel switch — download `viirs_monthly.csv` from *My Drive* afterwards.

`EXPORT_SCALE_M` controls how much RAM Part 2 needs (the whole cleaned India
cube is held in memory): 500 m native, 1000 m ≈ ¼, 2000 m ≈ 1/16.

## Requirements

On **Colab** both notebooks install what they need (`!pip install` /
`Pkg.add`). For the Julia half you must pick the **Julia runtime**
(Runtime → Change runtime type).

Running **locally** instead of Colab: a Python env with
`earthengine-api pandas matplotlib plotly`, plus Jupyter with both a Python 3
and a Julia (`IJulia`) kernel.

## Prerequisites

- A Google Earth Engine account and a Cloud project — set `PROJECT` in the
  first parameters cell of each notebook.
- For `nighttime_lights.ipynb`: a Google Drive (mounted by the notebook).
