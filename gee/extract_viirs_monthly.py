"""
Monthly VIIRS Night-Time Lights summed to SHRUG districts, server-side in GEE.

Source: NOAA/VIIRS/DNB/MONTHLY_V1/VCMSLCFG
  - Stray-light corrected, gap-filled monthly composite
  - Band: avg_rad (nW/cm²/sr)
  - 2014-01 onward (earlier months are unreliable)

For each (district, month) we compute (server-side):
  - sum_radiance   : sum of avg_rad over district polygon
  - mean_radiance  : mean of avg_rad
  - n_pixels       : count of valid pixels

Output: one CSV per year exported to Google Drive folder
        `Districts-Of-India-VIIRS`.

District boundaries are supplied either as
  --asset   <gee-asset-id>      (FeatureCollection already on GEE)
or
  --geojson data/clean/districts_simplified.geojson
                                (inline; no GCS bucket needed)

Usage:
  python gee/extract_viirs_monthly.py \
      --project gee-ntl-470405 \
      --geojson data/clean/districts_simplified.geojson \
      --start 2014 --end 2025
"""

import argparse
import json
import ee


VIIRS_COLLECTION = "NOAA/VIIRS/DNB/MONTHLY_V1/VCMSLCFG"
SCALE_M = 500
DRIVE_FOLDER = "Districts-Of-India-VIIRS"
ID_COLUMNS = ["pc11_s_id", "pc11_d_id", "d_name"]


def parse_args():
    p = argparse.ArgumentParser(description=__doc__)
    src = p.add_mutually_exclusive_group(required=True)
    src.add_argument("--asset", help="GEE FeatureCollection asset id")
    src.add_argument("--geojson", help="Path to a local GeoJSON of districts")
    p.add_argument("--start", type=int, default=2014,
                   help="First year (inclusive)")
    p.add_argument("--end", type=int, default=2025,
                   help="Last year (inclusive)")
    p.add_argument("--project", default=None)
    return p.parse_args()


def fc_from_geojson(path):
    with open(path) as f:
        gj = json.load(f)
    feats = [ee.Feature(ee.Geometry(feat["geometry"], proj="EPSG:4326",
                                    geodesic=False),
                        {k: feat["properties"].get(k) for k in ID_COLUMNS})
             for feat in gj["features"]]
    return ee.FeatureCollection(feats)


def export_year(year, districts):
    start = ee.Date.fromYMD(year, 1, 1)
    end = ee.Date.fromYMD(year + 1, 1, 1)

    viirs = (ee.ImageCollection(VIIRS_COLLECTION)
             .filterDate(start, end)
             .select("avg_rad"))

    reducer = (ee.Reducer.sum().setOutputs(["sum_radiance"])
               .combine(ee.Reducer.mean().setOutputs(["mean_radiance"]),
                        sharedInputs=True)
               .combine(ee.Reducer.count().setOutputs(["n_pixels"]),
                        sharedInputs=True))

    def reduce_image(img):
        m = ee.Date(img.get("system:time_start")).get("month")
        return (img.reduceRegions(collection=districts, reducer=reducer,
                                  scale=SCALE_M, tileScale=4)
                .map(lambda f: f.set("year", year).set("month", m)))

    fc = ee.FeatureCollection(viirs.map(reduce_image)).flatten()

    desc = f"viirs_monthly_{year}"
    task = ee.batch.Export.table.toDrive(
        collection=fc,
        description=desc,
        folder=DRIVE_FOLDER,
        fileNamePrefix=desc,
        fileFormat="CSV",
        selectors=ID_COLUMNS + ["year", "month",
                                "sum_radiance", "mean_radiance", "n_pixels"],
    )
    task.start()
    print(f"  [{year}] task started: {task.id}")


def main():
    args = parse_args()
    if args.project:
        ee.Initialize(project=args.project)
    else:
        ee.Initialize()

    if args.asset:
        districts = ee.FeatureCollection(args.asset)
    else:
        districts = fc_from_geojson(args.geojson)
    print(f"Districts loaded: {districts.size().getInfo()} features")

    for y in range(args.start, args.end + 1):
        export_year(y, districts)

    print("\nAll tasks queued. Monitor at https://code.earthengine.google.com/tasks")
    print(f"CSVs will appear in Google Drive folder: {DRIVE_FOLDER}/")


if __name__ == "__main__":
    main()
