// Districts-Of-India dashboard.
//
// Loads:
//   data/districts_simplified.geojson   (required)
//   data/district_panel.csv             (required; at minimum has BV columns)
//   data/viirs_monthly.csv              (optional; absent until VIIRS pipeline runs)
//
// All paths are relative to docs/index.html so GitHub Pages serves them
// from /docs without rewriting.

const DATA = {
  geo:     "data/districts_simplified.geojson",
  bv:      "data/bv_annual.csv",       // annual building volume
  monthly: "data/viirs_monthly.csv",   // monthly VIIRS NTL
};

const status = document.getElementById("status");

// ---- design tokens for charts (XKDR palette) ----
const FONT = { family: "Montserrat, system-ui, sans-serif", size: 12, color: "#1a1a1a" };
const BG   = "rgba(0,0,0,0)";
const PLOT_CFG = { responsive: true, displaylogo: false,
                   modeBarButtonsToRemove: ["lasso2d", "select2d"] };
const COLOR = "#f57d6a";           // XKDR coral
const COLOR_DARK = "#1a1a1a";      // XKDR black for outlines / axes

// Sequential colorscales that play with the coral accent. Plotly accepts
// either named scales or [[t,color],...] arrays.
const CMAP_VOL = [
  [0.0, "#fdf3ef"], [0.25, "#fad1c5"], [0.5,  "#f5a48f"],
  [0.75, "#e16a51"], [1.0, "#7a2417"],
];
const CMAP_NTL = [
  [0.0, "#fffaec"], [0.25, "#ffd58a"], [0.5,  "#ff9846"],
  [0.75, "#d34a17"], [1.0, "#1a0d09"],
];

function baseLayout(title) {
  return {
    title: { text: title, font: { ...FONT, size: 14, color: COLOR_DARK } },
    margin: { l: 60, r: 16, t: 36, b: 40 },
    paper_bgcolor: BG,
    plot_bgcolor: BG,
    font: FONT,
    xaxis: { gridcolor: "#eee9e4", zerolinecolor: "#dfd7cf",
             linecolor: COLOR_DARK, ticks: "outside", tickcolor: COLOR_DARK },
    yaxis: { gridcolor: "#eee9e4", zerolinecolor: "#dfd7cf",
             linecolor: COLOR_DARK, ticks: "outside", tickcolor: COLOR_DARK },
    legend: { font: { ...FONT, size: 11 } },
  };
}

function setStatus(msg, isError = false) {
  status.textContent = msg;
  status.classList.toggle("error", isError);
}

async function fetchText(path, optional = false) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) {
    if (optional) return null;
    throw new Error(`fetch ${path} → HTTP ${res.status}`);
  }
  return res.text();
}

function parseCSV(text) {
  const r = Papa.parse(text, { header: true, dynamicTyping: true,
                                skipEmptyLines: true });
  if (r.errors && r.errors.length) console.warn("CSV parse errors", r.errors);
  return r.data;
}

// Roll monthly NTL up to annual sums per district (only count months with
// valid n_pixels > 0). Returns Map<`${pc11_d_id}|${year}`, {sum, mean, n}>.
function aggregateMonthlyToAnnual(monthly) {
  if (!monthly) return new Map();
  const acc = new Map();
  for (const r of monthly) {
    if (r.sum_radiance == null || r.year == null) continue;
    const key = `${r.pc11_d_id}|${r.year}`;
    const e = acc.get(key) || { sum: 0, meanAcc: 0, n: 0 };
    e.sum += r.sum_radiance;
    if (r.mean_radiance != null) { e.meanAcc += r.mean_radiance; e.n += 1; }
    acc.set(key, e);
  }
  return acc;
}

