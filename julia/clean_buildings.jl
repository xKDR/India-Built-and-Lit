#!/usr/bin/env julia
# Concatenate per-year Open Buildings CSVs into a single district-year panel.
#
# Input  : data/raw/buildings_<year>.csv     (one file per year from GEE)
# Output : data/clean/bv_annual.csv
#          columns: pc11_s_id, pc11_d_id, d_name, year,
#                   footprint_m2, volume_m3, mean_height_m

using CSV
using DataFrames

const ROOT      = joinpath(@__DIR__, "..")
const RAW_DIR   = joinpath(ROOT, "data", "raw")
const CLEAN_DIR = joinpath(ROOT, "data", "clean")

function main()
    files = sort(filter(f -> startswith(f, "buildings_") && endswith(f, ".csv"),
                        readdir(RAW_DIR)))
    isempty(files) && error("No buildings_*.csv in $RAW_DIR")
    df = reduce(vcat, [CSV.read(joinpath(RAW_DIR, f), DataFrame) for f in files])
    df = df[df.footprint_m2 .> 0, :]
    df.year = Int.(df.year)
    df.mean_height_m = df.volume_m3 ./ df.footprint_m2
    sort!(df, [:pc11_s_id, :pc11_d_id, :year])

    mkpath(CLEAN_DIR)
    out = joinpath(CLEAN_DIR, "bv_annual.csv")
    CSV.write(out, df)
    println("wrote $(nrow(df)) rows → $out")
end

isinteractive() || main()
