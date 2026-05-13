#!/usr/bin/env julia
# Concatenate per-year monthly VIIRS CSVs from data/raw/ into a single tidy
# panel at data/clean/viirs_monthly.csv. The cleaning (stray-light correction,
# gap-fill) is already done upstream by NOAA's VCMSLCFG product, and GEE has
# already aggregated per (district, month) on the server.
#
# Input  : data/raw/viirs_monthly_<year>.csv
# Output : data/clean/viirs_monthly.csv
#          columns: pc11_s_id, pc11_d_id, d_name, year, month, date,
#                   sum_radiance, mean_radiance, n_pixels

using CSV
using DataFrames
using Dates

const ROOT      = joinpath(@__DIR__, "..")
const RAW_DIR   = joinpath(ROOT, "data", "raw")
const CLEAN_DIR = joinpath(ROOT, "data", "clean")

function main()
    files = sort(filter(f -> startswith(f, "viirs_monthly_") && endswith(f, ".csv"),
                        readdir(RAW_DIR)))
    isempty(files) && error("No viirs_monthly_*.csv in $RAW_DIR — run `make export-viirs` and download")

    df = reduce(vcat, [CSV.read(joinpath(RAW_DIR, f), DataFrame) for f in files])
    df = df[coalesce.(df.n_pixels, 0) .> 0, :]
    df.year  = Int.(df.year)
    df.month = Int.(df.month)
    df.date  = [Date(y, m) for (y, m) in zip(df.year, df.month)]
    sort!(df, [:pc11_s_id, :pc11_d_id, :year, :month])

    mkpath(CLEAN_DIR)
    out = joinpath(CLEAN_DIR, "viirs_monthly.csv")
    CSV.write(out, df)
    println("wrote $(nrow(df)) rows → $out")
end

isinteractive() || main()
