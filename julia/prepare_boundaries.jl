#!/usr/bin/env julia
# Convert data/boundaries/district.shp into:
#   data/clean/districts.geojson             (full resolution, for dashboard choropleth)
#   data/clean/districts_simplified.geojson  (Douglas-Peucker simplified, <8 MB,
#                                             for inline GEE FeatureCollection)
#
# Columns kept on each feature: pc11_s_id, pc11_d_id, d_name.
#
# Tunable: SIMPLIFY_TOLERANCE (degrees). 0.005 ≈ 500 m at the equator, which
# is finer than VIIRS pixel size.

using ArchGDAL
using JSON3

const ROOT      = joinpath(@__DIR__, "..")
const SHP_PATH  = joinpath(ROOT, "data", "boundaries", "district.shp")
const CLEAN_DIR = joinpath(ROOT, "data", "clean")
const KEEP      = ["pc11_s_id", "pc11_d_id", "d_name"]

const SIMPLIFY_TOLERANCE = 0.005

function read_features(simplify::Bool)
    feats = []
    ArchGDAL.read(SHP_PATH) do ds
        layer = ArchGDAL.getlayer(ds, 0)
        for f in layer
            geom = ArchGDAL.getgeom(f)
            geom === nothing && continue
            if simplify
                geom = ArchGDAL.simplifypreservetopology(geom, SIMPLIFY_TOLERANCE)
            end
            props = Dict{String,Any}()
            for k in KEEP
                idx = ArchGDAL.findfieldindex(f, k)
                props[k] = idx == -1 ? nothing : ArchGDAL.getfield(f, idx)
            end
            push!(feats, Dict(
                "type" => "Feature",
                "geometry" => JSON3.read(ArchGDAL.toJSON(geom)),
                "properties" => props,
            ))
        end
    end
    feats
end

function write_fc(feats, path)
    fc = Dict("type" => "FeatureCollection", "features" => feats)
    open(path, "w") do io
        JSON3.write(io, fc)
    end
    println("wrote ", length(feats), " features → ", path,
            " (", round(filesize(path) / 1e6; digits=2), " MB)")
end

function main()
    mkpath(CLEAN_DIR)
    write_fc(read_features(false), joinpath(CLEAN_DIR, "districts.geojson"))
    write_fc(read_features(true),  joinpath(CLEAN_DIR, "districts_simplified.geojson"))
end

isinteractive() || main()