// Outer-join BV annual rows with the rolled-up NTL annual sums.
function buildAnnualPanel(bvRows, monthly) {
  const ntlByKey = aggregateMonthlyToAnnual(monthly);
  const out = [];

  // Seed from BV rows.
  const seen = new Set();
  for (const r of bvRows) {
    const key = `${r.pc11_d_id}|${r.year}`;
    seen.add(key);
    const ntl = ntlByKey.get(key);
    out.push({
      pc11_s_id: r.pc11_s_id,
      pc11_d_id: r.pc11_d_id,
      d_name: r.d_name,
      year: r.year,
      footprint_m2: r.footprint_m2,
      volume_m3: r.volume_m3,
      mean_height_m: r.mean_height_m,
      sum_radiance:  ntl ? ntl.sum                                  : null,
      mean_radiance: ntl && ntl.n ? ntl.meanAcc / ntl.n             : null,
    });
  }

  // Add NTL-only district-years (no BV that year).
  if (monthly) {
    // Build a quick (id → name/state) lookup from monthly so the row carries
    // a district name even when no BV row exists yet.
    const byId = new Map();
    for (const r of monthly) {
      if (!byId.has(r.pc11_d_id)) {
        byId.set(r.pc11_d_id, { d_name: r.d_name, pc11_s_id: r.pc11_s_id });
      }
    }
    for (const [key, ntl] of ntlByKey) {
      if (seen.has(key)) continue;
      const [pc11_d_id, yearStr] = key.split("|");
      const meta = byId.get(pc11_d_id) || {};
      out.push({
        pc11_s_id: meta.pc11_s_id || "",
        pc11_d_id,
        d_name: meta.d_name || "",
        year: Number(yearStr),
        volume_m3: null, footprint_m2: null, mean_height_m: null,
        sum_radiance:  ntl.sum,
        mean_radiance: ntl.n ? ntl.meanAcc / ntl.n : null,
      });
    }
  }
  return out;
}

function hasMetric(rows, col) {
  return rows.length > 0 && col in rows[0] &&
         rows.some(r => r[col] != null && !Number.isNaN(r[col]));
}

function uniq(arr) { return Array.from(new Set(arr)); }

function maxYear(rows, col) {
  return Math.max(...rows.filter(r => r[col] != null).map(r => r.year));
}

// ----------------------------------------------------------------------------
// Charts
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------
// District detail panel
// ----------------------------------------------------------------------------

// Builds a Map<pc11_d_id, {name, state, panelRows[], monthlyRows[]}>.
function buildDistrictIndex(panel, monthly) {
  const idx = new Map();
  for (const r of panel) {
    if (!r.pc11_d_id) continue;
    let e = idx.get(r.pc11_d_id);
    if (!e) {
      e = { id: r.pc11_d_id, state: r.pc11_s_id,
            name: r.d_name || `district ${r.pc11_d_id}`,
            panel: [], monthly: [] };
      idx.set(r.pc11_d_id, e);
    }
    e.panel.push(r);
    if (r.d_name && !e.name.startsWith("district ")) e.name = r.d_name;
  }
  if (monthly) {
    for (const r of monthly) {
      const e = idx.get(r.pc11_d_id);
      if (e) e.monthly.push(r);
    }
  }
  return idx;
}

function populateSearch(districtIndex) {
  const dl = document.getElementById("district-list");
  const opts = Array.from(districtIndex.values())
    .filter(d => !d.name.startsWith("district "))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(d => `<option value="${d.name}  ·  ${stateName(d.state)}"></option>`);
  dl.innerHTML = opts.join("");
}

function renderDetail(d) {
  document.getElementById("detail-subtitle").textContent =
    `${d.name} · ${stateName(d.state)} · pc11_d_id ${d.id}`;
  document.getElementById("detail-charts").hidden = false;
  document.getElementById("detail-clear").hidden = false;

  // Building volume (annual)
  const bvRows = d.panel.filter(r => r.volume_m3 != null)
                        .sort((a, b) => a.year - b.year);
  if (bvRows.length) {
    Plotly.newPlot("detail-bv", [{
      type: "scatter", mode: "lines+markers",
      x: bvRows.map(r => r.year),
      y: bvRows.map(r => r.volume_m3),
      line: { color: COLOR, width: 2 },
      marker: { size: 7, color: COLOR },
      hovertemplate: "%{x}<br>%{y:,.0f} m³<extra></extra>",
    }], Object.assign(baseLayout(`Building volume — ${d.name}`), {
      height: 340,
      xaxis: Object.assign(baseLayout("").xaxis,
                           { title: { text: "Year" }, dtick: 1 }),
      yaxis: Object.assign(baseLayout("").yaxis,
                           { title: { text: "Volume (m³)" } }),
    }), PLOT_CFG);
  } else {
    Plotly.purge("detail-bv");
    document.getElementById("detail-bv").innerHTML =
      "<p style='color:var(--muted);font-family:var(--font-serif);font-style:italic'>" +
      "No building-volume data for this district.</p>";
  }

  // NTL (monthly)
  const ntlRows = d.monthly.filter(r => r.sum_radiance != null)
                           .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (ntlRows.length) {
    Plotly.newPlot("detail-ntl", [{
      type: "scatter", mode: "lines",
      x: ntlRows.map(r => r.date),
      y: ntlRows.map(r => r.sum_radiance),
      line: { color: COLOR_DARK, width: 1.2 },
      hovertemplate: "%{x|%Y-%m}<br>%{y:,.0f}<extra></extra>",
    }], Object.assign(baseLayout(`Monthly NTL — ${d.name}`), {
      height: 340,
      xaxis: Object.assign(baseLayout("").xaxis,
                           { title: { text: "Month" } }),
      yaxis: Object.assign(baseLayout("").yaxis,
                           { title: { text: "Sum radiance (nW/cm²/sr)" } }),
    }), PLOT_CFG);
  } else {
    Plotly.purge("detail-ntl");
    document.getElementById("detail-ntl").innerHTML =
      "<p style='color:var(--muted);font-family:var(--font-serif);font-style:italic'>" +
      "No VIIRS NTL data yet — run <code>make viirs</code> to populate.</p>";
  }

  document.getElementById("detail").scrollIntoView({ behavior: "smooth",
                                                     block: "start" });
}

