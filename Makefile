# Districts-Of-India build orchestration.
#
# Common entry points:
#   make boundaries        — shapefile → districts.geojson + districts_simplified.geojson
#   make export-bv         — queue building-volume tasks on GEE
#   make export-viirs      — queue monthly-VIIRS raster tasks on GEE
#   make tasks             — list current GEE task status
#   make viirs             — run NighttimeLights.clean_complete + zonal aggregation
#   make panel             — merge cleaned VIIRS + raw buildings into district_panel.csv
#   make dashboard         — generate docs/index.html
#   make all               — boundaries → panel → dashboard (assumes raw CSVs already in place)
#   make clean             — remove cleaned outputs (raw GEE downloads kept)
#
# GEE-export targets queue tasks server-side; they DON'T block on completion.
# After they finish, copy the resulting files from Google Drive into:
#     data/raw/viirs/             (viirs_YYYY_MM.tif)
#     data/raw/                   (buildings_YYYY.csv)

PROJECT       ?= gee-ntl-470405
GEOJSON       ?= data/clean/districts_simplified.geojson
NTL_PATH      ?= ../NighttimeLights.jl

BV_START      ?= 2016
BV_END        ?= 2023

PY            := python3
JULIA         := julia --project=julia --threads=8

RAW_DIR       := data/raw
CLEAN_DIR     := data/clean
DASH_DATA     := docs/data
BV_CSVS       := $(wildcard $(RAW_DIR)/buildings_*.csv)

.PHONY: all boundaries export-bv tasks julia-deps viirs bv dashboard serve clean help

help:
	@awk 'BEGIN{FS=":.*##"} /^[a-z][a-zA-Z0-9_-]+:.*##/{printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

all: boundaries bv viirs dashboard  ## boundaries → bv + viirs → dashboard

boundaries: $(CLEAN_DIR)/districts.geojson  ## SHRUG shapefile → GeoJSONs

$(CLEAN_DIR)/districts.geojson: data/boundaries/district.shp julia/prepare_boundaries.jl
	$(JULIA) julia/prepare_boundaries.jl

julia-deps:  ## Instantiate the Julia env (use local NighttimeLights.jl)
	$(JULIA) -e 'using Pkg; Pkg.develop(path="$(NTL_PATH)"); Pkg.instantiate()'

export-bv: $(GEOJSON)  ## Queue building-volume tasks on GEE
	$(PY) gee/extract_building_volume.py \
	    --project $(PROJECT) --geojson $(GEOJSON) \
	    --start $(BV_START) --end $(BV_END)

tasks:  ## List current GEE task status
	earthengine task list | head -30

viirs: $(CLEAN_DIR)/viirs_monthly.csv  ## Per-district readnl + clean_complete + zonal sum (local SL TIFs)

$(CLEAN_DIR)/viirs_monthly.csv: julia/clean_viirs.jl julia/read_district.jl $(CLEAN_DIR)/districts.geojson
	$(JULIA) julia/clean_viirs.jl

bv: $(CLEAN_DIR)/bv_annual.csv  ## Concatenate per-year building CSVs → bv_annual.csv

$(CLEAN_DIR)/bv_annual.csv: julia/clean_buildings.jl $(BV_CSVS)
	$(JULIA) julia/clean_buildings.jl

dashboard: $(DASH_DATA)/districts_simplified.geojson \
           $(DASH_DATA)/bv_annual.csv \
           $(if $(wildcard $(CLEAN_DIR)/viirs_monthly.csv),$(DASH_DATA)/viirs_monthly.csv)  ## Stage data into docs/data/

$(DASH_DATA)/districts_simplified.geojson: $(CLEAN_DIR)/districts_simplified.geojson
	@mkdir -p $(DASH_DATA)
	cp $< $@

$(DASH_DATA)/bv_annual.csv: $(CLEAN_DIR)/bv_annual.csv
	@mkdir -p $(DASH_DATA)
	cp $< $@

$(DASH_DATA)/viirs_monthly.csv: $(CLEAN_DIR)/viirs_monthly.csv
	@mkdir -p $(DASH_DATA)
	cp $< $@

serve: dashboard  ## Local preview at http://localhost:8080/
	$(PY) -m http.server --directory docs 8080

clean:  ## Remove cleaned outputs and staged dashboard data
	rm -f $(CLEAN_DIR)/*.csv $(CLEAN_DIR)/*.geojson
	rm -rf $(DASH_DATA)
