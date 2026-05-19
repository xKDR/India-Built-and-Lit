# XKDR-style dashboard — implementation guide

This is a prompt-shaped specification for re-implementing the dashboard look
used by *India · Built & Lit* (xkdr.github.io/India-Built-and-Lit) in another
project. Hand this whole file to an LLM along with the target repo and it
should be able to produce a matching static dashboard.

The dashboard is **plain HTML + CSS + vanilla JS**, with Plotly.js and
PapaParse pulled from CDN. No framework. Data files (CSV + GeoJSON) live in
`docs/data/` and are fetched at runtime so GitHub Pages can serve everything
from `/docs`.

---

## 1. Brand identity

| Element | Value |
|---|---|
| Wordmark style | `BRAND <span class="dot">·</span> <span class="accent">SUBBRAND</span>` |
| Accent word | First letter capitalised, in coral (`--primary`) |
| Dot separator | Coral, bold, mid-baseline |
| Voice | Sober, academic; serif paragraphs for prose, sans for chrome |

When inventing a name, mirror "India · Built & Lit": one subject, dot, two
short adjectives or a phrase. Apply colour only to the right half.

---

## 2. Colour palette (CSS custom properties)

```css
:root {
  --primary:      #f57d6a;   /* XKDR coral — accent, chips, callouts */
  --primary-dark: #e0654f;   /* coral on hover */
  --secondary:    #000000;   /* text, lines, dark pills */
  --theme:        #f2f1f0;   /* warm off-white page background */
  --white:        #ffffff;   /* card surface */
  --fg:           #1a1a1a;   /* body text */
  --muted:        #6a6a6a;   /* secondary text */
  --line:         #e1ddd9;   /* hairline borders */
  --warn:         #b91c1c;   /* error states */
}
```

**Rules**

- Backgrounds: `--theme` for the page, `--white` for cards.
- Sharp edges everywhere (`--radius: 0`). XKDR's house style avoids pill /
  rounded corners.
- Single accent (`--primary`) — do not introduce additional brand colours.
  Series in line charts may use the **colorway** below; that's it.

**Plotly colorway** (for multi-series line charts; coral anchored):

```
["#f57d6a","#1a1a1a","#7a7a7a","#e0654f","#3a3a3a","#b9534a",
 "#5c5c5c","#f5a48f","#262626","#9e3f2f","#878787","#c4c4c4"]
```

**Sequential colorscales** (for choropleths; pre-defined to match the palette):

```js
// "cool" — uses coral as the warm end
const CMAP_VOL = [
  [0.0, "#fdf3ef"], [0.25, "#fad1c5"], [0.5,  "#f5a48f"],
  [0.75, "#e16a51"], [1.0, "#7a2417"],
];
// "hot" — yellow → coral → black, for NTL-like data
const CMAP_NTL = [
  [0.0, "#fffaec"], [0.25, "#ffd58a"], [0.5,  "#ff9846"],
  [0.75, "#d34a17"], [1.0, "#1a0d09"],
];
```

---

## 3. Typography

Pull both from Google Fonts in the `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet"
  href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&family=Merriweather:ital,wght@0,400;0,700;1,400&display=swap">
```

```css
:root {
  --font-sans:  "Montserrat", system-ui, -apple-system, BlinkMacSystemFont,
                "Segoe UI", Helvetica, Arial, sans-serif;
  --font-serif: "Merriweather", Georgia, serif;
  --font-mono:  ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
```

**Rules**

| Where | Family | Weight | Notes |
|---|---|---|---|
| H1 | sans | 800 | Uppercase, 44 px, `letter-spacing: -0.01em` |
| H2 | sans | 800 | Uppercase, 20 px, `letter-spacing: 0.02em`; black underline |
| H3 | sans | 700 | Title-case, 18 px |
| Body / paragraphs | serif | 400 | 15 px, line-height 1.65–1.75 |
| Chips / pills / tags | mono | 700 | Uppercase, 10–12 px, `letter-spacing: 0.06–0.1em` |
| Status pill | mono | 500 | Same as chips |
| Download links | mono | 600 | Coral |
| Citations | serif | 400 | 12.5 px |

Italics: prefer serif italic. Set `font-style: italic` directly; do not use
oblique synthetic italics.

---

## 4. Page skeleton