function clearDetail() {
  document.getElementById("detail-subtitle").textContent =
    "Pick a district from the map or search";
  document.getElementById("detail-charts").hidden = true;
  document.getElementById("detail-clear").hidden = true;
  Plotly.purge("detail-bv");
  Plotly.purge("detail-ntl");
}

function wireDetail(districtIndex) {
  populateSearch(districtIndex);

  // Build a fast name → district lookup (case-insensitive). Also matches the
  // exact "Name  ·  state/id" datalist entry the user just picked.
  const byKey = new Map();
  for (const d of districtIndex.values()) {
    byKey.set(d.name.toLowerCase(), d);
    byKey.set(`${d.name.toLowerCase()}  ·  ${stateName(d.state).toLowerCase()}`, d);
  }

  const input = document.getElementById("district-search");
  const pick = () => {
    const v = input.value.trim().toLowerCase();
    if (!v) return;
    const d = byKey.get(v);
    if (d) renderDetail(d);
  };
  input.addEventListener("change", pick);
  input.addEventListener("keydown", e => { if (e.key === "Enter") pick(); });

  document.getElementById("detail-clear").addEventListener("click", () => {
    input.value = "";
    clearDetail();
  });
}

function wireMapClicks(districtIndex) {
  const handler = ev => {
    const pt = ev && ev.points && ev.points[0];
    if (!pt) return;
    const d = districtIndex.get(String(pt.location));
    if (d) {
      const input = document.getElementById("district-search");
      if (input) input.value = `${d.name}  ·  ${d.state}/${d.id}`;
      renderDetail(d);
    }
  };
  for (const id of ["bv-map", "ntl-map"]) {
    const el = document.getElementById(id);
    if (el && el.on) el.on("plotly_click", handler);
  }
}

function choropleth(divId, panel, geo, metric, label, year, cmap) {
  const sub = panel.filter(r => r.year === year && r[metric] != null);
  const trace = {
    type: "choroplethmapbox",
    geojson: geo,
    locations: sub.map(r => String(r.pc11_d_id)),
    z: sub.map(r => r[metric]),
    featureidkey: "properties.pc11_d_id",
    colorscale: cmap,
    text: sub.map(r => `<b>${r.d_name || "—"}</b><br>${stateName(r.pc11_s_id)}`),
    hovertemplate: "%{text}<br>" + label + ": %{z:,.0f}<extra></extra>",
    marker: { line: { width: 0.3, color: "rgba(15,23,42,0.35)" } },
    colorbar: { title: { text: label, font: { ...FONT, size: 11 } },
                tickfont: { ...FONT, size: 10 },
                thickness: 10, len: 0.7, x: 1, xpad: 4 },
  };
  Plotly.newPlot(divId, [trace], {
    mapbox: { style: "carto-positron", center: { lat: 22, lon: 80 }, zoom: 3.3 },
    margin: { l: 0, r: 0, t: 8, b: 0 },
    paper_bgcolor: BG,
    height: 480,
    font: FONT,
  }, PLOT_CFG);
}

function topN(divId, panel, metric, label, year, n = 20) {
  const sub = panel
    .filter(r => r.year === year && r[metric] != null)
    .sort((a, b) => b[metric] - a[metric])
    .slice(0, n)
    .reverse();
  const trace = {
    type: "bar",
    orientation: "h",
    x: sub.map(r => r[metric]),
    y: sub.map(r => r.d_name || `district ${r.pc11_d_id}`),
    text: sub.map(r => stateName(r.pc11_s_id)),
    hovertemplate: "<b>%{y}</b> · %{text}<br>" + label + ": %{x:,.0f}<extra></extra>",
    marker: { color: COLOR },
  };
  const L = baseLayout(`Top ${n} districts — ${label}`);
  L.margin.l = 140;
  L.xaxis.title = { text: label };
  L.yaxis.automargin = true;
  L.height = 480;
  Plotly.newPlot(divId, [trace], L, PLOT_CFG);
}

