#!/usr/bin/env julia
# Build the district-year panel.
#
# Inputs:
#   data/raw/buildings_<year>.csv    (GEE export — required)
#   data/clean/viirs_monthly.csv     (clean_viirs.jl output — optional)
#
# Buildings are always included. VIIRS is rolled up from monthly to annual and
# joined when present; if viirs_monthly.csv doesn't exist, the panel contains
# only the buildings columns (useful for previewing BV before VIIRS finishes).
#
# Output:
#   data/clean/district_panel.csv

using CSV
using DataFrames
using Statistics

const ROOT      = joinpath(@__DIR__, "..")
const RAW_DIR   = joinpath(ROOT, "data", "raw")
const CLEAN_DIR = joinpath(ROOT, "data", "clean")

function load_buildings()
    files = sort(filter(f -> startswith(f, "buildings_") && endswith(f, ".csv"),
                        readdir(RAW_DIR)))
    isempty(files) && error("No buildings_*.csv files in $RAW_DIR")
    df = reduce(vcat, [CSV.read(joinpath(RAW_DIR, f), DataFrame) for f in files])
    df = df[df.footprint_m2 .> 0, :]
    df.year = Int.(df.year)
    df.mean_height_m = df.volume_m3 ./ df.footprint_m2
    df
end

function load_viirs_annual()
    p = joinpath(CLEAN_DIR, "viirs_monthly.csv")
    isfile(p) || return nothing
    m = CSV.read(p, DataFrame)
    m = m[coalesce.(m.n_pixels, 0) .> 0, :]
    combine(groupby(m, [:pc11_s_id, :pc11_d_id, :d_name, :year]),
            :sum_radiance  => sum  => :sum_radiance,
            :mean_radiance => mean => :mean_radiance,
            :n_pixels      => mean => :n_pixels)
end

function main()
    blds = load_buildings()
    viirs_y = load_viirs_annual()

    panel = if viirs_y === nothing
        @info "viirs_monthly.csv not found; panel will contain buildings only"
        blds
    else
        select!(blds, Not(:d_name))
        outerjoin(viirs_y, blds, on=[:pc11_s_id, :pc11_d_id, :year])
    end

    sort!(panel, [:pc11_s_id, :pc11_d_id, :year])
    mkpath(CLEAN_DIR)
    CSV.write(joinpath(CLEAN_DIR, "district_panel.csv"), panel)
    println("wrote ", nrow(panel), " rows to data/clean/district_panel.csv")
end

isinteractive() || main()
