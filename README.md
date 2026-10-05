# @kufayeka/nexa-component-ui-library — Nexa UI

A themed component library for **Nexa Dashboard**: 43 form, display, feedback, navigation, layout and chart components. It is a normal Nexa plugin, built only on the Nexa component SDK, so it is also the example to follow when you **build your own UI library**.

- **Form**: Button, Input, Textarea, Number Input, Password Input, Date Time, Date Range, Checkbox, Switch, Radio Group, Segmented Control, Select, Combobox, Slider, Tags Input, Pin Input, Rating.
- **Display & feedback**: Text, Heading, Badge, Tag, Card, Avatar, Stat, Alert, Progress (a bar or a circle), Spinner, Skeleton, Separator, Empty State, Timeline, Fieldset.

- **Layout & Navigation**: Tabs — each tab has a panel you drop components into (the SDK's *slots*); Pagination — IBM Carbon-inspired pagination bar.
- **Embed**: Iframe — another web page (Grafana, a camera, a report), with Logic both ways.
- **Charts**: Line Chart (time series, an axis per series, thresholds, 1 M+ points), State Timeline (machine states, statistics), Bar Chart (grouped / dempet, stacked, 100% stacked, and Pareto 80/20 analysis), Pie / Donut Chart (categorical proportions, center KPI, auto "Others" grouping), Radial & Linear Gauge (dial / linear meter, needle pointer, bounds, threshold zones, target marker), Area & Stacked Area Chart (cumulative volume/flow, 100% stacked, time ruler), Sparkline (compact KPI trend indicator for cards and tables), and Chart (the Cartesian chart: columns / bars / lines / areas / points, stacked or side by side, rows split by a field), and Histogram (statistical distribution and frequency analysis, Freedman-Diaconis binning, normal Gaussian curve overlay, and Six Sigma Cp/Cpk tolerance limits). All are driven item by item from Logic, export CSV / Excel / PNG, and print as they look.

In the editor they are in the palette under **UI · Form**, **UI · Display**, **UI · Layout** and **UI · Charts**.

### Iframe

**Content**
- URL, plus **URL parameters** (a list; each value can be bound, e.g. `{line}` or a tag). An empty value leaves the URL's own value alone.
- **Auto-convert embed URL** (on by default): automatically converts standard URLs of YouTube, Vimeo, Google Docs/Sheets/Slides/Drive, Figma, Loom, Spotify, CodePen into their official embed format so they bypass `X-Frame-Options` blocks.
- **URL converter template**: optional template (e.g. `https://converter.local/?url={url}`) to wrap any URL via a converter or proxy.
- Or **HTML instead of a URL** (`srcdoc`).
- Title (screen readers) and name.

**Grafana preset** (the URL parameters Grafana understands)
- Kiosk mode: off / TV / full.
- Theme: *follow the app's colour mode*, light, dark, or Grafana's own.
- From / To, Refresh, orgId, time zone.
- Dashboard variables (`var-…`).

**Loading**
- `loading` Lazy (loads when near the view) or Eager (loads now); fetch priority.
- "Loading…" until it has loaded.
- A timeout (fires **On Timeout**).
- Reload every N seconds.
- Whether the editor shows the page live or a placeholder.

**Security**
- Sandbox on/off, with every `allow-*` token as a checkbox.
- Referrer policy, `csp`, credentialless.

**Permissions** (`allow=`)
- fullscreen, autoplay, clipboard, camera, microphone, geolocation, screen capture…
- A field for any other permission.

**Messages**
- *Accept messages from*: origins. Empty = the embedded page's own origin; `*` = any.
- *Send messages to origin*.

**Logic events**
- **On Load** (`url`, `count`; it fires again on each navigation inside it).
- **On Message**: `data` and `origin` of a `postMessage` from the page.
- **On Error** and **On Timeout**.

**Logic actions** (Update Component → *Run:*)
- **Reload**.
- **Open URL** (`{ url }`).
- **Send a message** (`{ data, targetOrigin }`, or just the payload), sent with `postMessage` into the page.
- **Set URL parameters** (`{ name: value }`; `null` removes one): e.g. a new Grafana time range without rebuilding the URL.
- **Back / Forward**: only for a page of the same origin; the browser allows nothing else.

Grafana must allow embedding: `allow_embedding = true` in `grafana.ini`, and anonymous or proxied auth for the viewers.

### Tabs

- Each tab (Content → Tabs: value, label, icon, disabled) has its own **panel**, a panel of the page. Click a tab header on the canvas to show its panel, then drop components into it. Double click the panel for its auto layout, padding and fill.
- **Value** is the value of the tab shown. Bind it (a variable, a tag) and it works both ways: the binding picks the tab, and a click writes the new value. **On Change** fires when the user switches tab.
- Logic actions: **Show a tab** (`value`), **Next tab**, **Previous tab**.
- Keyboard: ← → (↑ ↓ when the tabs are on the left), Home, End.
- Variants: Line (Carbon), Contained (Carbon), Pills. Tabs on the top or on the left; *Fill the width* makes all tabs the same width.
- A tab's value names its panel. If you rename a value, that tab gets a new, empty panel. The old panel is kept but hidden until the value comes back.

### Date Time (`nexa-ui-datetime`)

Designed to solve the universal developer UTC bug and provide granular time unit control:
- **Granular Unit Selection**: Choose presets (`Date & Time`, `Date & Time with Seconds`, `Date Only`, `Time Only`, `Year & Month`) or toggle individual units on/off (`showYear`, `showMonth`, `showDay`, `showHours`, `showMinutes`, `showSeconds`).
- **Flexible Format Templating**: Tokenized formatting supporting `YYYY`, `YY`, `MMMM`, `MMM`, `MM`, `DD`, `HH`, `hh`, `mm`, `ss`, `A` (AM/PM), `Z` (offset).
- **Custom Parsing Regex**: Optional regex with capture groups (e.g. `(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})`) for non-standard legacy payloads.
- **Universal UTC & Local Handling**:
  - `timezoneMode: 'utc'`: Stores and presents values in UTC with an indicator badge, eliminating accidental browser local shifts.
  - `timezoneMode: 'local'`: Converts UTC timestamps to operator local time for human viewing and seamlessly converts back to UTC upon write.
  - `outputType`: Writes back as ISO-8601 string (`iso`), Unix epoch ms (`timestamp-ms`), Unix epoch seconds (`timestamp-s`), formatted template string (`formatted`), date only (`utc-date`), or time only (`utc-time`).
- **Carbon-styled Popover**: Flyout calendar grid with month navigation, time spinners, and quick actions ("Now", "Clear", "Done").

### Date Range (`nexa-ui-daterange`)

Built for SCADA historians, batch timeframes, reporting periods, and time-range filtering:
- **Dual-Month Calendar Grid**: Side-by-side synchronized month views (Month M and Month M+1) with month navigation and visual range highlighting (`range-start`, `in-range`, `range-end`, and real-time hover previews).
- **Quick Preset Ranges**: One-click selection sidebar for standard industrial timeframes:
  - *Today*, *Yesterday*, *Last 7 Days*, *Last 30 Days*, *This Month*, *Last Month*, *Year to Date*.
- **Flexible Two-Way Data Binding**:
  - Two individual bindings (`start` and `end`), or a single combined `range` object (`{ start, end }` or `[start, end]`).
  - Automatic error protection: automatically swaps start and end dates if an operator picks an end date earlier than start.
- **Granular Time Option**: Optional time controls (`enableTime: true`) with start & end `HH:mm` spinners for high-precision batch windowing.
- **Universal UTC & Local Handling**:
  - `timezoneMode: 'utc'`: Processes and displays dates in UTC with badge indicator, eliminating browser timezone shifts.
  - `timezoneMode: 'local'`: Converts timestamps to operator local time for human display while safely maintaining UTC on write.
  - `outputType`: Outputs as ISO-8601 strings (`iso`), Unix epoch milliseconds (`timestamp-ms`), Unix epoch seconds (`timestamp-s`), formatted strings (`formatted`), or date only (`utc-date`).
- **Logic Events & Actions**:
  - Events: `change` (with `start`, `end`, `range`, `startIso`, `endIso`, `text`), `open`, `close`.
  - Actions: `setPreset(name)`, `clear()`.

### Pagination (`nexa-ui-pagination`)

Modeled after the official IBM Carbon Design System Pagination specifications and refined for Nexa UI:
- **Variants**:
  - `bar` (Carbon Bar): Full status bar with items per page selector dropdown (`10`, `20`, `50`, `100`), divider line, item range label (`1–10 of 120 items`), page jump selector (`1 of 12 pages`), and icon navigation buttons.
  - `numeric` (Numeric Pages): Classic numbered page buttons (`[<] [1] [2] [3] ... [10] [>]`) with configurable `siblingCount`, active page highlighting, and ellipsis handling.
- **Two-Way Data Binding & Outputs**:
  - `page`: Current page number (1-based, two-way bound to `inputPage` / `outputPage`).
  - `pageSize`: Items per page (two-way bound to `inputPageSize` / `outputPageSize`).
  - `offset`: Computed starting offset `(page - 1) * pageSize` (written to `outputOffset`).
- **Logic Events**: Emits `change` (full payload with `page`, `pageSize`, `total`, `offset`, `limit`), `pageChange`, and `pageSizeChange`.
- **Keyboard & Action Controls**: `next()`, `prev()`, `first()`, `last()`, and `setPage(n)`.

### Password Input (`nexa-ui-password-input`)

- **Strict IBM Carbon Alignment**: Styled identically to Text Input with subtle background fill (`var(--nexa-colors-bg-subtle)`), bottom border (`border-bottom: 1px solid var(--nexa-colors-border-emphasized)`), and 2px focus ring.
- **Flush Carbon Reveal Button**: The toggle visibility eye button stretches full height flush to the right border of the field (`margin-right: -var(--px)`), replacing clunky floating boxes.
- **Suppressed Native Browser Overlays**: Suppresses browser-native reveal overlays (`::-ms-reveal`, `::-ms-clear`, and webkit autofill buttons) to guarantee crisp, uncluttered rendering across Edge, Chrome, Safari, and Firefox.

### Line Chart (`nexa-ui-line-chart`)

A time-series chart driven by Logic.

**In Logic** (the Events tab), a chart is:
- **One "Update chart" node.** It covers the chart's own props (time range, time axis, axes, tooltip, legend, thresholds, annotations, zoom & pan, export) and its actions:
  - **Follow live**;
  - **Show a time range** (`{from, to}`);
  - **Clear every series**;
  - **Add annotation** (`addAnnotation({ time, label, color })`);
  - **Set annotations** (`setAnnotations([{ time, label, color }])`);
  - **Clear annotations** (`clearAnnotations`);
  - **Export** (`{format: "csv" | "xlsx", range: "visible" | "all"}`): downloads on the viewer's screen;
  - **Export PNG** (`exportPNG`): downloads the chart image.
- **Per series, its own Update node** for that series' props and its actions:
  - **Append points** (`{x, y}`, `[{x, y}, …]`, or a number: time = now);
  - **Replace points**;
  - **Clear**, **Show**, **Hide**.

  Its message is the series' own: a series field bound to Message reads what its node got, so two series can both read `msg.payload`.
- **Chart events:**
  - **On Range Change** {from, to, live, cause}: load what the time shown needs;
  - **On Live / Paused**;
  - **On Hover** / **On Hover End** {time, values}: a crosshair shared with other charts;
  - **On Click**;
  - **On Annotation Click** {id, time, label, color, description}: drill down or trigger workflows from event marker pins;
  - **On Range Select** (Shift + drag);
  - **On Series Toggle**.
- **Series events:**
  - **On Point Click**;
  - **On Threshold Crossed** {direction, value, threshold}: an alarm without a script;
  - **On Stale** / **On Resume**: a sensor went quiet, or came back.

**A series:**
- **Live value**: a tag or a variable; every new value is a point.
- **Data settings:** points kept, break the line after N ms, stale after N ms, and a **time shift** (yesterday over today).
- **Look:** variant / interpolation (line / step / smooth / bars / points), step mode (after / before / center), colour, width, dash, opacity, fill, points.
- **Its own Y axis:** position (left / right / hidden), title, unit; Range (soft / hard min / max, **zero in the middle** for − and +); Numbers; Spine (line, ticks).
- **Tooltip:** simple (label, text before / after the value) or an **expression**:
  - `{value} {delta} {min} {max} {avg} {name} {unit} {time}`;
  - `[series]{s2}`: another series at that time, e.g. `round({value} / [series]{flow} * 100, 1) "%"`;
  - `fmt(x, "compact" | "si")`.
- **Id:** fixed (`s1`, `s2`…), the id its nodes use.

**One Y axis per series:**
- Every series has its own axis and scale. Several on one side stand side by side; **the first series in the list is closest to the chart**.
- With more than one axis, each axis' labels (and its title) take its series' colour; a single axis stays neutral.
- Column widths come from the widest label; `axisGap` (Style) is the space between columns.
- The Inspector: a series' **Axis** section, with **Range**, **Numbers** and **Spine** inside it.
- Each series has its own Update node in Logic: its axis, range and style can change at runtime.

**Numbers:** per series (its Axis › Numbers):
- as it is · short (1.2K 3.4M 5B) · engineering (k M G: 1 500 kW shows as **1.5 MW**, 0.002 s as **2 ms**) · scientific;
- decimals, the thousands separator, `1,234.5` or `1.234,5` (or the page's language).

**Time axis:**
- the ruler:
  - **two rows** (time + date; the default, and it shows it can be dragged);
  - **navigator** (the whole history small, a window to drag and resize with the mouse or a touch screen);
  - comb, labels only, or none;
- **show time** and **show date** checkboxes (toggle time and/or date independently);
- **date format**: Day D Mon Y (`Sat 03 Oct 2026`), ISO (`2026-10-03`), `DD/MM/YYYY`, or `MM/DD/YYYY`;
- **tick spacing**: Loose (spacious), Normal (balanced), or Dense;
- **ruler height**: percentage of chart height (auto ~12 %, customizable up to 50 %);
- 24 h / 12 h / relative to the newest point; local time or UTC.

**Annotations & Event Markers:**
- Event marker flags with down-pointing pins and vertical dashed lines at key timestamps (e.g. "Shift 1", "Trip", "Batch End");
- Configurable statically via `annotations` prop list or dynamically via actions (`addAnnotation({ time, label, color })`, `setAnnotations([{ time, label, color }])`, `clearAnnotations`);
- Hovering an annotation shows its details in the tooltip and changes cursor to pointer; clicking emits **On Annotation Click**.

**Interpolation Modes:**
- `line`: Direct linear segment between points;
- `step`: Digital square staircase wave (ideal for discrete signals, machine ON/OFF, alarms, recipe stages) with configurable transition point: `after` (standard), `before`, or `center`;
- `smooth`: Monotone cubic spline curve through points;
- Can be set per series (`variant` / `interpolation`) or chart-wide as default (`defaultInterpolation`).

**Zoom & pan:** zoom in / out to at most N, move only where there is data (or within the last N, or anywhere), room after the newest point.

**Gestures** (every time chart: Line, State Timeline). A page full of charts must still scroll:
- **Page first** (default): the mouse wheel and one finger scroll the page, also over a chart. **Ctrl / ⌘ + wheel** (or a trackpad pinch) zooms, a mouse drag pans. On a touchscreen **two fingers** pinch-zoom and pan, a **tap** shows the tooltip (a tap elsewhere hides it). A short hint says so when a plain wheel or one finger moved the page instead. The same rule as a Zoom frame in Nexa Dashboard.
- **Chart first**: the wheel zooms and one finger pans (the page does not scroll through the chart). For a chart that fills an HMI screen. Y axes have **soft** min / max (they grow with the data) and **hard** min / max (fixed).

**Also:**
- legend: click hides a series, Alt+click shows it alone; it shows the last / min / max / average value;
- thresholds: a line, an **upper limit** or a **lower limit** (a limit colours the values past it in Excel), on the scale of the series it names;
- **export** (the ⋮ menu, or Logic's Export action `{ format: "csv" | "xlsx" | "png", range: "visible" | "all", annotations, thresholds }`; each option left out comes from the Properties' Export group):
  - *what is shown* (zoom / pan applied) or *everything it holds*; hidden series are never exported;
  - CSV / Excel: a row per time (to the millisecond), a column per series, an **Annotation** column (each annotation its own row at its exact time);
  - Excel: a value past an **upper / lower limit** gets the limit's colour; an **Info** sheet (title, from / to, time zone, series, limits);
  - PNG: 2× sharp, a title and the time span above, the legend below;
  - which formats the menu offers (CSV / Excel / PNG) is set in the Properties;
- customizable download file name expression / template (`{title}`, `{date}`, `{time}`, `{format}`, `{range}`);
- every point kept (Float64), drawn at pixel accuracy (M4 + an LOD pyramid), 1 M points a series in a few ms;
- the canvas shows sample waves for series without data;
- v1 / v2 charts are migrated.

### State Timeline (`nexa-ui-state-timeline`)

Machine states along time (Running / Stopped / Idle…): one bar per machine, a coloured block per state. Use it for availability, downtime and the OEE of a line.

**States** are defined in the props: a label, a colour, and a match.
- The match is either an exact **value** (`"1"`) or a **range** (`min`–`max`, e.g. 80–1000 = "High").
- A value nobody defined shows grey, with its own text.

**Rows** (one per machine) are Logic targets. Each row has its own Update node and its own events.
- **Live state:** a tag or a variable. Every *change* becomes a block; the same value again is ignored.
- **Set states** (`setStates`, replaces the row's history). Two shapes:
  - changes: `[{ time, state, note }, …]`, where a `state: null` ends the last block;
  - intervals: `[{ start, end, state, note }, …]`, where a gap between intervals stays empty.
- **Append change** (`appendChange`): `{ time, state, note }`. A late change goes into its place.
- **Clear.**
- **On State Change** `{ from, to, time, label }`, with the row as the target.

**The chart:**
- **Lanes:** one lane per row (combined), or one lane per row and state (split: every state on its own line).
- **Statistics column** for each lane, over the time shown. Pick any of:
  - **%** of the time;
  - **total time**;
  - **count** (how often it entered the state);
  - **first** and **last**;
  - **now** (the current state and how long it has lasted).

  The state the statistics are about is selectable.
- **Tooltip** on a block: state, start → end, duration, note. On a touchscreen: a tap.
- **On Segment Click** `{ row, state, value, start, end, duration, note }`, for drill-down.
- **Annotations**, **zoom & pan**, the **time ruler / navigator**, **Follow live**: the same as the Line Chart.
- **Refresh:** On new data (the default), or Every 100 ms … 30 s. With a ticker, the current block keeps growing up to now. It pauses while you hover, zoom or pan, and when the chart is off screen.
- **Export:**
  - CSV: one row per block (row, state, value, start, end, duration in seconds, note);
  - Excel: the state cells in their colour, plus Summary, Annotations and Info sheets;
  - PNG.

Example: Inject (on open) → Function → Update (row *Filler*, **Set states**):

```js
const H = 3600000, now = Date.now();
msg.payload = [
    { start: now - 3 * H, end: now - 2 * H, state: 1 },
    { start: now - 2 * H, end: now - 1.5 * H, state: 0, note: "Jam" },
    { start: now - 1.5 * H, end: now, state: 1 }
];
return msg;
```

### Bar Chart (`nexa-ui-bar-chart`)

Bar and column chart for discrete categories or time series, supporting comparison and Pareto analysis.

**Modes (`mode`)**:
- **Grouped ("dempet")**: bars of each series stand side-by-side within each category or timestamp slot.
- **Stacked**: series stack vertically on top of each other (accumulating total $\sum$).
- **100% Stacked**: stacks normalized to 100% for proportional distribution.
- **Pareto**: categories automatically sorted descending by value + dual right Y-axis with a cumulative percentage line curve and an **80% Cutoff Line** (the 80/20 rule).

**Orientations**:
- **Vertical**: standard column chart (categories on bottom, values on left).
- **Horizontal**: horizontal bars (categories on left, values on bottom), ideal for long category names or horizontal rankings.

**X-Axis Types (`xType`)**:
- **Category (`category`)**: discrete categories (`categories` prop, data keys, or `setCategories` action). Supports automatic label rotation (0°, 45°, 90°, -45°).
- **Time series (`time`)**: timestamps along the time ruler. Supports live following, time windows, zoom & pan gestures, and event annotations.

**Series as Logic targets (`target: true`)**:
Each series has its own Update node and click events in Logic (Events tab).
- **Actions**:
  - **Set data** (`setData`): replaces data for this series (`[10, 20, 30]` or `[{category, value}, …]` or `[{x: timestamp, y: value}, …]`).
  - **Set point / bar** (`setPoint`): updates a single category bar `{category, value}` or timestamp point `{x, y}`.
  - **Append point** (`appendPoint`): appends `{x, y}` or a scalar (time = now).
  - **Clear**, **Show**, **Hide**.
- **Events**:
  - **On Bar Click** `{ category, time, value, percent, index }`.

**Chart-level Logic**:
- **Actions**:
  - `setCategories(["A", "B", "C"])`: sets or replaces category labels.
  - `setChartData({ categories, series: { s1: [...], s2: [...] } })`: bulk data update for all series from a single SQL / REST payload.
  - `clearAll()`: empties all series.
  - `export({ format: "csv" | "xlsx" | "png" })`.
- **Events**:
  - **On Bar Click** `{ category, time, seriesId, seriesName, value, percent, cumulativePercent, index }` — for drill-down flows.
  - **On Hover**, **On Hover End**, **On Legend Toggle**, **On Range Change**.

**Export**:
- CSV: tabular data with category/time and all visible series.
- Excel (`.xlsx`): real multi-sheet workbook with numbers and dates formatted.
- PNG: 2× crisp rendering with title, axis scales, and bottom legend.

### Pie & Donut Chart (`nexa-ui-pie-chart`)

Pie and Donut chart for categorical proportions of a whole, designed to solve the common pain points found in industrial SCADA and monitoring platforms (Ignition label truncation, Grafana missing "Others" grouping, Optix rigid bindings):

**Key Features**:
- **Modes (`mode`)**:
  - **Donut (`donut`)**: hollow center with configurable inner radius (`innerRadius: 0.6`).
  - **Pie (`pie`)**: classic solid circular chart.
- **Center KPI / Metric**:
  - Displays large bold metric inside the donut hole: **Total Sum (∑)**, **Average (mean)**, **Count of slices**, or **Custom value**.
  - Subtitle label beneath the number (e.g. `"Total"`, `"Active Power"`, `"Total Units"`).
- **Auto "Others" Grouping** *(Solves Grafana & Ignition limitations)*:
  - `groupThresholdPercent`: automatically bundles slices below a certain percentage (e.g. `< 3%` or `< 5%`) into an `"Others"` category slice.
  - `maxSlices`: keeps the top $N$ slices and collapses remaining slices into `"Others"`.
  - Rich tooltip displays a nested breakdown list of the sub-slices contained within the "Others" slice!
- **Smart Anti-Collision Labels** *(Solves Ignition clipping issues)*:
  - Positions: `outside` (clean leader lines with elbow hooks), `inside` (centered in slice), or `legend-only`.
  - `minAngleForLabel`: automatically hides labels for narrow slices (e.g. `< 10°`) so text never collides or overlaps.
- **Micro-Animations & Visuals**:
  - Slice gap (`padAngle`): clean 1.5° separation between slices.
  - Hover Explosion: hovered slice smoothly pushes radially outward by 6px with highlight.
- **Interactive Legend & Logic Targeting**:
  - Slices can be defined in properties (`slices` prop) and targeted in Logic (`{ list: "slices", id: slice.id }`).
  - Clicking a legend item toggles/mutes that slice; Alt+click solos that slice.
  - Fires **On Slice Click** `{ id, name, value, percent, index, isOther }` for instant HMI drilldowns and page navigation.
- **Export**:
  - Direct download to CSV, formatted Excel (`.xlsx` with auto column types), and PNG 2× sharp snapshot.

---

#### Node-RED Function Node Examples for Testing

Copy and paste these scripts into a Node-RED **Function Node** connected to `nexa-ui-pie-chart`:

##### 1. Basic Object Array (with Custom Colours)
```js
// Sends machine status breakdown
msg.payload = [
    { name: "Running", value: 145, color: "#10b981" },
    { name: "Idle", value: 65, color: "#f59e0b" },
    { name: "Maintenance", value: 25, color: "#3b82f6" },
    { name: "Fault", value: 15, color: "#ef4444" },
    { name: "Offline", value: 8, color: "#6b7280" }
];
return msg;
```

##### 2. Key-Value Object / Map (Direct Production Lines)
```js
// Directly feeds a dictionary/map of line totals
msg.payload = {
    "Line 1 (Packaging)": 350,
    "Line 2 (Bottling)": 280,
    "Line 3 (Assembly)": 190,
    "Line 4 (Quality Check)": 45
};
return msg;
```

##### 3. 2D Array / Tuples (Energy Breakdown)
```js
// Feeds [name, value] pairs
msg.payload = [
    ["Chiller Plant", 54.2],
    ["Air Compressor", 38.5],
    ["Cooling Tower", 21.0],
    ["Pumps", 12.8],
    ["Lighting", 6.5]
];
return msg;
```

##### 4. Testing Auto "Others" Grouping (Threshold < 5%)
```js
// Notice small items (< 5%) will automatically collapse into "Others"
msg.payload = [
    { name: "Extruder Main", value: 120 },
    { name: "Hydraulic Pump", value: 95 },
    { name: "Cooling Fan", value: 70 },
    { name: "Feeder", value: 50 },
    { name: "Valve A", value: 4 },    // < 5% -> auto grouped into Others!
    { name: "Sensor B", value: 2 },   // < 5% -> auto grouped into Others!
    { name: "Auxiliary", value: 1 }   // < 5% -> auto grouped into Others!
];
return msg;
```

##### 5. Handling Slice Clicks for HMI Drilldown
Connect a Function Node to the output of `nexa-ui-pie-chart` (wired to the `On Slice Click` event):
```js
// Event payload: { id, name, value, percent, index, isOther }
const slice = msg.payload;
node.warn(`Operator clicked: ${slice.name} (${slice.percent}% of total)`);

if (slice.name === "Fault") {
    // Navigate to alarm page or open modal
    msg.action = "navigate";
    msg.url = "/alarms";
    return msg;
}

// Or filter an active table / query
msg.filter = { status: slice.name };
return msg;
```

---

### Radial & Linear Gauge (`nexa-ui-gauge`)

Industrial and dashboard gauge component inspired by Power BI, Ignition, and modern SCADA HMI meters. Supports both radial dial/speedometer and horizontal/vertical linear level bar modes.

**Modes (`mode`)**:
- **Radial (`radial`)**: circular dial/speedometer with configurable start angle (`startAngle: 135°`) and end angle (`endAngle: 45°`, covering a 270° sweep) or custom semicircular/horseshoe arcs.
- **Linear (`linear`)**: rectangular level gauge with orientation (`orientation: "horizontal"` or `"vertical"`). Ideal for tank levels, temperature thermometers, or compact bar indicators.

**Pointer Styles (`pointerType`)**:
- **Needle (`needle`)**: classic instrument pointer with center circular pivot boss, tapered needle blade, and customizable needle color (`needleColor: "#ef4444"`), width, and length.
- **Track (`track`)**: progress arc/bar filled with color (theme palette, gradient, or dynamic threshold color).
- **Combo (`combo`)**: both filled progress track and high-precision needle pointer rendered simultaneously.

**Bounds & Scale**:
- **Lower bound (`min`)** and **Upper bound (`max`)**: strict bounds clamping with configurable tick intervals (`tickInterval`) and sub-ticks (`subTicks`).
- Number formatting with unit display (e.g. `°C`, `bar`, `RPM`, `kW`, `%`).

**Threshold Alert Zones (`thresholds`)**:
- Array of zones: `[{ from: 0, to: 70, color: "#10b981", label: "Normal" }, { from: 70, to: 85, color: "#f59e0b", label: "Warning" }, { from: 85, to: 100, color: "#ef4444", label: "Critical" }]`.
- Configurable zone style: `colorTrack` (colorizes the gauge track), `colorNeedle` (changes needle color to match current zone), or `outerBand` (colored boundary stripes along the outer bezel).

**Target Setpoint Marker (Power BI style)**:
- Optional `target` setpoint (e.g. `target: 80`): renders a crisp contrast marker tick and label indicating the target benchmark or alarm trip point.

**Logic Actions**:
- `setValue({ value })` or direct scalar `msg.payload = 78.5`.
- `setTarget({ target })`.
- `setThresholds([{ from, to, color, label }])`.
- `export({ format: "csv" | "xlsx" | "png" })`.

**Logic Events**:
- **On Threshold Exceeded** `{ value, previousValue, zone: { from, to, color, label } }`: fires when entering an alarm or warning zone.
- **On Click** `{ value, min, max, target }`.

#### Gauge Function Node Examples

##### 1. Simple Live Value Feed
```js
// Sends instantaneous temperature or pressure value
msg.payload = 78.4;
return msg;
```

##### 2. Dynamic Update with Target and Custom Thresholds
```js
// Updates reading along with dynamic setpoint and alarm bands
msg.payload = {
    value: 84.2,
    target: 80.0,
    thresholds: [
        { from: 0, to: 70, color: "#10b981", label: "Optimal" },
        { from: 70, to: 85, color: "#f59e0b", label: "High" },
        { from: 85, to: 100, color: "#ef4444", label: "Critical Alarm" }
    ]
};
return msg;
```

---

### Area & Stacked Area Chart (`nexa-ui-area-chart`)

Continuous time-series area visualization built on top of the high-performance `TimeChartElement` engine (shared with Line Chart), providing smooth, hardware-accelerated cumulative and distribution graphics.

**Modes (`mode`)**:
- **Standard (`standard`)**: each series renders an independent continuous filled region down to the zero baseline, with customizable linear gradient fade (`fillType: "gradient"`) or solid color (`fillType: "solid"`).
- **Stacked (`stacked`)**: series values stack cumulatively on top of one another along time, showing total volume, energy load, or network throughput ($\sum Y_i$).
- **100% Stacked (`stacked100`)**: stacks normalize to 100% relative percentage over time, showing shifting proportions across components or power sources.

**Engine Capabilities**:
- Zero-GC Float64 time-series ring buffer (`TimeSeriesRingBuffer`) capable of maintaining 1,000,000+ points without frame drops.
- Interactive time ruler, zoom & pan gestures, time window selector (`"1h"`, `"24h"`, `"7d"`), and live follower.
- Multi-series inspector, hover crosshair, and rich tooltip showing series values and cumulative stack total.

**Logic Targeting (`target: true`)**:
- Each series has its own Update node and actions: `appendPoints`, `replacePoints`, `clearPoints`, `show`, `hide`.
- Chart-level action: `setChartData({ series: { s1: [...], s2: [...] } })` or direct array `[{ time, s1, s2 }, ...]`.
- Export: CSV, Excel (`.xlsx`), and 2× sharp PNG.

#### Area Chart Function Node Examples

##### 1. Direct Time-Series Multi-Data Payload
```js
// Sets historical points for multiple series at once
const now = Date.now();
const H = 3600000;

msg.payload = {
    series: {
        "solar": [
            { x: now - 3 * H, y: 120 },
            { x: now - 2 * H, y: 340 },
            { x: now - 1 * H, y: 480 },
            { x: now, y: 390 }
        ],
        "grid": [
            { x: now - 3 * H, y: 250 },
            { x: now - 2 * H, y: 180 },
            { x: now - 1 * H, y: 90 },
            { x: now, y: 140 }
        ],
        "battery": [
            { x: now - 3 * H, y: 50 },
            { x: now - 2 * H, y: 80 },
            { x: now - 1 * H, y: 110 },
            { x: now, y: 60 }
        ]
    }
};
return msg;
```

##### 2. Streaming Real-Time Points (Live Append)
```js
// Appends a single new timestamp point to all series
const timestamp = Date.now();

msg.payload = [
    { seriesId: "solar", x: timestamp, y: Math.floor(300 + Math.random() * 50) },
    { seriesId: "grid", x: timestamp, y: Math.floor(150 + Math.random() * 30) },
    { seriesId: "battery", x: timestamp, y: Math.floor(80 + Math.random() * 20) }
];
return msg;
```

---

### Sparkline (`nexa-ui-sparkline`)

Compact micro-trend chart designed for space-constrained interfaces: KPI stat cards, table rows, equipment summary tiles, and status headers.

**Types (`type`)**:
- **Area (`area`)**: smooth filled micro-area trend with soft gradient baseline.
- **Line (`line`)**: sharp, minimalist trend stroke.
- **Bar (`bar`)**: micro vertical columns for discrete intervals or periodic deltas.

**Smart Visual Highlights**:
- **Dynamic Trend Coloring (`trendColor: true`)**: automatically styles the sparkline with success green (`#10b981`) if the overall trend is ascending ($Y_{last} \ge Y_{first}$) or danger red (`#ef4444`) if descending.
- **End Value Glow Dot (`showLastDot: true`)**: glowing accent marker at the latest point.
- **Min / Max Peak Markers (`showMinMax: true`)**: subtle indicator dots on the lowest and highest values in the sequence.
- **Micro Tooltip**: lightweight floating tooltip showing point value and index on hover.

**Logic Actions**:
- `setData({ data: [10, 20, 15, 30] })` or direct array `msg.payload = [10, 15, 22, 18, 35]`.
- `appendPoint({ value })`.
- `clear()`.

#### Sparkline Function Node Examples

##### 1. Direct Numeric Array
```js
// Feeds a sequence of recent sensor readings or hourly trend
msg.payload = [23.1, 24.5, 23.8, 26.2, 28.0, 27.4, 29.8, 31.2];
return msg;
```

##### 2. Streaming Live Point Append
```js
// Appends newest reading to live sparkline buffer (maintains sliding window)
msg.payload = {
    action: "appendPoint",
    value: 28.5 + (Math.random() * 2 - 1)
};
return msg;
```

---

### Chart (`nexa-ui-chart`)

The Cartesian chart, built in **layers**: every series is a column, line, step, area or points chart of its own, on any axis, in any stack. The first of the new chart family (see `.agents/CHART_FAMILIES_DESIGN.md`); Line and State Timeline stay as they are. It draws like the Line Chart (smooth monotone curves, gradient fills, a dashed crosshair, the time ruler) in a Power BI style format pane.

**Data: rows, split by a field.** Logic (or a bound list) gives rows `[{ hour, floor, kwh }]`; in *Data* you say the **X field**, the **Y field** (several, comma separated: the wide form) and **Split into series by** (`floor`): one series per floor. The x is detected: a category, a number, or a **time** (epoch ms / seconds, an ISO text). Per series, Logic can also **Set data**, **Set a point**, **Append a point**, Clear, Show, Hide; a series can have a **Live value** (a tag). Actions of the chart: **Set rows**, **Append rows**, Clear, Export, and for a time x the Line Chart's (Follow live, Show a range, annotations).

**A time x keeps every point** in Float64 ring buffers with the LOD of the Line Chart (up to 2 000 000 a series, 16 bytes a point): lines are drawn at pixel accuracy (M4), columns and stacks group the points into columns of the width the screen allows (average, sum, min, max or last), and the time ruler, zoom / pan, Live, annotations and the refresh ticker are the Line Chart's.

**Layers.** A series' own fields: mark, axis, stack, colour, opacity, curve, line width and dash, fill, markers, corner radius, data labels, unit, notation, decimals. The chart-level *Visual* settings are only the **defaults** of a series that leaves its field empty.
- **Axes** (a list): any number, left or right, linear or logarithmic, soft and hard min / max, notation, decimals, gridlines, label colour. A series, a stack and a reference line pick one by Id (empty: the first).
- **Stacks** (a list): add a stack, then pick it in each series' **Stack** field; the order of the series is the order of the pile (the first at the bottom). A stack owns its **mode** (stacked, 100 %, side by side, overlapping), its **axis** (every member is on it: a sum is only meaningful on one scale) and its **place** (beside the other stacks, or over them, narrower: a target over an actual). *Any marks stack together*: a column is a rectangle from its base to its top, an area a band, a line or points sit at the cumulative top ("the total so far"). **Also every other series of the data** puts the series that came from the split field and are listed nowhere into the stack: the floors of a building, however many. Tooltips and labels show a series' own value, plus a Total for a pile.
- Series in no stack: *Visual -> Series in no stack* (side by side, one pile, 100 %, overlapping).

**The format pane:** Data · Series · Stacks · Axes · Visual · Title · Legend · X axis · Time axis · Data labels · Tooltip · Reference lines · Zoom & pan · Annotations · General · Export. Legend: six positions (also inside any corner), a value next to the name (last, total, average, min, max), click hides (Alt+click: only this one). Tooltip: every series at that category / x, or only the one under the cursor. Reference lines and bands on any axis.

**Colours**: every colour field takes a **hex** or a **theme token** (the ◆ picker: `{token:colors.red.solid}`); empty = the theme's chart palette (`colors.chart.1...14`, Theme & Styling). Status colours (a reference line) are the theme's `error`.

Not yet: a table legend, tooltip templates, per-series conditional colours (thresholds, value mappings), readouts (a big current value anywhere), SPC; the Stacks field is a pick-from-the-series field (a nested "add child" editor comes later).

### Histogram (`nexa-ui-histogram`)

Distribution and frequency analysis chart for quality control (QC), manufacturing tolerances, and Six Sigma Statistical Process Control (SPC).

**Binning Modes (`binMode`)**:
- **Automatic (`auto`)**: Automatically chooses the optimal bin interval width using the **Freedman-Diaconis rule** ($h = 2 \cdot \text{IQR} \cdot N^{-1/3}$) with fallback to Sturges' formula.
- **Fixed Count (`count`)**: Divides the data range into an exact number of boxes (`binCount: 15`).
- **Fixed Width (`width`)**: Segments data into fixed interval widths (`binWidth: 5` unit intervals).
- **Bounds**: Optional `binMin` and `binMax` limits.

**Quality Control & Six Sigma Capabilities**:
- **Normal Distribution Curve (Gaussian Bell Curve Overlay)**:
  - `showNormalCurve: true`: Calculates the mean ($\mu$) and standard deviation ($\sigma$) of the sample and plots the theoretical Gaussian probability bell curve scaled to bin counts.
- **Specification Limits (LSL, Target, USL)**:
  - `lsl`: Lower Specification Limit (dashed red line).
  - `target`: Target setpoint (solid/dashed green line).
  - `usl`: Upper Specification Limit (dashed red line).
  - `highlightOutOfSpec: true`: Bins outside the specification limits are automatically highlighted with danger color (`#ef4444`) to immediately isolate defects.
- **Real-Time Capability Metrics ($C_p$ & $C_{pk}$)**:
  - The stats bar automatically computes and displays:
    - **$N$**: Total sample count.
    - **Mean ($\mu$)** and **Std Dev ($\sigma$)**.
    - **$C_p$**: Process capability potential ($(USL - LSL) / 6\sigma$).
    - **$C_{pk}$**: Process capability index ($\min((USL - \mu)/3\sigma, (\mu - LSL)/3\sigma)$) with color badge (Green $\ge 1.33$, Amber $1.00 - 1.33$, Red $< 1.00$).

**Multi-Series Comparison**:
- Compare distributions across shifts ("Shift 1" vs "Shift 2") or equipment lines with semi-transparent overlapping bins.

**Logic Actions & Events**:
- **Actions**:
  - `setData(rawNumericArray)`: Replaces data with raw numbers (`[23.1, 24.5, ...]`).
  - `appendValue({ value })`: Appends single point to sliding sample buffer (sliding window).
  - `setBinnedData([{ binStart, binEnd, count }, ...])`: Replaces bins with pre-aggregated SQL/backend intervals.
  - `setLimits({ lsl, target, usl })`: Dynamically updates quality tolerance limits.
  - `clear()`: Clears all data.
  - `export({ format: "csv" | "xlsx" | "png" })`.
- **Events**:
  - **On Bin Click** `{ binStart, binEnd, count, percent, outOfSpec }`: Triggers drill-down inspections or table filters.
  - **On Out of Spec** `{ value, lsl, usl, seriesId }`: Fires alarm when a defect point or bin is detected.

#### Histogram Function Node Examples

##### 1. Batch Product Weight / Dimension QC Test
```js
// Sends 50 random sample bottle weights around 500g target
const samples = [];
const mean = 500, std = 2.0;

for (let i = 0; i < 60; i++) {
    // Normal distribution sample
    const u1 = Math.max(1e-6, Math.random());
    const u2 = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    samples.push(Number((mean + z * std).toFixed(2)));
}

msg.payload = samples;
return msg;
```

##### 2. Streaming Real-Time Sensor Value
```js
// Pushes single temperature reading into sliding buffer (auto re-bins)
msg.payload = {
    action: "appendValue",
    value: Number((24.0 + (Math.random() * 4 - 2)).toFixed(2))
};
return msg;
```

##### 3. Pre-Binned SQL / Backend Result
```js
// Directly feeds pre-calculated distribution buckets from SQL GROUP BY
msg.payload = [
    { binStart: 0, binEnd: 10, count: 5 },
    { binStart: 10, binEnd: 20, count: 28 },
    { binStart: 20, binEnd: 30, count: 85 },
    { binStart: 30, binEnd: 40, count: 140 },
    { binStart: 40, binEnd: 50, count: 92 },
    { binStart: 50, binEnd: 60, count: 22 },
    { binStart: 60, binEnd: 70, count: 3 }
];
return msg;
```

##### 4. Handling Bin Click for Defect Drilldown
Connect a Function Node to the `On Bin Click` event of `nexa-ui-histogram`:
```js
// Payload: { binStart, binEnd, count, percent, outOfSpec }
const bin = msg.payload;

if (bin.outOfSpec) {
    node.warn(`Alert: Operator clicked Out-of-Spec bin [${bin.binStart} - ${bin.binEnd}] containing ${bin.count} rejects!`);
    // Filter defect log table
    msg.filter = { min: bin.binStart, max: bin.binEnd, status: "REJECT" };
    return msg;
}
```

---

## The look

Nexa UI's look is based on **IBM Carbon**: sharp and clear, made a little softer (4px corners, clear focus rings, a little depth on tiles and menus). You can tell it apart by:

- **fields** with a gray fill and a line along the bottom; a 2px ring when focused;
- **buttons** with the text on the left and the icon on the right (Primary / Secondary / Tertiary / Ghost);
- small, slightly spaced-out **labels** (12px) above the controls;
- a **checkbox** filled with the text colour, a **green toggle**, a **content switcher** whose chosen segment is inverted;
- **notifications** with a coloured bar on the left and a light tint behind them;
- **IBM Plex Sans** for text and **IBM Plex Mono** for numbers and readouts (Stat, the slider's value, times).

IBM Plex comes with the package (`dist/fonts`, SIL Open Font License, see `OFL-IBM-Plex.txt`). The dashboard's default theme uses the Carbon palettes (blue 60 `#0f62fe` as primary, the Carbon grays) and Carbon's White and Gray 100 as light and dark. If you want another look, change the theme (Theme tab) or install another UI-library plugin.

## Install

Put the package next to `@kufayeka/node-red-nexa-dashboard` (it needs the dashboard's SDK) and restart Node-RED:

```
npm install @kufayeka/nexa-component-ui-library   # or: copy the folder into node_modules/@kufayeka/
```

The plugin serves `dist/` to the editor and to every deployed page. Nothing to configure.

## Every property is data-driven

The SDK's property kit does this for every field of every component, with no code in the component:

| In the panel | What it does |
| --- | --- |
| **⛓** | Binds the prop to a **Variable**, a **Tag** (Sparkplug, OPC UA…), the **Message** (`{msg.payload.x}`) or an **Expression** (`"Line {line}: {speed} rpm"`). A bound prop has a **Fallback**, shown while the binding has no value. |
| **📱** | A value **per breakpoint** (xs … 3xl, the Breakpoints tab), e.g. Size `lg` on the desktop and `sm` on a phone. |
| **◆** | A **theme token** instead of a value: colours, font sizes, weights, spacing, radii (`{token:colors.primary.solid}`). It follows the app's theme and light / dark. |

**Form controls read and write their value (two-way):**

- **Value (read)** — a tag, a variable or the message — is what the control shows.
- **Value (write)** is where the user's change goes. Empty: back to Value (read). A Slider bound to `{speed}` changes `{speed}`, and everything bound to `{speed}` follows.
- Unbound, a control keeps its own value, starting at **Default value**.
- Text fields write on Enter (or on leaving the field), with validation, a pending state until the tag confirms it, and a write error shown under the field.
- Every control has **On Change** (Logic) with `msg.payload.value`. Some have more: On Click, On Complete (Pin Input), On Slide, On Open / On Close (Select), On Action (Card, Empty State), On Close (Alert, Tag).

**The field** of a form control is built in: Label (top or left), Helper text, Invalid + Error text (bind Invalid to a check), Required (`*`).

**Options** (Radio Group, Segmented, Select, Combobox) come from the Options list, or from data: bind **Options from data** to an array (strings, or objects with the value / label fields named in Content). The Timeline's steps work the same way.

## How it looks, and how to change it

A component's structure is the library's: accessible (keyboard, focus, ARIA; the Select, Combobox, Slider, Tags / Pin Input and Rating use zag.js through the SDK) and consistent. You change its look in three layers, from the most common to the most special:

1. **Its props**:
   - `variant`:
     - for a button: solid (primary) / secondary / outline (tertiary) / ghost / subtle / plain (link);
     - for a field: filled / outline / flushed;
     - for a checkbox, radio, segmented control or slider: neutral / brand (palette);
     - for an alert: inline / subtle / outline / solid (high contrast);
     - for a card: tile / accent / outline / elevated;
   - `size` (xs … xl: height, padding, font, icons);
   - `colorPalette` (any palette of the theme: primary, gray, red, green…);
   - `radius` (a radius token).
2. **The app's theme** (the Theme tab). Every colour and size here is a design token. Change the primary palette and every primary button follows; switch to dark mode (`$colorMode`) and everything follows.
3. **Custom CSS** (the component's *Custom CSS* tab):
   - the **base CSS**;
   - one CSS per documented **part**, e.g. Button → *The button*, *Its text*; a field → *Root*, *Label*, *Control*, *Helper / error text*, *The box*.

   Write declarations (`letter-spacing: 0.05em;`). They win over the library's own styles. Use the theme's CSS variables to stay themeable: `color: var(--nexa-colors-fg-muted);`.

## Build your own UI library

This package is the template. Keep the same structure, and take **everything** from the SDK, never from npm or a CDN: Lit (`html`, `css`), `defineComponent`, `NexaElement`, `FieldController`, `theme`, `zag`, `assetUrl`.

```
my-nexa-ui/
  package.json              "node-red": { "plugins": { "my-nexa-ui": "widgets/plugin.js" } }
  widgets/plugin.js         require("@kufayeka/node-red-nexa-dashboard/sdk/package")(RED, { id, name, dir, modules: ["index.js"] })
  widgets/plugin.html       <script type="module" src="my-nexa-ui/vendor/index.js"></script>
  dist/index.js             imports your modules
  dist/core.js              your shared pieces (see below)
  dist/form.js, display.js  defineComponent(...) calls
  test/browser.test.js      withHarness(...) from the SDK testkit
```

**`dist/core.js` holds what every component shares.** Use this library's as a start:

- **Common props** — `sizeProp()`, `paletteProp()`, `variantProp()`, `radiusProp()`, `FIELD_PROPS`. Give a size prop `tokens: "fontSizes"` (or `"spacing"`, `"radii"`) and the panel offers the tokens.
- **`BASE_CSS`** — the size scale as CSS variables on `:host([data-size=…])`, the field's layout.
- **`UIElement`** (extends `NexaElement`) — sets `data-size` / `data-variant` on the host and the palette as `--cp-solid`, `--cp-subtle`, `--cp-fg`… (`applyPalette`). It also sets the semantic colours `--fg`, `--bg`, `--bd`… (`applySemantic`), each the theme's CSS variable with its value in the current mode as the fallback.
- **`ValueState`** — the two-way value of a control that is not a text field: bound, pending, local.
- **`field()`** — the label / helper / error around a control. **`part()`** — a Custom CSS part.
- **Icons** as inline SVG. Font Awesome does not reach into a shadow root.

**A component, in short:**

```js
import { defineComponent, html, css } from "../../nexa-sdk/nexa-component-sdk.js";
import { UIElement, BASE_CSS, sizeProp, paletteProp, variantProp, part } from "./core.js";

export const chip = defineComponent({
    id: "my-ui-chip", label: "Chip", category: "My UI", icon: "fa fa-circle", size: { w: 100, h: 32 },
    cssGroup: "Custom CSS", css: "",
    properties: {
        text: { type: "string", default: "Chip", group: "Content" },
        variant: variantProp([{ value: "solid", label: "Solid" }, { value: "subtle", label: "Subtle" }], "subtle"),
        size: sizeProp("sm"), colorPalette: paletteProp("gray"),
        gap: { type: "number", default: "{token:spacing.2}", tokens: "spacing", unit: "px", group: "Style" }
    },
    events: { click: { label: "On Click" } },
    parts: { chip: part("The chip", "chip") },
    view: class extends UIElement {
        static styles = [BASE_CSS, css`
            .c { display: inline-flex; gap: var(--g); padding: 0 var(--px); border-radius: 9999px; }
            :host([data-variant="solid"]) .c { background: var(--cp-solid); color: var(--cp-contrast); }
            :host([data-variant="subtle"]) .c { background: var(--cp-subtle); color: var(--cp-fg); }`];
        render() {
            return html`<span class="c" part="chip" style="--g:${this.p.gap}px" @click=${() => this.fire("click")}>${this.p.text}</span>`;
        }
    }
});
```

**Rules that keep a library consistent:**

- **Colours come from the palette roles or the semantic colours**, never hard-coded: `--cp-solid`, `--cp-contrast`, `--cp-subtle`, `--cp-muted`, `--cp-fg`, `--cp-border`, `--cp-focusRing`; `--fg`, `--fg-muted`, `--bg`, `--bg-muted`, `--bd`, `--panel`, `--err`. Then light / dark and the app's theme work by themselves.
- **Sizes come from the size scale**: `--h`, `--px`, `--gap`, `--fs`, `--icon`, `--r`.
- **Defaults that are design decisions are tokens**: `{token:colors.fg}`, `{token:fontSizes.2xl}`, `{token:radii.md}`. The SDK resolves them in the current mode, also when the host did not.
- **Every visible piece has a `part="…"`** and, if users may restyle it, a `part()` entry.
- **Behaviour** — keyboard, focus, ARIA — comes from the platform (native inputs) or zag.js (`zag.ZagController`, `zag.spread`). See docs/SDK.md §11c of the dashboard.
- **Test in a real browser** with the SDK testkit: `NexaTest.mount`, `setTag`, `setVariable`, `setMode("dark")`, `item().writes / events`.

## Tests

```
npm test                       # the plugin lint, then 63 headless-Chrome tests (build the dashboard first: npm run build there)
npm run test:chart             # charts end to end: a real Node-RED, the charts driven by Logic, live tags, exports
node test/tags-e2e.test.js     # tags end to end (~1 min): a real Node-RED, MQTT broker and Sparkplug edge
```

`test:chart` checks the Line Chart and the State Timeline on a real page:
- each series' / row's own Update node (append / replace / set states);
- events to Logic (threshold crossed, stale / resume, state change, range change);
- a live Sparkplug tag;
- exports started from Update nodes (CSV / Excel / PNG, the downloads captured and read).

`tags-e2e` starts its own Node-RED in the temp folder on ports 1899 / 1898 and an MQTT broker (aedes) on 1893. It never touches your `data/`. A simulated Sparkplug edge answers each write like a PLC: it applies it and reports it back.

It checks every component that reads or writes a tag, both on the screen and inside a Tabs panel:
- the tag's value is shown;
- a change at the device shows;
- the user's input is written with the right value and format (a tag holding JSON text gets JSON text back);
- the echo is shown;
- when the device dies, the value shows `???`, and it comes back on rebirth.

**Run it after any change to a component's tags.**

It covers:

- every component registers and draws, with no console error;
- the two-way value of every form control;
- the zag widgets by pointer and keyboard;
- the theme's palettes, tokens and dark mode;
- the inspector (⛓ / ◆ on the fields, the tabs).
- the charts: data shapes, item actions and events, statistics, tooltips, export, the editor's zoomed canvas, gestures (wheel, touch), print.