```html
<body>
<div class="page">

  <header class="hero">
    <h1>Subject <span class="dot">·</span> <span class="accent">Phrase</span></h1>
  </header>

  <section id="motivation">
    <h2>Why this thing?</h2>
    <p>One- to two-paragraph problem statement in Merriweather.</p>
  </section>

  <section id="primer">
    <div class="row">
      <div class="primer-card">
        <h3>Concept A <span class="stock">stock</span></h3>
        <p>What it measures + why it matters. Includes inline links to data
           sources and tools, opened in new tabs.</p>
      </div>
      <div class="primer-card">
        <h3>Concept B <span class="flow">flow</span></h3>
        <p>Same shape as A.</p>
      </div>
    </div>
    <p class="primer-foot"><i>Why both, together.</i></p>
  </section>

  <section id="status-section">
    <p id="status" class="status">Loading data…</p>
  </section>

  <!-- detail panel, choropleths, top-N, state trend, scatter, downloads -->

  <footer>
    <p class="cite-head">Cite this dataset:</p>
    <p class="cite-self">XKDR Forum (YEAR). <i>Dataset name</i>.</p>

    <p>Built from … (data sources, links).</p>

    <p class="cite-head">Selected XKDR work using X:</p>
    <ul class="cites"><li><a target="_blank" rel="noopener" href="…">Title</a> · XKDR Forum, Mon YYYY.</li></ul>
  </footer>

</div>
</body>
```

**Layout**

```css
.page {
  max-width: 1600px;
  margin: 0 auto;
  padding: 0 32px 80px;
}
@media (min-width: 1800px) {
  .page { padding-left: 64px; padding-right: 64px; }
}
```

**The hero**

```css
header.hero {
  padding: 56px 0 32px;
  border-bottom: 2px solid var(--secondary);
  margin-bottom: 40px;
}
header.hero h1 {
  margin: 0;
  font-family: var(--font-sans);
  font-weight: 800;
  font-size: 44px;
  line-height: 1.1;
  letter-spacing: -0.01em;
  color: var(--secondary);
  text-transform: uppercase;
}
header.hero h1 .accent { color: var(--primary); }
header.hero h1 .dot    { color: var(--primary); margin: 0 6px; font-weight: 800; }
```

---

## 5. Section pattern

Every section under `<main>`:

- Has an `<h2>` in uppercase Montserrat 800 with a single-pixel black
  bottom border.
- Inline year/state/etc. labels go in a `.year-tag` chip next to the H2.

```css
section { margin: 36px 0; }
section h2 {
  font-size: 17px;
  font-weight: 800;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  margin: 0 0 14px;
  display: flex; align-items: baseline; gap: 14px;
  color: var(--secondary);
  border-bottom: 1px solid var(--secondary);
  padding-bottom: 8px;
}
section h2 .year-tag {
  font-family: var(--font-serif);
  font-style: italic;
  font-weight: 400;
  font-size: 14px;
  letter-spacing: 0;
  text-transform: none;
  color: var(--primary);
}
```

**Cards** (any direct chart/panel container):

```css
.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}
@media (max-width: 1000px) { .row { grid-template-columns: 1fr; } }

.row > div,
section > div:not(.row):not(.controls):not(.year-tag) {
  background: var(--white);
  border: 1px solid var(--line);
  padding: 16px;
}
```

---

## 6. Status pill

The status line under the hero is a small, dark mono pill — not a generic
paragraph. Always visible.

```css
.status {
  display: inline-block;
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  background: var(--secondary);
  color: var(--theme);
  padding: 6px 14px;
  border: 0;
}
.status.error { background: var(--warn); color: var(--white); }
```

---

## 7. Controls (selects, search, buttons)

Inputs are sharp-edged, monospace-tinged, with the coral focus ring.

```css
.controls select,
.detail-controls input[type="search"] {
  font: inherit;
  border: 1px solid var(--secondary);
  background: var(--white);
  color: var(--secondary);
  padding: 5px 10px;        /* select */
  border-radius: 0;
}
:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }

button {
  font-family: var(--font-sans);
  font-weight: 600;
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 8px 14px;
  background: var(--secondary);
  color: var(--theme);
  border: 0;
}
button:hover { background: var(--primary); }
```

**Search-with-suggestions** is just a native `<input type="search" list>` +
`<datalist>` — no third-party autocomplete library.

---

## 8. Plotly chart conventions

Every chart in the dashboard goes through one `baseLayout()` helper to keep
things consistent:

