#!/usr/bin/env julia
# Per-district VIIRS cleaning + zonal sum.
#
# For each district:
#   1. read_district(d)           load (rad, cf) cubes for the district bbox
#                                 (see read_district.jl).
#   2. clean_complete(rad, cf)    PSTT2021 pipeline.
#   3. mask(...; with=d.geom)     confine to polygon.
#   4. Sum per (district, month).
#
# Threaded across districts. Each thread holds at most one district's bbox of
# the cube, so the working set stays bounded regardless of district size.
#
# Inputs:
#   /mnt/giant-disk/ntl/sl/{rad,cf}/   SL monthly TIFs (override with env vars)
#   data/clean/districts.geojson       produced by `make boundaries`
#
# Tunables (env vars):
#   DOI_RAD_PATH   / DOI_CF_PATH    default /mnt/giant-disk/ntl/sl/{rad,cf}/
#   DOI_START_YEAR / DOI_END_YEAR   default 2014 / 2025
#
# Output:
#   data/clean/viirs_monthly.csv

using CSV
using DataFrames
using Dates
using Logging
using Rasters
using NighttimeLights

include("read_district.jl")   # DistrictRow, load_districts, read_district

const ROOT       = joinpath(@__DIR__, "..")
const CLEAN_DIR  = joinpath(ROOT, "data", "clean")

const RAD_PATH   = get(ENV, "DOI_RAD_PATH", "/mnt/giant-disk/ntl/sl/rad/")
const CF_PATH    = get(ENV, "DOI_CF_PATH",  "/mnt/giant-disk/ntl/sl/cf/")
const START_DATE = Date(parse(Int, get(ENV, "DOI_START_YEAR", "2014")), 1)
const END_DATE   = Date(parse(Int, get(ENV, "DOI_END_YEAR",   "2025")), 12)

# ---------------------------------------------------------------------------
# Per-district processing
# ---------------------------------------------------------------------------

function process_district(d::DistrictRow)
    rad, cf = read_district(d;
                            start_date = START_DATE, end_date = END_DATE,
                            rad_path   = RAD_PATH,   cf_path  = CF_PATH)
    # NighttimeLights internally emits a per-call `@warn` with full backtrace
    # when outlier_variance fails on small/noisy cubes — silence it.
    cleaned = with_logger(NullLogger()) do
        clean_complete(rad, cf)
    end
    cf = nothing
    cleaned = mask(cleaned; with=d.geom)

    ts = collect(dims(cleaned, Ti))
    rows = Vector{NamedTuple}(undef, length(ts))
    for (k, t) in enumerate(ts)
        sl = view(cleaned, Ti=At(t))
        n  = count(!ismissing, sl)
        if n == 0
            rows[k] = (pc11_s_id=d.pc11_s_id, pc11_d_id=d.pc11_d_id,
                       d_name=d.d_name,
                       year=year(t), month=month(t), date=Date(t),
                       sum_radiance=missing, mean_radiance=missing, n_pixels=0)
        else
            s = sum(skipmissing(sl))
            rows[k] = (pc11_s_id=d.pc11_s_id, pc11_d_id=d.pc11_d_id,
                       d_name=d.d_name,
                       year=year(t), month=month(t), date=Date(t),
                       sum_radiance=s, mean_radiance=s/n, n_pixels=n)
        end
    end
    rows
end

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

function main()
    println("rad: $RAD_PATH")
    println("cf : $CF_PATH")
    println("dates: $START_DATE → $END_DATE")
    println("threads: $(Threads.nthreads())")

    districts = load_districts(joinpath(CLEAN_DIR, "districts.geojson"))
    println("districts: $(length(districts))")

    chunks = Vector{Vector{NamedTuple}}(undef, length(districts))
    done = Threads.Atomic{Int}(0)

    Threads.@threads :static for i in eachindex(districts)
        d = districts[i]
        chunks[i] = try
            process_district(d)
        catch e
            # `$e` would dump full Raster + Ti date array on some exceptions —
            # `showerror` keeps it to one clean line.
            msg = first(split(sprint(showerror, e), '\n'))
            @warn "skip district $(d.pc11_d_id) ($(d.d_name)): $msg"
            NamedTuple[]
        end
        c = Threads.atomic_add!(done, 1) + 1
        c % 25 == 0 && println("  $c/$(length(districts))")
        GC.gc()
    end

    df = DataFrame(reduce(vcat, chunks))
    sort!(df, [:pc11_s_id, :pc11_d_id, :year, :month])
    mkpath(CLEAN_DIR)
    out = joinpath(CLEAN_DIR, "viirs_monthly.csv")
    CSV.write(out, df)
    println("wrote $(nrow(df)) rows → $out")
end

isinteractive() || main()
