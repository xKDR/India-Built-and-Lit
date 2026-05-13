# SHRUG district loading + per-district VIIRS cube reader.
#
# Provides:
#   DistrictRow                — record with pc11_s_id, pc11_d_id, d_name, geom
#   load_districts(geojson)    — read all districts from data/clean/districts.geojson
#   read_district(d; …)        — stand-in for `NighttimeLights.readnl(geom, …)`
#                                that materialises each cropped slice. Returns
#                                `(rad_cube, cf_cube)` as Ti-stacked Rasters.
#
# The materialisation step (`read(crop(Raster(...; lazy=true); to=geom))`)
# avoids the DiskArrays "Can only subset chunks for sorted indices" error that
# fires on a few awkwardly-placed small districts (Ramban, Ghaziabad, Vaishali,
# …) when readnl uses the lazy-only path.
#
# Loaded via `include("read_district.jl")` from clean_viirs.jl and any other
# Julia driver that needs district-level VIIRS data.

using Dates
using Rasters
using ArchGDAL
using NighttimeLights

struct DistrictRow
    pc11_s_id::String
    pc11_d_id::String
    d_name::String
    geom::Any
end

"""
    load_districts(geojson_path)

Read a FeatureCollection GeoJSON and return a `Vector{DistrictRow}`.
Expects each feature to have properties `pc11_s_id`, `pc11_d_id`, `d_name`.
"""
function load_districts(geojson_path::AbstractString)
    isfile(geojson_path) || error("$geojson_path not found")
    rows = DistrictRow[]
    ArchGDAL.read(geojson_path) do ds
        layer = ArchGDAL.getlayer(ds, 0)
        for feat in layer
            geom = ArchGDAL.getgeom(feat)
            geom === nothing && continue
            push!(rows, DistrictRow(
                string(ArchGDAL.getfield(feat, "pc11_s_id")),
                string(ArchGDAL.getfield(feat, "pc11_d_id")),
                string(ArchGDAL.getfield(feat, "d_name")),
                geom,
            ))
        end
    end
    rows
end

"""
    read_district(d::DistrictRow; start_date, end_date, rad_path, cf_path)

Load monthly VIIRS radiance + cloud-free-observation cubes restricted to the
district's bbox. Equivalent to `NighttimeLights.readnl(d.geom, …)` but each
cropped TIF slice is materialised eagerly (`read(crop(...))`) so:
  - the DiskArrays "sorted indices" error doesn't fire
  - the comprehensions produce `Vector{<:Raster}` which `RasterSeries` accepts

Returns `(rad_cube, cf_cube)`.
"""
function read_district(d::DistrictRow;
                       start_date::Date,
                       end_date::Date,
                       rad_path::AbstractString,
                       cf_path::AbstractString)
    rad_files, dates = NighttimeLights.sort_files_by_date(rad_path, start_date, end_date)
    cf_files,  _     = NighttimeLights.sort_files_by_date(cf_path,  start_date, end_date)
    rad_list = [read(crop(Raster(joinpath(rad_path, f); lazy=true); to=d.geom))
                for f in rad_files]
    cf_list  = [read(crop(Raster(joinpath(cf_path,  f); lazy=true); to=d.geom))
                for f in cf_files]
    rad = Rasters.combine(RasterSeries(rad_list, Ti(dates)), Ti)
    cf  = Rasters.combine(RasterSeries(cf_list,  Ti(dates)), Ti)
    rad, cf
end