```js
const FONT       = { family: "Montserrat, system-ui, sans-serif",
                     size: 12, color: "#1a1a1a" };
const BG         = "rgba(0,0,0,0)";
const COLOR      = "#f57d6a";       // primary trace
const COLOR_DARK = "#1a1a1a";       // axes / outlines
const PLOT_CFG   = { responsive: true, displaylogo: false,
                     modeBarButtonsToRemove: ["lasso2d", "select2d"] };

function baseLayout(title) {
  return {
    title: { text: title, font: { ...FONT, size: 14, color: COLOR_DARK } },
    margin: { l: 60, r: 16, t: 36, b: 40 },
    paper_bgcolor: BG, plot_bgcolor: BG, font: FONT,
    xaxis: { gridcolor: "#eee9e4", zerolinecolor: "#dfd7cf",
             linecolor: COLOR_DARK, ticks: "outside", tickcolor: COLOR_DARK },
    yaxis: { gridcolor: "#eee9e4", zerolinecolor: "#dfd7cf",
             linecolor: COLOR_DARK, ticks: "outside", tickcolor: COLOR_DARK },
    legend: { font: { ...FONT, size: 11 } },
  };
}
```

**Rules**

- `paper_bgcolor` and `plot_bgcolor` are always transparent — the card's
  white background shows through.
- Title at top-left in 14 px Montserrat 700; never use Plotly's default
  centered title.
- Plotly logo is removed (`displaylogo: false`).
- Lasso / box-select are removed from the modebar — they're useless for
  most dashboards.
- Single-trace marker / line colour = `COLOR` (coral). Multi-trace charts
  inherit Plotly's `colorway` from the constant above.
- Choropleth colorbars: vertical, title with `side: "top"`, length `0.78`,
  `outlinewidth: 0`. Wrap long titles with this helper so they don't
  overflow the card:

  ```js
  function wrap2(s) {
    if (s.length <= 14) return s;
    const mid = Math.floor(s.length / 2);
    let i = s.lastIndexOf(" ", mid);
    if (i < 0) i = s.indexOf(" ", mid);
    return i < 0 ? s : s.slice(0, i) + "<br>" + s.slice(i + 1);
  }
  ```

- Units in axis titles use `<sup>-1</sup>` for negative exponents, not
  `/`. E.g. `nW cm<sup>-2</sup> sr<sup>-1</sup>`, not `nW/cm²/sr`.

---

## 9. Custom legend interaction

Plotly's default legend click is `toggle`; for series-rich charts we use a
smart-click handler:

- Click a **visible** trace when **others are also visible** → isolate it.
- Click a **hidden** trace → add it back.
- Click the **sole visible** trace → restore all.
- Double-click still does Plotly's built-in "show all".

```js
function attachSmartLegend(divId) {
  const el = document.getElementById(divId);
  if (!el || !el.on) return;
  const visible = t => t.visible !== "legendonly" && t.visible !== false;
  el.on("plotly_legendclick", ev => {
    const data = ev.data, i = ev.curveNumber, cur = data[i];
    const n = data.filter(visible).length;
    if (visible(cur) && n > 1) {
      Plotly.restyle(el, { visible: data.map((_, j) => j === i ? true : "legendonly") });
      return false;
    }
    if (visible(cur) && n === 1) {
      Plotly.restyle(el, { visible: data.map(_ => true) });
      return false;
    }
    return true; // hidden → let Plotly default add it back
  });
}
```

Call `.then(() => attachSmartLegend(divId))` after `Plotly.newPlot(...)`.

Add a tip line under every chart that uses it:

```html
<p class="tip">Click a state in the legend to isolate · click another to add
  · click the sole visible state to restore all · double-click to reset.</p>
```

```css
.tip {
  margin: 10px 4px 0;
  font-family: var(--font-serif);
  font-style: italic;
  font-size: 12px;
  color: var(--muted);
}
```

---

## 10. Primer cards (flow / stock chips)

Two-up explainer cards above the charts, used to motivate what each layer
measures. The small chip next to the H3 is the key visual element.

```css
.primer-card h3 .flow,
.primer-card h3 .stock {
  font-family: var(--font-mono);
  font-size: 10px; font-weight: 700;
  letter-spacing: 0.1em; text-transform: uppercase;
  padding: 3px 8px;
}
.primer-card h3 .flow  { background: var(--primary);   color: var(--white); }
.primer-card h3 .stock { background: var(--secondary); color: var(--theme); }
```

Re-purpose the chip class names if your data has different framings
(`.proxy`, `.census`, etc.). Keep the rule of *exactly one* chip per card,
*always* in mono.