// Custom legend interaction: click isolates / re-adds. Wired into stateTrend.
//   - click on a visible series among many → hide the others (isolate)
//   - click on a hidden series              → show it too (additive)
//   - click on the sole visible series      → restore all
// We let Plotly handle double-click ourselves so the default "show-all" works.
function attachSmartLegend(divId) {
  const el = document.getElementById(divId);
  if (!el || !el.on) return;
  const visible = t => t.visible !== "legendonly" && t.visible !== false;

  el.on("plotly_legendclick", ev => {
    const data = ev.data;
    const i = ev.curveNumber;
    const cur = data[i];
    const nVisible = data.filter(visible).length;

    if (visible(cur) && nVisible > 1) {
      Plotly.restyle(el, { visible: data.map((_, j) => j === i ? true : "legendonly") });
      return false;
    }
    if (visible(cur) && nVisible === 1) {
      Plotly.restyle(el, { visible: data.map(_ => true) });
      return false;
    }
    // Hidden series — let Plotly's default toggle add it back.
    return true;
  });
}

// Generic per-state trend renderer. The caller supplies a row source plus
// which fields encode the x/y values, the labels, and how to format x in the
// hover tooltip.
function stateTrend(divId, rows, opts) {
  const { xField, yField, title, xTitle, yTitle, hoverX = "", mode = "lines" } = opts;

  const byKey = new Map();   // `${state}\t${xValue}` → summed y
  for (const r of rows) {
    if (r[yField] == null || r.pc11_s_id == null) continue;
    const k = `${r.pc11_s_id}\t${r[xField]}`;
    byKey.set(k, (byKey.get(k) || 0) + r[yField]);
  }

  const states = uniq(rows.map(r => r.pc11_s_id))
    .filter(Boolean)
    .sort((a, b) => stateName(a).localeCompare(stateName(b)));

  const traces = states.map(s => {
    const xs = [], ys = [];
    for (const [k, v] of byKey) {
      const [sid, x] = k.split("\t");
      if (sid === s) { xs.push(x); ys.push(v); }
    }
    const order = xs.map((_, i) => i)
      .sort((a, b) => String(xs[a]).localeCompare(String(xs[b])));
    const sn = stateName(s);
    return {
      type: "scatter", mode,
      name: sn,
      x: order.map(i => xs[i]),
      y: order.map(i => ys[i]),
      line: { width: 1.2 },
      marker: { size: 5 },
      hovertemplate: `${sn}<br>%{x${hoverX}}<br>%{y:,.0f}<extra></extra>`,
    };
  });

  const L = baseLayout(title);
  L.xaxis.title = { text: xTitle };
  L.yaxis.title = { text: yTitle };
  L.height = 460;
  // A palette anchored on the XKDR coral, with complementary muted hues.
  L.colorway = ["#f57d6a","#1a1a1a","#7a7a7a","#e0654f","#3a3a3a","#b9534a",
                "#5c5c5c","#f5a48f","#262626","#9e3f2f","#878787","#c4c4c4"];
  Plotly.newPlot(divId, traces, L, PLOT_CFG).then(() => attachSmartLegend(divId));
}

function ntlStateTrend(divId, monthly) {
  stateTrend(divId, monthly, {
    xField: "date", yField: "sum_radiance",
    title: "Monthly VIIRS NTL — sum radiance by state",
    xTitle: "Month", yTitle: "Sum radiance (nW/cm²/sr)",
    hoverX: "|%Y-%m", mode: "lines",
  });
}

function bvStateTrend(divId, bvRows) {
  stateTrend(divId, bvRows, {
    xField: "year", yField: "volume_m3",
    title: "Annual building volume — sum by state",
    xTitle: "Year", yTitle: "Volume (m³)",
    mode: "lines+markers",
  });
}

