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
VIIRS_START   ?= 2014
VIIRS_END     ?= 2025

PY            := python3
JULIA         := julia --project=julia --threads=8

RAW_DIR       := data/raw
CLEAN_DIR     := data/clean
DASH_DATA     := docs/data
BV_CSVS       := $(wildcard $(RAW_DIR)/buildings_*.csv)

.PHONY: all boundaries export-bv export-viirs tasks julia-deps viirs panel dashboard serve clean help

help:
	@awk 'BEGIN{FS=":.*##"} /^[a-z][a-zA-Z0-9_-]+:.*##/{printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

all: boundaries panel dashboard  ## boundaries → panel → dashboard

boundaries: $(CLEAN_DIR)/districts.geojson  ## SHRUG shapefile → GeoJSONs

$(CLEAN_DIR)/districts.geojson: data/boundaries/district.shp julia/prepare_boundaries.jl
	$(JULIA) julia/prepare_boundaries.jl

julia-deps:  ## Instantiate the Julia env (use local NighttimeLights.jl)
	$(JULIA) -e 'using Pkg; Pkg.develop(path="$(NTL_PATH)"); Pkg.instantiate()'

export-bv: $(GEOJSON)  ## Queue building-volume tasks on GEE
	$(PY) gee/extract_building_volume.py \
	    --project $(PROJECT) --geojson $(GEOJSON) \
	    --start $(BV_START) --end $(BV_END)

export-viirs: $(GEOJSON)  ## Queue monthly VIIRS per-district reductions on GEE
	$(PY) gee/extract_viirs_monthly.py \
	    --project $(PROJECT) --geojson $(GEOJSON) \
	    --start $(VIIRS_START) --end $(VIIRS_END)

tasks:  ## List current GEE task status
	earthengine task list | head -30

# `clean_viirs.jl` now just concatenates the GEE per-year CSVs in data/raw/.
viirs: $(CLEAN_DIR)/viirs_monthly.csv  ## Concatenate per-year GEE VIIRS CSVs

VIIRS_RAW := $(wildcard $(RAW_DIR)/viirs_monthly_*.csv)
$(CLEAN_DIR)/viirs_monthly.csv: julia/clean_viirs.jl $(VIIRS_RAW)
	$(JULIA) julia/clean_viirs.jl

panel: $(CLEAN_DIR)/district_panel.csv  ## Merge VIIRS (if present) + buildings → district_panel.csv

# `merge_panel.jl` itself decides whether to include VIIRS based on whether
# viirs_monthly.csv exists, so don't force-build it here.
$(CLEAN_DIR)/district_panel.csv: julia/merge_panel.jl $(BV_CSVS)
	$(JULIA) julia/merge_panel.jl

dashboard: $(DASH_DATA)/districts_simplified.geojson \
           $(DASH_DATA)/district_panel.csv  ## Stage data into docs/data/

$(DASH_DATA)/districts_simplified.geojson: $(CLEAN_DIR)/districts_simplified.geojson
	@mkdir -p $(DASH_DATA)
	cp $< $@

$(DASH_DATA)/district_panel.csv: $(CLEAN_DIR)/district_panel.csv
	@mkdir -p $(DASH_DATA)
	cp $< $@
	@if [ -f $(CLEAN_DIR)/viirs_monthly.csv ]; then \
	    cp $(CLEAN_DIR)/viirs_monthly.csv $(DASH_DATA)/viirs_monthly.csv; \
	fi
	@for f in $(BV_CSVS); do cp "$$f" $(DASH_DATA)/; done

serve: dashboard  ## Local preview at http://localhost:8080/
	$(PY) -m http.server --directory docs 8080

clean:  ## Remove cleaned outputs and staged dashboard data
	rm -f $(CLEAN_DIR)/*.csv $(CLEAN_DIR)/*.geojson
	rm -rf $(DASH_DATA)
