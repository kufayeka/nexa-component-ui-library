# Rules for AI agents (and people) changing this plugin

This is a Nexa component plugin (`@kufayeka/nexa-component-ui-library`). Every change follows **the plugin rules**:
`@kufayeka/node-red-nexa-dashboard/docs/PLUGIN_RULES.md` (in this workspace:
`../node-red-nexa-dashboard/docs/PLUGIN_RULES.md`). Read it before you edit. The SDK reference is
`../node-red-nexa-dashboard/docs/SDK.md`.

## Before you edit (mandatory)

1. Say the change in one sentence, and pick its type (PLUGIN_RULES §8): new component, new prop, behaviour change, bug fix, removal, restyle, SDK change. One type per change.
2. Read the component's whole definition, `test/browser.test.js`, and what uses it.
3. A new component, or a change to what a component does on a page or how it looks, is the user's decision. Ask first.

## Red lines (never, unless the user said yes to that case)

- Rename, remove or retype a stored component id, prop key, input / output prop, event, action, slot, part or state. Changing a `default` counts too. The only way is `version` + `migrate` + a test (PLUGIN_RULES §5).
- Write an `inspector:`, import anything other than `../../nexa-sdk/nexa-component-sdk.js` and this plugin's `./x.js`, or use `NEXA.registerComponent`.
- Use `setInterval` (use `this.every`), network calls, browser storage, `eval`, `RED`, `document.querySelector` in `dist/`. A justified exception is written in the code: `// nexa-lint-allow <rule>: <reason>`.
- Edit another plugin, Node-RED core, or put component code into `node-red-nexa-dashboard`.
- Weaken or delete a test to make a change pass.
- Run anything against the user's `data/` or live Node-RED (1880 / 1881). Test in an isolated Node-RED (1899 / 1898).
- Commit with AI attribution, or push without being asked.

## Done means

- `npm test` is green. It runs `npm run lint` (`sdk/lint-plugin.js`) first, then `test/browser.test.js`.
- An SDK change: `node test/run-all.js` in the dashboard is green too, and every plugin's `npm test`.
- Tags, bindings or writes changed: `nexa-component-ui-library/test/tags-e2e.test.js` is green.
- Something visible changed: an e2e with screenshots you looked at.
- README updated (what each component does, its props, inputs, outputs, events).
- Memory updated with every progress update: an entry at the top of the workspace's `.agents/memory/history.md` (date, what, why, commits), plus a decision file for a new user decision.
- A bug fix comes with a test that failed before the fix.

## This plugin

- Modules:
  - `dist/`: containers.js core.js datetime.js display.js embed.js form.js pagination.js ui-library.js;
  - `dist/chart/`:
    - core.js (ChartElement: the shared look, numbers, times, the export menu);
    - time-chart.js (TimeChartElement: time, ruler, zoom / pan, the range buttons, annotations, gestures, the frozen clock, print);
    - props.js (the shared props / events / actions);
    - legend.js (the legend part: props, list / table markup, placement around / inside the plot; its look is in core.js CHART_CSS);
    - time.js, buffer.js, export.js (the xlsx writer);
    - rows.js, stack.js, curves.js (pure: rows -> columns split by a field, stacking, nice ticks, monotone curves; test/chart-pure.test.js, no browser);
    - line.js (Line Chart), state.js (State Timeline), column.js (Column / Bar Chart: columns, lines, targets; stack or side by side; the engine of the old layered Chart), pie.js (Pie / Donut: slices on ReadoutElement or rows; Others, labels that never vanish, small multiples), gauge.js (Gauge: dials on ReadoutElement), bargauge.js (Bar Gauge: basic / gradient / LCD bars on ReadoutElement), area.js (Area & Stacked Area Chart), readout.js (ReadoutElement: the base of the value charts: items as Logic targets with their data, reduce over a window, delta, threshold steps, a scale with soft ends and ticks, auto-fit text, value texts, export), kpi.js (KPI / Stat: tiles; replaces the Sparkline), histogram.js (Histogram);
    - index.js (every chart).

    A new chart is its own file there, on ChartElement or TimeChartElement.
- Skills (in the workspace's `.agents/skills/`): `nexa-ui-library` for a component, `nexa-chart-development` for a chart, `nexa-debugging` for a bug.
- Tests: `test/browser.test.js` (SDK testkit, headless Chrome; `npm test` runs the lint first), `test/chart-e2e.test.js` (`npm run test:chart`: charts on a real Node-RED driven by Logic), `test/tags-e2e.test.js` (tags end to end).
