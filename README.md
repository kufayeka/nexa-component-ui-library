# @kufayeka/nexa-component-ui-library — Nexa UI

A themed component library for **Nexa Dashboard**: 43 form, display, feedback, navigation, layout and chart components. It is a normal Nexa plugin, built only on the Nexa component SDK, so it is also the example to follow when you **build your own UI library**.

- **Form**: Button, Input, Textarea, Number Input, Password Input, Date Time, Date Range, Checkbox, Switch, Radio Group, Segmented Control, Select, Combobox, Slider, Tags Input, Pin Input, Rating.
- **Display & feedback**: Text, Heading, Badge, Tag, Card, Avatar, Stat, Alert, Progress (a bar or a circle), Spinner, Skeleton, Separator, Empty State, Timeline, Fieldset.

- **Layout & Navigation**: Tabs — each tab has a panel you drop components into (the SDK's *slots*); Pagination — IBM Carbon-inspired pagination bar.
- **Embed**: Iframe — another web page (Grafana, a camera, a report), with Logic both ways.
- **Charts**: Line Chart (time series, an axis per series or axes the series share, thresholds, 1 M+ points), State Timeline (machine states, statistics), Bar Chart (grouped / dempet, stacked, 100% stacked, and Pareto 80/20 analysis), Pie / Donut Chart (categorical proportions, center KPI, auto "Others" grouping), Radial & Linear Gauge (dial / linear meter, needle pointer, bounds, threshold zones, target marker), Area & Stacked Area Chart (cumulative volume/flow, 100% stacked, time ruler), Sparkline (compact KPI trend indicator for cards and tables), and Chart (the Cartesian chart: columns / bars / lines / areas / points, stacked or side by side, rows split by a field), and Histogram (statistical distribution and frequency analysis, Freedman-Diaconis binning, normal Gaussian curve overlay, and Six Sigma Cp/Cpk tolerance limits). All are driven item by item from Logic, export CSV / Excel / PNG, and print as they look.

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
  - **Show the last …** (`{span: "8h"}`): live, that span (as a range button);
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
- **Data settings:** points kept, **When data is missing** (as the chart, or its own) and cut the line after N ms of silence, stale after N ms, and a **time shift** (yesterday over today).
- **Look:** interpolation (linear / smooth / step / **automatic** / bars / points), step mode (after / before / center), colour (a hex or a theme token), width, dash, opacity, fill, points.
- **Value texts** (its Axis › Numbers): `0=Off, 1=Run, 2=Fault`: the tooltip, the legend and the last value show the text, and the axis ticks are those values (Off / Run), not round numbers.
- **Its Y axis:** **Own axis** (its own scale and axis: position left / right / hidden, title, unit; Range: soft / hard min / max, **zero in the middle** for − and +; Numbers; Spine) or **an axis of the chart's Axes list** that other series share (below).
- **Tooltip:** simple (label, text before / after the value) or an **expression**:
  - `{value} {delta} {min} {max} {avg} {name} {unit} {time}`;
  - `[series]{s2}`: another series at that time, e.g. `round({value} / [series]{flow} * 100, 1) "%"`;
  - `fmt(x, "compact" | "si")`.
- **Id:** fixed (`s1`, `s2`…), the id its nodes use.

**Y axes: own, or shared (the Axes list):**
- By default every series has **its own axis and scale** (Own axis). Several on one side stand side by side; **the first series in the list is closest to the chart**.
- The chart's **Axes** list (its own group in the Inspector) holds axes **any number of series can share**. A series picks one in its **Axis › Y axis** (Own axis, or an axis by name). **Series that pick the same axis are one**: one scale that covers all of them, one drawn axis. Own and shared mix freely: two series on "Power kW", one on "Temperature", one Own.
- An axis has: Name, Id (fixed, `a1`, `a2`…), Colour, Position (left / right / hidden), Title, Unit, Range (soft / hard min / max, zero in the middle), Numbers (its ticks), Spine. Its limits win; a series' own limits are not used while it shares.
- A series that is on an axis shows its own axis fields (Position, Title, Range, Spine) no more; its **Unit, Numbers and Value texts** stay, they are what its tooltip and legend show. A series that names an axis the list no longer has is on its own axis again, nothing is lost.
- With more than one axis, an axis' labels (and its title) take the colour of its series; a shared axis takes its own Colour, else its series' colour when it has just one, else the text colour. A single axis stays neutral.
- A threshold follows the scale of the series it names (on a shared axis: the shared one). Hide every series of an axis and the axis goes.
- Column widths come from the widest label; `axisGap` (Style) is the space between columns.
- The Inspector: the series' **Axis** section (Y axis first; Range, Numbers and Spine inside it) and the chart's **Axes** group.
- Each series has its own Update node in Logic: its axis, range and style can change at runtime. Charts saved before the Axes list are unchanged (the list is empty, every series Own).

**When data is missing** (Line, Area and the Column Chart's lines on a time x; the chart's **Data** group, a series can say its own):
- **A 0 is a value, `null` / `undefined` / `""` / a word is MISSING.** A machine that is off and sends 0 is drawn at 0. A value that is missing is no point (it never becomes a 0): the chart remembers when it was missing.
- The chart's **When data is missing**: **Connect** (the default: the line runs across the hole, as before), **Gap** (the line is cut there) or **Gap with a dashed bridge** (cut, and a thin dashed line across the hole says that data is missing).
- **Cut the line after silence (ms)**: with Gap / Bridge, no data for longer than this also cuts the line (a sensor that is switched off sends nothing, not a `null`). 0 = only a missing value cuts it. A series has its own value (0 = the chart's).
- A series can say **Connect**, **Gap** or **Bridge** itself (**As the chart** is the default). A series saved with a "break the line after" and no setting still cuts its line, as it did.
- A live value (a tag) that turns `null` / `undefined` after a value is missing from then on (once), and the next value is a point again. `{ "x": ..., "y": null }` in Append / Set points is missing at that time.
- Area, stacked: a series that is cut adds nothing to the stack in its hole.
- Stats, min / max, thresholds and exports use the points only: a missing value is not in them.

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
- `auto` (Automatic): a step while every value of the series is a whole number (on / off, counters, modes), else linear;
- Can be set per series (`variant` / `interpolation`) or chart-wide as default (`defaultInterpolation`).

**Range buttons** (Zoom & pan › *Range buttons above the chart*): a row of spans above the plot (`15m, 1h, 8h, 24h, 7d` by default, any list in *Buttons*); one click shows that span live. Zoomed or panned, a **Now** button brings the newest data back (live: a *Live* mark). The viewer's choice is not saved; Logic does the same with **Show the last …**.

**Zoom & pan:** zoom in / out to at most N, move only where there is data (or within the last N, or anywhere), room after the newest point.

**Gestures** (every time chart: Line, State Timeline). A page full of charts must still scroll:
- **Page first** (default): the mouse wheel and one finger scroll the page, also over a chart. **Ctrl / ⌘ + wheel** (or a trackpad pinch) zooms, a mouse drag pans. On a touchscreen **two fingers** pinch-zoom and pan, a **tap** shows the tooltip (a tap elsewhere hides it). A short hint says so when a plain wheel or one finger moved the page instead. The same rule as a Zoom frame in Nexa Dashboard.
- **Chart first**: the wheel zooms and one finger pans (the page does not scroll through the chart). For a chart that fills an HMI screen. Y axes have **soft** min / max (they grow with the data) and **hard** min / max (fixed).

**Legend** (a part every chart shares, `legend.js`):
- **where**: below, above, right, left, or **inside** the plot in a corner (it keeps to the plot, clear of the axes, the ruler, the ⋮ menu and the last values);
- **a list** (the name and one value: last / min / max / average) or **a table** (a row per series, columns Last / Min / Max / Average, each column on or off);
- min / max / average are over the time shown; click hides a series, Alt+click shows it alone; text size.

**Thresholds** (on the scale of the series each names):
- a **line** (a setpoint), an **upper** or a **lower limit** (a limit colours the values past it in Excel; *Shade past the limit* tints the area beyond it), a **band** from Value to To (a normal range, a target zone);
- the colour is a hex or a theme token; empty: the theme's status colour (limit: error, band: warning, setpoint: info);
- a series crossing a line, a limit or a band's edge fires its **On Threshold Crossed**.

**Last value** (Style › *Last value at the end of each line*): the newest value of each series in a label of its colour at the plot's right edge (ISA-101: the value is always readable); labels that meet move apart; only while the newest point is in view.

**Also:**
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
- The colour is a hex or a theme token (the defaults: the theme's green / red / yellow); empty: the theme's chart palette.
- A value nobody defined shows in the theme's neutral colour, **hatched**, with its own text.

**One block per state.** The same state twice in a row is one block, from its first start to the next change:
- a repeated value is not stored again (Live state or **Append change** `run, run, run` = one Running block); a late change equal to the change after it takes that change's place (the block starts earlier); the first note is kept;
- values of the same state (81 and 85, both "High") draw as one block and count once.

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
- **Text in a bar** (when it fits): the state, the state and its duration (`Running · 2h 15m`), the duration, the value, or none.
- **Hide blips shorter than** N ms: a state shorter than that (a sensor chattering Run-Stop-Run) is drawn as part of the block before it. Only the drawing: statistics, the legend and exports keep every change.
- **Gaps and stale rows are hatched:** the time between intervals says *No data*; a row with **Stale after** N ms (its Data section) that got no value (or Append) for that long ends its state there and is hatched *Stale* up to now, instead of looking like it still runs. A source that sends changes only needs a heartbeat (an Append of the same state: it merges).
- **Current state chip** beside each row's name (`Stopped · 12m`, in the state's colour; *Stale* when stale). **The chip blinks in** a state you pick (Stopped, Fault): on a page, on screen, while a row is in it.
- **Statistics column** for each lane, over the time shown. Pick any of:
  - **%** of the time;
  - **total time**;
  - **count** (how often it entered the state);
  - **first** and **last**;
  - **now** (the current state and how long it has lasted);
  - a **share bar**: each state's part of the time, in its colour (availability at a glance).

  The state the statistics are about is selectable.
- **The look of the statistics:** the titles' size and colour, the figures' size and colour, and **a column's own look** (a list: pick a column, give it its size, weight and colour: the % big, bold and green as the focus point).
- **Widths:** the name column and the statistics as a % of the width (0 = as wide as their texts); the timeline takes the rest. **Show the timeline** off: only the names and the statistics, two columns (a table of availability per machine).
- **The names:** size, weight, colour, alignment (left / right), and **Wrap a long name** onto the next lines (as many as the lane is high; off: cut with …).
- **Tooltip** on a block: state, start → end, duration, note. On a touchscreen: a tap.
- **On Segment Click** `{ row, state, value, start, end, duration, note }` (the whole block), for drill-down.
- v1 charts: *The state's label in its bar* off becomes *Text in a bar: None*.
- **Legend** (the shared part): below / above / right / left / inside the plot; a list, or a **table of the states** with **%**, **Time** and **Count** over every row in the time shown. A click hides a state's blocks (Alt+click: only this one); the statistics keep it.
- **Range buttons** above the chart (15m … 7d) and **Now**, **annotations**, **zoom & pan**, the **time ruler / navigator**, **Follow live**: the same as the Line Chart.
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

### Column / Bar Chart (`nexa-ui-column-chart`)

Columns (or horizontal bars), lines and target markers over categories, numbers or time: energy per floor, output per shift, plan vs actual, a combo of kWh columns and a temperature line.

**A series is a Column, a Line or a Target**, on the **left** or the **right** axis. The chart's **Stack** is Off (side by side), Stacked or 100 %; each series says whether it is **In the stack**:
- a column in the stack sits on the ones before it (the first at the bottom); a column out of it stands **beside** the pile;
- a line in the stack is drawn at the **total so far** (the cumulative top); out of it, at its own value (a line has no width: it never stands "beside");
- a **target** is a short thick line across its category (the plan an actual column is compared with); it never stacks and its tooltip row says *(target)*.

**Data: rows, split by a field** (Power BI's legend field). Logic or a bound list gives rows `[{ hour, floor, kwh }]`; in *Data*: the **X field**, the **Y field** (several, comma separated: the wide form), **Split into series by** (`floor`). The x is detected: a category, a number or a **time**.
- A category x: **Category order** as they come / largest first / smallest first / A–Z / Z–A; **Show the top N** (by the total of the series) and **the rest as "Others"**.
- A time x: every point kept in Float64 rings (M4 + LOD, up to 2 000 000 a series); columns group the points into columns of the width the screen allows (average, sum, min, max, last); range buttons, the time ruler, zoom / pan, Live and annotations as the Line Chart.
- Per series (its own Update node): **Set data**, **Set a point**, **Append a point**, Clear, Show, Hide; a **Live value** (a tag). The chart: **Set rows**, **Append rows**, Clear every series, Export.

**The format pane:** Data · Series · Columns (default type, Stack, direction, fill solid / gradient, gaps, width, corner radius) · Lines (curve smooth / straight / step, width, markers) · Y axis · Secondary Y axis (title, log, soft / hard min / max, notation, decimals, gridlines, label colour) · X axis · Time axis · Title · Legend · Data labels · Tooltip · Thresholds · Zoom & pan · Annotations · General · Export.
- **Data labels:** the value, the % of its category (or of its stack), or both; outside / inside the end / centre / inside the base; **the total above a stack**.
- **Thresholds** (on the left or the right axis): a line, an upper / lower limit (*Shade past the limit*; **Colour the columns past it**: a column past the limit takes its colour), a band. Empty colour: the theme's status colour (limit: error, band: warning, line: info).
- **Legend** (the shared part): any position (also inside the plot), a value (Total, Average, Max, Min, Last) or a **table** of them; click hides a series (Alt+click: only this one), **On Series Toggle**.
- **Tooltip:** every series at that category (and the stack's total) or only the one under the cursor; a band or a dashed line behind the category.
- **Events:** On Point Click (a series' own, with the category and value), On Hover, On Series Toggle, and the time events.

Colours are a hex or a theme token; empty: the theme's chart palette. The editor shows sample data on an empty chart. It replaces the old Bar Chart and the layered Chart (2026-10-06, no migration: they were new); a Pareto chart comes later on the same engine.

### Pie / Donut (`nexa-ui-pie`)

Parts of a whole: downtime by reason, energy by area, output by product. **The rules of a good pie are its defaults** (each can be turned off):
- it starts at **12 o'clock** and runs clockwise, **the largest slice first**;
- past **the top N** (6 by default; 5 – 7 read well), and below **a share** you set, the rest is **one grey "Others" slice, always last**; a click on it **opens it** (its slices shown, a chip closes it); its tooltip lists what is in it;
- **a slice is never left without its label**: inside when it fits (the arc *and* the ring's thickness), else **outside on a leader line**; the labels are measured first and the pie sized to leave them room; on each side they move apart so they never overlap (the complaint about Power BI and Ignition pies);
- a **donut's centre** says **the total** (or a slice's %, or a text, with a line under it); **the slice under the pointer** while hovered.

**Data:** **slices**, the items of the shared value model (a Logic target each: Set value, a live tag, the figure over a window, stale; its colour, or a **status** colour: Running green, Stopped red), and/or **rows** from a query (`[{ reason, minutes }]`: the name and value fields, rows of one name added up / averaged / …); **a pie per (field)**: several pies side by side (the downtime of each machine). A listed slice styles the row of its name. **Set rows** from Logic.

**Look:** donut or pie, the ring width, **a half** (180°, opening down), the space between slices, rounded corners, a hovered slice moving out; labels: name / % / value (any mix), auto / outside / inside, size, % decimals.

**Legend** (the shared part): any position, a list (the % or the value) or a **table** (Value, %); a click hides a slice and the % are of the rest (**On Slice Toggle**). **On Slice Click** `{ name, value, percent, group, id }` (a listed slice also fires its own On Click). Export CSV / Excel (a row per slice) / PNG. In the editor: sample slices (*Sample data*). It replaces the old Pie & Donut Chart (2026-10-06, no migration).

**Rose (Pie, Shape):** *Radius by value* makes a Nightingale rose (equal angles, the radius by the value) or a pie whose angle and radius both follow the value (largest first: a spiral). The **area** follows the value (the radius by its square root), so twice the value looks twice as big; *The smallest slice keeps* a minimum radius. Labels, Others, the legend and clicks work as on a pie.

### Pareto (`nexa-ui-pareto`)

Which causes to fix **first**: downtime by reason, defects by type, scrap by cause. The rules of a Pareto are built in, with no DAX:
- the bars **largest first** (else the cumulative line means nothing), **Others last** whatever its size (past the top N);
- the **cumulative %** on its own axis 0 – 100 %, **ending at exactly 100 %** (from the running sum over the total, the last point forced: no rounding drift);
- a **cut-off line** (80 % by default; the chart shows the real split, it does not assume 80/20) with **"4 of 12 causes = 89 %"**; the **vital few** (up to the cut-off) strong, the trivial many faded;
- the left axis **aligned** to the right one (0 .. the total = 0 .. 100 %, the classic Pareto) or fitted to the largest bar.

**Data:** **rows** from a query (`[{ reason, minutes }]`, added up per category) or an **event log** (`[{ time, defect }]` with no value field: **counted** per category), over a **window** when the rows have a time (this shift, 24 h, 7 days, 30 days; **window buttons** for the viewer; **Set the window** from Logic); **Set rows** / **Append rows** (a new event). Or the categories as items of the shared value model (Logic targets, live values; a category styles the rows' category of its name: its colour or status).
- **Stacked:** a field splits each bar in parts (the defects per shift, per machine), with a legend.
- **Before / after:** a field gives a Pareto per group side by side **in the same category order** (last week and this week: the fix shows).

**Look:** vertical or **horizontal** (long names), the bar / faded / Others colours, the gap, rounded corners; the cumulative line straight / smooth / step / none, an area under it, markers, its % at each point; labels on the bars (value / % / both); axis titles, gridlines, unit, decimals. **Tooltip:** value, %, cumulative %, rank (Others: what is in it; stacked: its parts). **On Bar Click** `{ name, value, percent, cumulative, rank, group }` (a listed category also its own On Click). Export CSV / Excel (rank, value, %, cumulative %, vital few) / PNG. In the editor an empty Pareto shows sample causes (*Sample data*).

**Screenshots:** every chart in light and dark is in [`screenshots/`](screenshots/); `npm run screenshots` draws them again from the current code (the scripts are in `screenshots/scripts/`, one per chart, on the dashboard testkit's harness browser).

### Radar (`nexa-ui-radar`)

Several measures of one thing at a glance, and where it leans: a line's OEE parts, a shift against its target, production per tariff period. The rules that keep a radar honest are built in:

- **The axes in your order** (the order changes the shape; it is never re-sorted to look better), clockwise from the top. From the Axes list, or the rows' fields (wide) / axis names (long) in their order.
- **A fixed scale from 0** (a radar that rescales itself, or does not start at 0, exaggerates): one scale for all (set Max 100 for percentages), or **each axis its own** min / max when the units differ (kWh, pcs, %).
- **Lower is better** on an axis (scrap, energy per piece, changeover): turned round, so **outward = good** on every axis.
- **A target**: one value for every axis, an axis' own, or a series named as the target: a dashed polygon; the points short of it are red, the tooltip shows the difference. An axis' **good band** (from / to): a green stroke along it.
- **Up to 3 series overlaid**; past that (or always) **small multiples**: a radar per series, the columns that give the largest radars.
- **Look:** polygon or circle grid, rings and their values, straight / smooth lines or points only, fill, value labels, colours; at each axis its name, or its name and the first series' value.
- Data: rows wide (`[{ "series": "L11", "OEE": 82, "Quality": 97 }]`) or long (`{ series, axis, value }`), **Set series** / **Remove a series** from Logic, or each axis' live tag (one Live series). **On Point Click** `{ series, axis, value, percent, target, short }`, **On Series Toggle**. Legend part (average % of the scales, axes short of the target). Export CSV / Excel (with the Axes sheet) / PNG. Sample data in the editor.

### SPC / Control Chart (`nexa-ui-spc`)

Is the process stable (in control), and is it capable? Measurements or counts from rows (a query) or a live tag.

- **Chart:** I-MR, X̄-R, X̄-S, p, np, c, u, or **Automatic** (n = 1: I-MR, 2 – 9: X̄-R, 10+: X̄-S; defectives: p / np, defects: c / u). Subgroups: each reading, every N, by a field, per interval. The MR / R / S chart under it (can be off).
- **Limits from the process, not the spec:** σ within the subgroups (MR̄ / 1.128, R̄ / d2, S̄ / c4); from every subgroup, **the first N or a time range (locked**: a drifting process does not drag its limits along), or set values. A varying n: stepped limits. **Phases** (a field, or a list of names from a time): each its own limits, a divider.
- **Zones A / B / C**, ±1σ / ±2σ lines; **rules**: Western Electric, Nelson 1 – 8, or picked one by one; a point that breaks one in red with its number; the tooltip says it in words.
- **Spec** USL / LSL / target (on I-MR only: a subgroup mean is not a part). **Capability panel** (can be off): histogram, the within and overall curves, Cp, Cpk, Pp, Ppk (coloured by your thresholds), expected PPM, out of spec; for counts: % defective, PPM, yield / DPU.
- **Notes and exclusions live in your DB:** **On Point Click** `{ key, time, phase, value, rules, excluded, note }` → Logic saves → the `notes` / `excluded` props (or **Set notes** / **Set excluded**) bring them back: a flag on the point (**On Note Click**), an excluded point hollow and out of the limits. The chart keeps nothing.
- **On Violation** `{ key, time, value, chart, rules }` for a NEW point breaking a rule (not the ones there at load, once per point and rule): an andon, a mail.
- Logic: Set rows, Append rows, **Append value**, Reset the zoom, Clear. Drag pans, Ctrl + wheel zooms. Export CSV / Excel (Data, Capability, Rules sheets) / PNG. In the editor an empty SPC shows a sample process with a shift (*Sample data*).

### Scatter (`nexa-ui-scatter`)

How two variables move together and where the process window is: oven temperature against the reject rate, a motor's power against its temperature, pressure against flow.

- **Data:** rows (X / Y fields; group, size, colour value, label and time fields) over a window (window buttons, **Set the window**), or **two live tags**: a point each time one of them changes (kept up to a limit). Logic: **Set rows**, **Append rows**, **Reset the zoom**, **Clear**.
- **Every point is drawn**, not a sample: past a limit (20 000 by default, or always / never) the cloud is drawn as its **density** and the **outliers** (points with nothing near them) still as dots.
- **Points:** colour by group (the palette), by a value (a gradient) or by **time** (old points fade, a drift shows its trail); bubbles from a size field; circle / square / triangle / one shape per group; opacity; the newest live point marked.
- **Fit:** a line, a parabola, exponential or logarithmic, per group or for all, with its **equation and R²**; a line's 95 % confidence band. Around each group its 2 σ **ellipse** or its **hull**.
- **Reference lines and bands** on X or Y (a spec limit, the good window); **quadrants** at the means or at set values, with their names.
- **Axes:** linear or log, min / max, titles and units, gridlines.
- **Interaction:** tooltip (label, group, X, Y, time) and the nearest point ringed; **On Point Click** `{ x, y, group, label, index, row }`; **Shift + drag a box: On Select** `{ count, x0, x1, y0, y1, rows }` with **every** row inside it (the first 1 000 in `rows`); drag pans, **Ctrl + wheel** zooms (a plain wheel scrolls the page), a double click resets. Legend part (points per group, R²; click hides a group, Alt+click shows it alone). Export CSV / Excel (the fits on their own sheet) / PNG. In the editor an empty Scatter shows sample points (*Sample data*).

### Gauge (`nexa-ui-gauge`)

A dial per value (pressure, temperature, speed, load), several side by side. A **gauge** is an item of the shared value model, the same as a KPI tile (a Logic target: **Set value**, **Set history**, **Clear**; **On Gauge Click**, **On State Change**, **On Stale** / **On Resume**; a live tag; the figure over a window; value texts; a delta; a target, a setpoint, a normal band; threshold steps; stale), plus its **scale**: min / max, each **soft** (it grows with the data to a round number), and **the ghost**: the lowest .. highest over the window, faint on the track (the peak the value now hides).

- **The dial:** any sweep (180° a half circle, 240° / 270° a classic dial, 360° a ring starting at the top), the track's thickness and colour, rounded ends.
- **The pointer, in any mix:** a **fill** running along the arc (the step's colour, or its own), a **needle** (a line, a tapered blade, an arrow; its length, width, colour, a hub), a **triangle marker** running along the arc **outside** it (pointing in) or **inside** it (pointing out), its size and colour.
- **The scale:** major ticks **automatic, every N, or a list** (`0, 25, 80, 100`), minor ticks between them, **inside / outside / across** the track, their length, width and colour; labels inside or outside (value texts too).
- **The zones** (the threshold steps): a thin ring outside or inside the track, or the track itself coloured; the steps' labels on the dial.
- **The target** (a bar across the track and a triangle), **the setpoint** (dotted across it), **the normal band** (a ring inside the track).
- **The value** in the middle (auto-fit or a size, its weight, the text or the step's colour) with its unit and delta; under the hub on a half dial with a needle. The name above or below; a frame per gauge; columns and gaps.
- Export CSV / Excel (a row per gauge), PNG. In the editor an empty gauge shows sample data (marked *Sample data*).

### Bar Gauge (`nexa-ui-bar-gauge`)

A bar per value, many at once: the level of 12 tanks, the load of every motor. A **bar** is an item of the same value model (above, with its min / max, soft ends and the peak).

- **Horizontal** (the name left, the value right) or **vertical** (a tank: the value above, the name under it).
- **Modes:** **basic** (the bar in the colour of its step), **gradient** (the steps' colours blending along the bar), **LCD** (lit segments, each in the colour of the step it is in; segment size and gap).
- **The track** (the part not reached) and its colour, a **zone strip** along each bar (the steps), the corner radius, the thickness, the gaps.
- **Ticks** across the bars (automatic, every N, a list) and **a shared scale** under (or beside) them when every bar has the same min / max; else each bar's min and max at its ends.
- **The target** (solid) and **the setpoint** (dotted) across a bar, **the normal band** beside it, **the peak** over the window (a faint reach and a mark).
- The names (size, the column's width), the values (size; the step's or the text colour); **sorted** by value or name and **the top N**.
- **On Bar Click** and the other events, export CSV / Excel / PNG, the editor's sample.

The old *Gauge & Meter* (radial + linear in one) is replaced by these two (2026-10-06, no migration).

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

### KPI / Stat (`nexa-ui-kpi`)

Big values with their context (ISA-101: a value is never shown alone), one **tile** per value: a row of energy KPIs (kWh today, peak kW, power factor, cost), the output of a line against its plan. It replaces the old Sparkline (a KPI with the value hidden is a sparkline).

**A tile is a Logic target** (its own Update node, message and events), like a series of the Line Chart:
- **its value:** a **Live value** (a tag; every new value is a point, kept in a Float64 ring), or its Update node: **Set value** (`21.5` or `{ x, y }`), **Set history** (`[{ x, y }]`), **Clear**;
- **the figure shown:** the last value, or the **average / min / max / sum / change / count over a window** (the last 15 min, hour, shift, 24 h, 7 days);
- **numbers:** unit (drawn smaller after the value), notation, decimals, **value texts** (`0=Off, 1=Run`);
- **delta ▲▼:** against the previous value, **the same figure some time ago** (a 24 h sum against the 24 h before), or the target; as a % or a value; *up is good* (green) or bad (red);
- **context:** a **target** with a progress bar (`79 % of 12,000 pcs`), a **setpoint** (dashed on the sparkline), a **normal band** (shaded on the sparkline; outside it is a warning when there are no thresholds);
- **sparkline:** area / line / bars / none over the window, on a **fixed scale** when set (0 – 100 for a %: a small change looks small);
- **stale:** no data for N ms: the tile fades, *Stale · 5m*;
- **events:** **On Tile Click** `{ value, name }`, **On State Change** `{ from, to, value }` (into another threshold step), **On Stale** / **On Resume**.

**The chart:**
- **Layout:** columns (0 = as many as fit, a tile at least 180 px), the space between tiles, a tile = the value **above** its sparkline, **beside** it, or the sparkline **behind** it; left or centred; a frame per tile.
- **Value:** auto-fit (as big as the tile allows) or a size, its weight; the name's size; show the name / the value (off: a sparkline only).
- **Thresholds:** steps *from a value on* with a theme status colour (Good / Warning / Alarm / Info / Neutral) or its own colour, for one tile or every tile; **the colour goes to** the value's text, the tile's background, the sparkline only, or nothing.
- **Export:** CSV / Excel (a row per tile: value, unit, state, what is shown), PNG.
- In the editor an empty tile shows sample data (marked *Sample data*); a page with no data shows the tiles empty (—).

### Sparkline Function Node Examples

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
