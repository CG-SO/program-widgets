# CGIAR program widgets

Two embeddable widgets for the program pages on cgiar.org:

| Widget | File | Embed URL |
|---|---|---|
| Where we work map | `program-map.html` | `program-map.html?program=<id>` |
| Interlinked support diagram | `portfolio-diagram.html` | `portfolio-diagram.html?focus=<id>` (or no `focus` for the portfolio overview) |
| Our goals | `program-goals.html` | `program-goals.html?program=<id>` |

Same pattern as `cg-so/apac-map` and `cg-so/where-cgiar-works`: static files on GitHub Pages, content in JSON, embedded in Drupal with an iframe. No Drupal code, no feature branch, no build step.

`index.html` previews every program and gives the embed code to copy.

## How content gets updated

```
CGIAR_program_connections.xlsx  (comms edit their rows)
        │  python3 tools/sheet_to_json.py CGIAR_program_connections.xlsx
        ▼
data/portfolio.json      → diagram (programs + connections)
data/program-maps.json   → maps (global / regions / countries / tiers per program)
data/program-goals.json  → goals ("Our goals" figures per program)
        │  commit + push (GitHub Pages publishes in about 1 minute)
        ▼
every embedded page updates, no Drupal change needed
```

The script prints a report: each program's map contents, plus anything to check (missing ISO3, unknown region names, programs with nothing to show). Fix those in the workbook and run it again.

Workbook tabs used: `Programs`, `Connections`, `Map data`, `Map countries`, `Map tiers`, `Goals`. Do not rename them.

## The map: four kinds of data, any mix

Programs give different levels of detail, so the map accepts any combination:

| Data | Shown as | Example |
|---|---|---|
| `global: true` | "Global" badge in the panel. If nothing else is listed, the whole world is tinted | Capacity Sharing, Genebanks |
| `regions` | Light shading of every country in the region, and region chips that zoom to it | Breeding for Tomorrow |
| `countries` | Solid green countries, plus a clickable country list | Gender Equality and Inclusion |
| `tiers` | One colour per tier (dark to light green), tier cards that filter and zoom | Sustainable Farming, Climate Action |

On the map, tiers sit on top of countries, and countries sit on top of regions. Small countries (for example Singapore or Mauritius) get a dot so they stay visible and clickable.

### Regions

Region names are matched against `data/regions.json`:
- UN M49 sub-regions (Eastern Africa, Southern Asia, South-eastern Asia…)
- CGIAR groupings (CWANA, ESA, WCA, SEAP, LAC, South and Southeast Asia…)
- aliases for the spellings used on cgiar.org ("South East Asia", "West Africa", "Latin America"…)

A name that doesn't match shows as a dashed chip and isn't shaded, and the script lists it. Either fix the text in the workbook, or add an alias to `regions.json`.

### Data format (`data/program-maps.json`)

```json
{
  "countryNames": { "COD": "Democratic Republic of the Congo" },
  "defaults": { "ui": {} },
  "programs": {
    "sustainable-farming": {
      "header": { "eyebrow": "CGIAR · Sustainable Farming", "title": "Where we work", "subtitle": "" },
      "global": true,
      "regions": ["Eastern Africa", "Southern Asia"],
      "countries": [],
      "tiers": [
        { "label": "Tier 1", "description": "Core priorities", "color": "", "countries": ["ETH", "KEN"] }
      ],
      "countryInfo": { "KEN": ["Country Coordinator: Name", { "text": "Profile", "url": "https://…" }] }
    }
  }
}
```

Leave `color` empty to use the CGIAR green scale. Custom colours need at least 3:1 contrast against white land.

## The diagram

- `?focus=<id>`: program page view. The program sits in the centre. The spokes are that program's own "We closely work with" list (from its row in `Connections`). If its row is empty, the spokes are the programs that list it.
- No `focus`: portfolio overview, with all 13 programs and accelerators around the centre.
- Grey lines between other nodes appear when either side lists the other.
- Clicking a node highlights its links and fills the side panel. Panel chips jump to the linked program, and "Explore this program" opens its page in the parent window.
- "Pause motion" stops the animation. Animation is off automatically for users who prefer reduced motion.

## Our goals

The figures from the "Our goals" section of each program page, as a strip of 3 or 4 items. Text is copied word for word from cgiar.org into the workbook `Goals` tab (one row per figure: `Figure`, `Headline`, `Text`; `Section title` and `Intro` on the program's first row). An item can have any of the three; text-only items (no figure) are shown larger.

- 4 items: 4 columns on desktop, 2 on tablets, 1 on phones. 3 items: 3 columns, then 1.
- `bg=0` drops the mint panel and padding, for a page section that already has its own background.
- Scaling for Impact has no goals section on its page, so it has no data and the widget shows a message.

## Embedding in Drupal

Use a text format that allows `<iframe>` (the Sustainable Farming page already embeds the apac-map tier map this way).

```html
<iframe id="programMap" src="https://cg-so.github.io/<repo>/program-map.html?program=sustainable-farming&id=programMap"
  title="Where we work map" loading="lazy" scrolling="no"
  style="width:100%; min-height:560px; border:0; display:block;"></iframe>
<script>
window.addEventListener('message', function (e) {
  var f = document.getElementById('programMap');
  if (f && e.source === f.contentWindow && e.data && e.data.type === 'cgiar-widget-height') { f.style.minHeight = '0'; f.style.height = e.data.height + 'px'; }
});
</script>
```

For the diagram, use the same snippet with `portfolio-diagram.html?focus=sustainable-farming&id=portfolioDiagram` and `id="portfolioDiagram"`. For goals, use `program-goals.html?program=sustainable-farming&id=programGoals`, `id="programGoals"` and `min-height:320px`.

- The `e.source` check means two widgets on one page don't resize each other.
- `min-height` only holds space until the widget loads. The script clears it, so the iframe can shrink to the widget's real height.
- If the CMS strips `<script>`, drop it and set a fixed height (map 640px, diagram 820px, goals 360px; goals on phones need about 700px).

URL parameters: `program`, `focus`, `id` (must match the iframe id), `panel=0` (map or diagram only, no side panel), `bg=0` (goals without the mint panel), `data` (alternative JSON file).

## Files

| File | Purpose |
|---|---|
| `program-map.html`, `assets/program-map.js` | Map engine (Leaflet 1.9.4, vendored) |
| `portfolio-diagram.html`, `assets/portfolio-diagram.js` | Diagram engine (no dependencies) |
| `program-goals.html`, `assets/program-goals.js` | Goals strip (no dependencies) |
| `assets/widgets.css` | Shared tokens and styles. All colours live here |
| `data/countries.geo.json` | Natural Earth 110m boundaries, ISO3 ids, plus 61 small countries from 50m (189 KB) |
| `data/regions.json` | Region dictionary and aliases |
| `data/portfolio.json`, `data/program-maps.json`, `data/program-goals.json` | Generated by the script. Don't hand-edit unless you have to |
| `tools/sheet_to_json.py` | Workbook to JSON converter (`pip install openpyxl`) |
| `vendor/leaflet/` | Leaflet 1.9.4 (BSD-2-Clause) |

Test locally with `python3 -m http.server 8000`, then open http://localhost:8000/.

## Known limits

- Boundaries are Natural Earth, which is not an official CGIAR position on borders. Keep the "Boundaries: Natural Earth" note.
- The short program descriptions in the diagram panel are drafts (marked in the `Programs` tab) and need comms sign-off.
- The map does not show ecoregions (Multifunctional Landscapes lists 10). That would need ecoregion shapes. The `cg-so/mfl-living-landscapes` repo already has them, so it could be linked from that page instead.