function scatterBvNtl(divId, panel, year) {
  const sub = panel.filter(r => r.year === year
                             && r.sum_radiance != null
                             && r.volume_m3 != null);
  const trace = {
    type: "scatter", mode: "markers",
    x: sub.map(r => r.volume_m3),
    y: sub.map(r => r.sum_radiance),
    text: sub.map(r => `<b>${r.d_name || "—"}</b><br>${stateName(r.pc11_s_id)}`),
    hovertemplate: "%{text}<br>vol: %{x:,.0f} m³<br>NTL: %{y:,.0f}<extra></extra>",
    marker: { size: 6, opacity: 0.55, color: COLOR,
              line: { width: 0.3, color: "rgba(15,23,42,0.4)" } },
  };
  const L = baseLayout(`Building volume vs. NTL — ${year}`);
  L.xaxis = { ...L.xaxis, type: "log", title: { text: "Building volume (m³)" } };
  L.yaxis = { ...L.yaxis, type: "log", title: { text: "NTL sum radiance" } };
  L.height = 460;
  Plotly.newPlot(divId, [trace], L, PLOT_CFG);
}

// ----------------------------------------------------------------------------
// Section visibility + year selector
// ----------------------------------------------------------------------------

// Candidate downloads. Anything not present (HEAD → !ok) is skipped.
const DOWNLOAD_CANDIDATES = [
  ["data/bv_annual.csv",                "Annual building-volume panel — one row per (district, year)"],
  ["data/viirs_monthly.csv",            "Monthly VIIRS NTL — one row per (district, month), cleaned via NighttimeLights.jl"],
  ["data/districts_simplified.geojson", "SHRUG district polygons (simplified)"],
];

