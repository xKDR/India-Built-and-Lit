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
  geo: "data/districts_simplified.geojson",
  panel: "data/district_panel.csv",
  monthly: "data/viirs_monthly.csv",
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

function baseLayout(title) {
  return {
    title: { text: title, font: { ...FONT, size: 14 } },
    margin: { l: 60, r: 16, t: 36, b: 40 },
    paper_bgcolor: BG,
    plot_bgcolor: BG,
    font: FONT,
    xaxis: { gridcolor: "#eef0f4", zerolinecolor: "#e5e8ee" },
    yaxis: { gridcolor: "#eef0f4", zerolinecolor: "#e5e8ee" },
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

function choropleth(divId, panel, geo, metric, label, year, cmap) {
  const sub = panel.filter(r => r.year === year && r[metric] != null);
  const trace = {
    type: "choroplethmapbox",
    geojson: geo,
    locations: sub.map(r => String(r.pc11_d_id)),
    z: sub.map(r => r[metric]),
    featureidkey: "properties.pc11_d_id",
    colorscale: cmap,
    text: sub.map(r => `<b>${r.d_name || "—"}</b><br>state ${r.pc11_s_id}`),
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
    text: sub.map(r => `state ${r.pc11_s_id}`),
    hovertemplate: "<b>%{y}</b> (%{text})<br>" + label + ": %{x:,.0f}<extra></extra>",
    marker: { color: COLOR },
  };
  const L = baseLayout(`Top ${n} districts — ${label}`);
  L.margin.l = 140;
  L.xaxis.title = { text: label };
  L.yaxis.automargin = true;
  L.height = 480;
  Plotly.newPlot(divId, [trace], L, PLOT_CFG);
}

function ntlStateTrend(divId, monthly) {
  const byKey = new Map();
  for (const r of monthly) {
    if (r.sum_radiance == null) continue;
    const k = `${r.pc11_s_id}\t${r.date}`;
    byKey.set(k, (byKey.get(k) || 0) + r.sum_radiance);
  }
  const states = uniq(monthly.map(r => r.pc11_s_id)).sort((a, b) => a - b);
  const traces = states.map(s => {
    const xs = [], ys = [];
    for (const [k, v] of byKey) {
      const [sid, date] = k.split("\t");
      if (sid === s) { xs.push(date); ys.push(v); }
    }
    const order = xs.map((_, i) => i).sort((a, b) => xs[a].localeCompare(xs[b]));
    return {
      type: "scatter", mode: "lines",
      name: `state ${s}`,
      x: order.map(i => xs[i]),
      y: order.map(i => ys[i]),
      line: { width: 1.2 },
      hovertemplate: `state ${s}<br>%{x|%Y-%m}<br>%{y:,.0f}<extra></extra>`,
    };
  });
  const L = baseLayout("Monthly VIIRS NTL — sum radiance by state");
  L.xaxis.title = { text: "Month" };
  L.yaxis.title = { text: "Sum radiance (nW/cm²/sr)" };
  L.height = 460;
  // A palette anchored on the XKDR coral, with complementary muted hues.
  L.colorway = ["#f57d6a","#1a1a1a","#7a7a7a","#e0654f","#3a3a3a","#b9534a",
                "#5c5c5c","#f5a48f","#262626","#9e3f2f","#878787","#c4c4c4"];
  Plotly.newPlot(divId, traces, L, PLOT_CFG);
}

function scatterBvNtl(divId, panel, year) {
  const sub = panel.filter(r => r.year === year
                             && r.sum_radiance != null
                             && r.volume_m3 != null);
  const trace = {
    type: "scatter", mode: "markers",
    x: sub.map(r => r.volume_m3),
    y: sub.map(r => r.sum_radiance),
    text: sub.map(r => `<b>${r.d_name || "—"}</b><br>state ${r.pc11_s_id}`),
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
  ["data/district_panel.csv",           "District panel (annual; merged BV + NTL)"],
  ["data/viirs_monthly.csv",            "VIIRS monthly (cleaned via NighttimeLights.jl)"],
  ["data/districts_simplified.geojson", "SHRUG district polygons (simplified)"],
  // Per-year buildings CSVs:
  ...Array.from({ length: 2023 - 2016 + 1 },
                (_, i) => 2016 + i).map(y => [
    `data/buildings_${y}.csv`, `Building volume by district — ${y}`,
  ]),
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

function populateYearSelect(panel, haveBv, haveNtl) {
  const years = uniq(panel
    .filter(r => (haveBv && r.volume_m3 != null) ||
                 (haveNtl && r.sum_radiance != null))
    .map(r => r.year)).sort((a, b) => a - b);
  for (const sel of document.querySelectorAll('[data-control="year"]')) {
    sel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join("");
    sel.value = years[years.length - 1];
  }
  return years[years.length - 1];
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------

// Normalise ids: drop leading zeros so GeoJSON ('094') and CSV (94) match.
const normId = v => v == null || v === "" ? "" : String(Number(v));

async function main() {
  if (typeof Plotly === "undefined" || typeof Papa === "undefined") {
    setStatus("Plotly or PapaParse failed to load from CDN. Check network / ad-blocker.", true);
    return;
  }

  let geoText, panelText, monthlyText;
  try {
    [geoText, panelText, monthlyText] = await Promise.all([
      fetchText(DATA.geo),
      fetchText(DATA.panel),
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
  const panel = parseCSV(panelText).map(r => ({
    ...r, pc11_d_id: normId(r.pc11_d_id), pc11_s_id: normId(r.pc11_s_id),
  }));
  const monthly = monthlyText
    ? parseCSV(monthlyText).map(r => ({
        ...r, pc11_d_id: normId(r.pc11_d_id), pc11_s_id: normId(r.pc11_s_id),
      }))
    : null;

  const haveBv = hasMetric(panel, "volume_m3");
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
  if (haveNtl && monthly) ntlStateTrend("ntl-trend", monthly);

  for (const sel of document.querySelectorAll('[data-control="year"]')) {
    sel.addEventListener("change", () => render(Number(sel.value)));
  }

  populateDownloads();
}

main().catch(err => {
  console.error(err);
  setStatus(`Error: ${err.message}`, true);
});

window.addEventListener("error", e => {
  setStatus(`Error: ${e.message}`, true);
});
