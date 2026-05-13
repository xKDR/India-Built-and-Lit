# GEE extraction

Two Python scripts that drive Google Earth Engine.

| Script | Dataset | Output |
|---|---|---|
| `extract_viirs_monthly.py`   | `NOAA/VIIRS/DNB/MONTHLY_V1/VCMSLCFG` | One **GeoTIFF per month** (bands `avg_rad`, `cf_cvg`), clipped to the SHRUG asset's bbox. Cleaned + aggregated downstream by Julia. |
| `extract_building_volume.py` | `GOOGLE/Research/open-buildings-temporal/v1` | One **CSV per year** with district-level `footprint_m2` and `volume_m3` (reduced server-side). |

The asymmetry is deliberate: VIIRS is exported as rasters so that
`NighttimeLights.clean_complete` (PSTT2021 cleaning) can run pixel-by-pixel
before any spatial aggregation. Building volume can be reduced in GEE directly
since the temporal cleaning steps don't apply.

## 1. One-time setup

```bash
pip install earthengine-api
earthengine authenticate
```

If you use a Cloud project: pass `--project <project-id>` to either script.

## 2. Upload the SHRUG district shapefile as a GEE asset

In the GEE Code Editor: **Assets → New → Shape files**, upload all
`.shp/.shx/.dbf/.prj` files together. Use an asset id like:

```
users/<your-username>/shrug_pc11_districts
```

The scripts expect these fields (edit `ID_COLUMNS` in either script if your
shapefile uses different names):

- `pc11_s_id`, `pc11_d_id`, `pc11_s_n`, `pc11_d_n`

## 3. Run the exports

```bash
python gee/extract_viirs_monthly.py \
    --asset users/<you>/shrug_pc11_districts \
    --start 2014-01 --end 2024-12

python gee/extract_building_volume.py \
    --asset users/<you>/shrug_pc11_districts \
    --start 2016 --end 2023
```

VIIRS queues one `Export.image.toDrive` task per month (132 tasks for
2014-01…2024-12 — they're small ~50 MB each). Buildings queues one
`Export.table.toDrive` task per year. Monitor at
<https://code.earthengine.google.com/tasks>.

## 4. Download outputs

| Drive folder | Local destination |
|---|---|
| `Districts-Of-India-VIIRS/viirs_YYYY_MM.tif`        | `data/raw/viirs/` |
| `Districts-Of-India-Buildings/buildings_YYYY.csv`   | `data/raw/`       |

From here the Julia scripts under `../julia/` take over.