---

## 11. District / region detail panel

A single "drilldown" section above the choropleths that responds to:

- Typing into a `<datalist>`-backed search box.
- Clicking a region on either choropleth (`plotly_click` event).

On selection, render two charts in a `.row`: one for each data layer. When
the underlying data is not yet loaded, show an italic Merriweather hint
instead of an empty Plotly div.

When the chart is rendered, scroll the detail section into view:

```js
document.getElementById("detail").scrollIntoView({ behavior: "smooth",
                                                   block: "start" });
```

---

## 12. Downloads

A `<ul id="downloads">` listing every CSV / GeoJSON the dashboard
consumed. The JS does HEAD requests against a hardcoded candidate list and
hides entries that 404 — that way the same template works whether the
pipeline has produced every artifact or only some.

```js
const DOWNLOAD_CANDIDATES = [
  ["data/panel.csv",       "Description in serif"],
  ["data/series.csv",      "Description in serif"],
  ["data/regions.geojson", "Boundary file"],
];
```

```css
#downloads { list-style: none; padding: 0; margin: 0;
  background: var(--white); border: 1px solid var(--line); }
#downloads li {
  display: flex; align-items: baseline; gap: 16px;
  padding: 14px 18px; border-bottom: 1px solid var(--line);
  font-size: 14px;
}
#downloads li:last-child { border-bottom: 0; }
#downloads li:hover { background: var(--theme); }
#downloads a {
  font-family: var(--font-mono); font-size: 13px;
  color: var(--primary); text-decoration: none; font-weight: 600;
}
#downloads .desc { color: var(--secondary); flex: 1; font-family: var(--font-serif); }
#downloads .size { color: var(--muted); font-size: 11px; font-family: var(--font-mono); }
```

File-size formatting in JS:

```js
const fmtSize = b => {
  const n = Number(b || 0);
  return n >= 1024 * 1024 ? `${(n/1024/1024).toFixed(1)} MB`
                          : `${(n/1024).toFixed(0)} KB`;
};
```

---

## 13. Footer + citations

The footer has three blocks, in this order:

1. **Cite this dataset** — one-line self-citation in serif, in a coral
   left-border callout box.
2. **Plain description** of data sources, with inline links.
3. **Selected XKDR work using …** — bulleted list (`<ul class="cites">`)
   linking to relevant XKDR papers. Multiple sections if the dashboard
   has multiple data layers.

```css
footer { color: var(--muted); font-family: var(--font-serif);
         font-size: 12px; line-height: 1.85;
         margin-top: 56px; padding-top: 20px;
         border-top: 2px solid var(--secondary); }
footer code { background: var(--white); border: 1px solid var(--line);
              padding: 1px 6px; font-family: var(--font-mono); font-size: 11px; }
footer a { color: var(--primary); text-decoration: none; }
footer a:hover { color: var(--primary-dark); text-decoration: underline; }

footer .cite-head {
  margin: 18px 0 6px;
  font-family: var(--font-sans); font-weight: 700;
  text-transform: uppercase; font-size: 11px;
  letter-spacing: 0.06em; color: var(--secondary);
}
footer .cite-self {
  font-family: var(--font-serif); font-size: 14px;
  background: var(--white); border-left: 3px solid var(--primary);
  padding: 10px 14px; margin: 6px 0 18px;
  color: var(--secondary);
}
footer .cites { padding-left: 18px; margin: 0; }
footer .cites li { margin: 4px 0; }
```

**Always** add `target="_blank" rel="noopener"` to external links —
citations should open in a new tab.

---

## 14. README badges

Top of the repo's README. Use shields.io with `style=flat-square` and the
XKDR coral for the live-dashboard accent.

```markdown
[![Live dashboard](https://img.shields.io/badge/live%20dashboard-PAGES_URL-f57d6a?style=flat-square)](https://PAGES_URL/)
[![License: MIT](https://img.shields.io/badge/license-MIT-1a1a1a?style=flat-square)](LICENSE)
[![Built with Julia](https://img.shields.io/badge/built%20with-Julia-9558B2?style=flat-square&logo=julia&logoColor=white)](https://julialang.org)
```

Add language-specific or tool badges as appropriate (e.g.
`NighttimeLights.jl`, `Google Earth Engine`). Keep colours to:
`f57d6a` (coral, brand), `1a1a1a` (dark, secondary), tool's own brand
colour with white logo.

---

## 15. File layout