async function populateDownloads() {
  const ul = document.getElementById("downloads");
  const sect = document.getElementById("downloads-section");
  const checks = await Promise.all(
    DOWNLOAD_CANDIDATES.map(async ([href, label]) => {
      try {
        const r = await fetch(href, { method: "HEAD" });
        return r.ok ? { href, label, size: r.headers.get("Content-Length") }
                    : null;
      } catch { return null; }
    })
  );
  const present = checks.filter(Boolean);
  if (!present.length) return;
  sect.hidden = false;
  const fmtSize = b => {
    if (!b) return "";
    const n = Number(b);
    return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB`
                            : `${(n / 1024).toFixed(0)} KB`;
  };
  ul.innerHTML = present.map(({ href, label, size }) => {
    const name = href.split("/").pop();
    return `<li>
      <a href="${href}" download>${name}</a>
      <span class="desc">${label}</span>
      <span class="size">${fmtSize(size)}</span>
    </li>`;
  }).join("");
}

function showSections({ haveBv, haveNtl }) {
  for (const el of document.querySelectorAll("[data-needs]")) {
    const needs = el.dataset.needs.split(" ");
    const visible = needs.some(req => {
      if (req === "bv")     return haveBv;
      if (req === "ntl")    return haveNtl;
      if (req === "bv+ntl") return haveBv && haveNtl;
      return false;
    });
    if (el.tagName === "SECTION") {
      el.hidden = !visible;
    } else if (!visible) {
      el.style.display = "none";
    }
  }
}

const DEFAULT_YEAR = 2023;
function populateYearSelect(panel, haveBv, haveNtl) {
  const years = uniq(panel
    .filter(r => (haveBv && r.volume_m3 != null) ||
                 (haveNtl && r.sum_radiance != null))
    .map(r => r.year)).sort((a, b) => a - b);
  const def = years.includes(DEFAULT_YEAR) ? DEFAULT_YEAR : years[years.length - 1];
  for (const sel of document.querySelectorAll('[data-control="year"]')) {
    sel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join("");
    sel.value = def;
  }
  return def;
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------

// Normalise ids: drop leading zeros so GeoJSON ('094') and CSV (94) match.
const normId = v => v == null || v === "" ? "" : String(Number(v));

// PC11 2011 Census state codes → official names. Keyed by normalised id
// (leading zeros stripped) so it matches whatever the CSV / GeoJSON produce.
const PC11_STATES = {
  "1":  "Jammu & Kashmir",
  "2":  "Himachal Pradesh",
  "3":  "Punjab",
  "4":  "Chandigarh",
  "5":  "Uttarakhand",
  "6":  "Haryana",
  "7":  "NCT of Delhi",
  "8":  "Rajasthan",
  "9":  "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "25": "Daman & Diu",
  "26": "Dadra & Nagar Haveli",
  "27": "Maharashtra",
  "28": "Andhra Pradesh",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman & Nicobar Is.",
};
const stateName = id => PC11_STATES[String(id)] || `state ${id}`;

async function main() {
  if (typeof Plotly === "undefined" || typeof Papa === "undefined") {
    setStatus("Plotly or PapaParse failed to load from CDN. Check network / ad-blocker.", true);
    return;
  }

  let geoText, bvText, monthlyText;
  try {
    [geoText, bvText, monthlyText] = await Promise.all([
      fetchText(DATA.geo),
      fetchText(DATA.bv, /* optional */ true),
      fetchText(DATA.monthly, /* optional */ true),
    ]);
  } catch (e) {
    setStatus(`Failed to load data: ${e.message}`, true);
    throw e;
  }

  const geo = JSON.parse(geoText);
  for (const f of geo.features) {
    f.properties.pc11_d_id = normId(f.properties.pc11_d_id);
    f.properties.pc11_s_id = normId(f.properties.pc11_s_id);
  }

  const bvRows = bvText ? parseCSV(bvText).map(r => ({
    ...r, pc11_d_id: normId(r.pc11_d_id), pc11_s_id: normId(r.pc11_s_id),
  })) : [];

  const monthly = monthlyText
    ? parseCSV(monthlyText).map(r => ({
        ...r, pc11_d_id: normId(r.pc11_d_id), pc11_s_id: normId(r.pc11_s_id),
      }))
    : null;

  // Annual panel: BV rows ⨝ (monthly NTL rolled to year). One row per
  // (district, year) with whichever metrics exist.
  const panel = buildAnnualPanel(bvRows, monthly);

  const haveBv  = hasMetric(panel, "volume_m3");
  const haveNtl = hasMetric(panel, "sum_radiance");

  if (!haveBv && !haveNtl) {
    setStatus("Panel CSV is present but has no usable metrics yet — run the pipeline.", true);
    return;
  }

  const parts = [];
  if (haveBv)  parts.push("Building volume");
  if (haveNtl) parts.push("VIIRS NTL");
  setStatus(`${panel.length.toLocaleString()} district-years · ${parts.join(" + ")}`);
  showSections({ haveBv, haveNtl });

  const initYear = populateYearSelect(panel, haveBv, haveNtl);

  function render(year) {
    const tag = document.getElementById("year-tag");
    if (tag) tag.textContent = year;
    if (haveBv) {
      choropleth("bv-map", panel, geo, "volume_m3",
                 "Building volume (m³)", year, CMAP_VOL);
      topN("bv-top", panel, "volume_m3", "Building volume (m³)", year);
    }
    if (haveNtl) {
      choropleth("ntl-map", panel, geo, "sum_radiance",
                 "NTL sum radiance", year, CMAP_NTL);
      topN("ntl-top", panel, "sum_radiance", "NTL sum radiance", year);
    }
    if (haveBv && haveNtl) scatterBvNtl("scatter", panel, year);
  }
  render(initYear);

  // Trend by state: selector picks BV or NTL.
  const trendSel = document.querySelector('[data-control="trend-metric"]');
  if (trendSel) {
    // Hide options whose data isn't present.
    for (const opt of trendSel.querySelectorAll("option")) {
      const need = opt.dataset.needs;
      if ((need === "ntl" && !(haveNtl && monthly)) ||
          (need === "bv"  && !(haveBv  && bvRows.length))) {
        opt.disabled = true;
        opt.hidden   = true;
      }
    }
    // Pick the first non-disabled option as the default.
    const firstOk = Array.from(trendSel.options).find(o => !o.disabled);
    if (firstOk) trendSel.value = firstOk.value;

    const renderTrend = () => {
      if (trendSel.value === "ntl" && haveNtl && monthly) {
        ntlStateTrend("trend-chart", monthly);
      } else if (trendSel.value === "bv" && haveBv && bvRows.length) {
        bvStateTrend("trend-chart", bvRows);
      }
    };
    renderTrend();
    trendSel.addEventListener("change", renderTrend);
  }

  for (const sel of document.querySelectorAll('[data-control="year"]')) {
    sel.addEventListener("change", () => render(Number(sel.value)));
  }

  // District detail (search + click-from-map).
  const districtIndex = buildDistrictIndex(panel, monthly);
  wireDetail(districtIndex);
  // Map click handlers must be attached after the choropleths are drawn.
  wireMapClicks(districtIndex);
}

// Downloads section is independent of the chart pipeline — populate it even
// if the data-fetch / render path errors.
populateDownloads().catch(err => console.warn("downloads probe failed:", err));

main().catch(err => {
  console.error(err);
  setStatus(`Error: ${err.message}`, true);
});

window.addEventListener("error", e => {
  setStatus(`Error: ${e.message}`, true);
});
