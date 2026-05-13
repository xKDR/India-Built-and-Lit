"""
Annual building volume by Indian district from Google Open Buildings 2.5D Temporal.

Source: GOOGLE/Research/open-buildings-temporal/v1
  - ImageCollection of annual snapshots, one image per year, 2016-2023
  - Bands used:
      building_height : per-pixel building height (m); 0 on non-building pixels.
  - Native resolution ~4 m. We do not use `building_fractional_count`
    (which sums to building COUNT, not area) or `building_presence` (model
    confidence is uncalibrated per the GEE catalog).

For each (district, year) we compute:
  - volume_m3    : sum( building_height * pixel_area )
                   The height band is 0 on non-building pixels, so the integral
                   over the polygon naturally picks up only built-up area.
  - footprint_m2 : sum( (building_height > 0) * pixel_area )
  - mean_height  : volume_m3 / footprint_m2  (derived downstream)

Output: one CSV per year exported to Google Drive folder
        `Districts-Of-India-Buildings`.

District boundaries can be supplied either as
  --asset  <gee-asset-id>       (FeatureCollection already uploaded to GEE)
or
  --geojson data/clean/districts_simplified.geojson
                                (loaded inline; useful when no GCS bucket is
                                 available for `earthengine upload table`)

Usage:
  python gee/extract_building_volume.py \
      --project gee-ntl-470405 \
      --geojson data/clean/districts_simplified.geojson \
      --start 2016 --end 2023
"""

import argparse
import json
import ee


COLLECTION = "GOOGLE/Research/open-buildings-temporal/v1"
SCALE_M = 100  # native ~4 m; 100 m is enough at district granularity and much faster
DRIVE_FOLDER = "Districts-Of-India-Buildings"

ID_COLUMNS = ["pc11_s_id", "pc11_d_id", "d_name"]


def parse_args():
    p = argparse.ArgumentParser(description=__doc__)
    src = p.add_mutually_exclusive_group(required=True)
    src.add_argument("--asset", help="GEE FeatureCollection asset id")
    src.add_argument("--geojson", help="Path to a local GeoJSON of districts")
    p.add_argument("--start", type=int, default=2016)
    p.add_argument("--end", type=int, default=2023)
    p.add_argument("--scale", type=int, default=SCALE_M,
                   help="Reduction scale in metres (default 10)")
    p.add_argument("--project", default=None)
    return p.parse_args()


def fc_from_geojson(path):
    with open(path) as f:
        gj = json.load(f)
    feats = []
    for feat in gj["features"]:
        geom = ee.Geometry(feat["geometry"], proj="EPSG:4326", geodesic=False)
        props = {k: feat["properties"].get(k) for k in ID_COLUMNS}
        feats.append(ee.Feature(geom, props))
    return ee.FeatureCollection(feats)


def year_image(year):
    """Return the single annual image for `year` with `volume_m3` and
    `footprint_m2` bands.

    Volume:    sum(building_height * pixel_area)
               `building_height` is 0 on non-building pixels, so the integral
               over a region naturally picks up only built-up area.
    Footprint: sum((building_height > 0) * pixel_area)
    """
    start = ee.Date.fromYMD(year, 1, 1)
    end = ee.Date.fromYMD(year + 1, 1, 1)
    img = (ee.ImageCollection(COLLECTION)
           .filterDate(start, end)
           .mosaic())

    pixel_area = ee.Image.pixelArea()
    height = img.select("building_height")

    volume = height.multiply(pixel_area).rename("volume_m3")
    footprint = pixel_area.multiply(height.gt(0)).rename("footprint_m2")

    return volume.addBands(footprint)


def export_year(year, districts, id_cols, scale):
    img = year_image(year)

    reduced = img.reduceRegions(
        collection=districts,
        reducer=ee.Reducer.sum(),
        scale=scale,
        tileScale=8,
    )

    def tag(f):
        return ee.Feature(None,
                          f.toDictionary(id_cols + ["footprint_m2", "volume_m3"])
                           .set("year", year))

    fc = reduced.map(tag)

    desc = f"buildings_{year}"
    task = ee.batch.Export.table.toDrive(
        collection=fc,
        description=desc,
        folder=DRIVE_FOLDER,
        fileNamePrefix=desc,
        fileFormat="CSV",
        selectors=id_cols + ["year", "footprint_m2", "volume_m3"],
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

    for year in range(args.start, args.end + 1):
        export_year(year, districts, ID_COLUMNS, args.scale)

    print(f"\nAll tasks queued. Monitor at https://code.earthengine.google.com/tasks")
    print(f"CSVs will appear in Google Drive folder: {DRIVE_FOLDER}/")


if __name__ == "__main__":
    main()