```
repo/
├── docs/                        ← published by GitHub Pages
│   ├── index.html               ← page skeleton + section markup
│   ├── style.css                ← every rule in this guide
│   ├── app.js                   ← data load, charts, interactions
│   └── data/                    ← staged CSV / GeoJSON; committed
├── data/
│   ├── raw/                     ← pipeline outputs; gitignored
│   └── clean/                   ← cleaned panels; gitignored
├── (pipeline code, language of your choice)
├── Makefile                     ← `make dashboard` stages data
├── LICENSE                      ← MIT
└── README.md
```

**Important:** `docs/data/` IS committed. GitHub Pages must serve the CSVs
alongside the HTML. Only `data/raw/` and `data/clean/` are gitignored.

A `make dashboard` target should copy the cleaned panel files into
`docs/data/`:

```makefile
dashboard: docs/data/regions.geojson docs/data/panel.csv  ## Stage data

docs/data/regions.geojson: data/clean/regions.geojson
	@mkdir -p docs/data
	cp $< $@

docs/data/panel.csv: data/clean/panel.csv
	@mkdir -p docs/data
	cp $< $@
```

A `make serve` target for local preview:

```makefile
serve: dashboard  ## Local preview at http://localhost:8080/
	python3 -m http.server --directory docs 8080
```

---

## 16. JS lifecycle

```
HTML loads
  └── inline window.error handler (catches parse errors in scripts below)
  └── Plotly + PapaParse from CDN
  └── app.js
       ├── populateDownloads()   ← runs first, independent of main()
       ├── main()
       │     ├── fetch geo + panel(s) in parallel
       │     ├── parseCSV
       │     ├── hasMetric() probes
       │     ├── showSections({haveA, haveB, …})
       │     ├── populateYearSelect → DEFAULT_YEAR or latest
       │     ├── render(year)
       │     │    ├── choropleths
       │     │    ├── top-N
       │     │    └── scatter (when applicable)
       │     ├── attach selector listeners
       │     ├── attach detail-panel listeners
       │     └── wireMapClicks(districtIndex)
       └── error handlers display in the status pill
```

The page should degrade gracefully:

- Missing optional panel → sections needing it stay hidden via
  `data-needs="X"` attributes.
- Missing required file → status pill turns red with the actual error.

---

## 17. Anti-patterns — DO NOT

- ❌ Rounded corners. Cards, pills, inputs, buttons — all sharp.
- ❌ Drop shadows beyond 1 px hairlines. Use borders, not blur.
- ❌ Multiple accent colours. There is exactly one: coral.
- ❌ Plotly's default styling (centered title, gray background, logo, etc.).
- ❌ Bootstrap or any CSS framework. The whole thing is ~250 lines of
  hand-written CSS.
- ❌ React / Vue / Svelte. Plain `<script>` + Plotly + PapaParse is enough.
- ❌ Frontend build tooling. The page should work straight out of
  `python -m http.server`.
- ❌ Emoji or icon fonts. The chips do the visual lifting; that's enough.
- ❌ Sans-serif body text. Body prose is Merriweather, always.
- ❌ Hex-only fields in the dashboard chrome (everything goes through
  `var(--…)` so the palette is one place).

---

## 18. Quick start for the LLM

When applying this style to a new project:

1. Identify the **two-or-three data layers** the dashboard will surface.
   Decide for each whether it's a *flow*, *stock*, *proxy*, etc.
2. Pick the brand wordmark (subject + dot + accent phrase).
3. Generate `docs/index.html`, `docs/style.css`, `docs/app.js` using the
   templates above. Keep CSS rules in this same order: tokens → layout →
   hero → status → sections → controls → cards → component-specific
   (detail, downloads) → footer.
4. Plug actual data column names into `DATA = { ... }` and adjust the
   `hasMetric` / `showSections` keys.
5. Add a Makefile that stages cleaned outputs into `docs/data/` and a
   `make serve` target.
6. Write the README with badges, repo-rename memory note, and a short
   description of the pipeline.
7. Verify on local: `make dashboard && make serve`, open
   `http://localhost:8080/`, hard-refresh, and check:
   - Hero accent is coral, dot is coral
   - All cards have sharp white surfaces with thin grey borders
   - Status pill is dark and uppercase mono
   - Choropleth colorbar fits inside the card
   - Smart legend isolates on first click and adds on the next
   - Search box backed by a `<datalist>` filters districts/regions
   - Footer has three blocks: cite-self, prose description, cites list
