// Nexa UI — the legend, a part every chart shares: its props (where, a list or a table, which
// values, the text size), its markup, and where it goes around the plot. The look is in CHART_CSS.
// A chart gives the entries ({ key, name, color, off, swatch }) and a toggle; after each draw it
// writes the values into the cells (`.lg-val[data-k]` of the entry's `[data-key]`): the legend is
// not rendered again for a new value.
import { html } from "../../../nexa-sdk/nexa-component-sdk.js";
import { opt, numOr } from "./core.js";

export const LEGEND_AT = [["bottom", "Below"], ["top", "Above"], ["right", "Right"], ["left", "Left"],
    ["inside-tl", "Inside, top left"], ["inside-tr", "Inside, top right"], ["inside-bl", "Inside, bottom left"], ["inside-br", "Inside, bottom right"], ["none", "None"]];
// a legend's figures: [key, the field's label, the table's column title]; a chart may give its own
export const LEGEND_STATS = [["last", "Last", "Last"], ["min", "Min (shown)", "Min"], ["max", "Max (shown)", "Max"], ["avg", "Average (shown)", "Avg"]];
const colKey = (k) => "legend" + k[0].toUpperCase() + k.slice(1);

/**
 * The Legend group. `value`: the list's default value next to the name; `stats`: the chart's own
 * figures (default: last / min / max / average); `what`: what a row is ("series", "state").
 */
export function legendProps(o) {
    const d = o || {}, stats = d.stats || LEGEND_STATS;
    const shown = (p) => p.legend !== "none";
    const table = (p) => shown(p) && p.legendMode === "table";
    return {
        legend: { type: "enum", group: "Legend", label: "Position", default: d.at || "bottom", options: opt(LEGEND_AT) },
        legendMode: {
            type: "enum", group: "Legend", label: "Shape", default: "list", visibleWhen: shown,
            options: opt([["list", "A list (the name and one value)"], ["table", "A table (a column per value)"]]),
            help: "A table puts each " + (d.what || "series") + " in a row with a column per figure (" + stats.map((x) => x[2]).join(" / ") + "): compare them at a glance."
        },
        legendValue: {
            type: "enum", group: "Legend", label: "Value next to the name", default: d.value || "last",
            options: opt([["none", "None"]].concat(stats.map((x) => [x[0], x[1]]))), visibleWhen: (p) => shown(p) && p.legendMode !== "table",
            help: "Over the time shown (the last: the newest)."
        },
        ...Object.fromEntries(stats.map((x) => [colKey(x[0]), { type: "boolean", group: "Legend", label: "Column: " + x[1], default: true, visibleWhen: table }])),
        legendSize: { type: "number", group: "Legend", label: "Text size", default: 11, min: 8, max: 24, unit: "px", visibleWhen: shown }
    };
}

/** The values the legend shows: a table's columns, or the list's one value ([] = none). */
export function legendColumns(p, stats) {
    if (!p || p.legend === "none") return [];
    if (p.legendMode === "table") return (stats || LEGEND_STATS).map((x) => x[0]).filter((k) => p[colKey(k)] !== false);
    const v = p.legendValue || "last";
    return v === "none" ? [] : [v];
}

/** Where the legend goes: { at, inside, vertical } (at: top / bottom / left / right / inside-xx / none). */
export function legendPlace(p) {
    const at = (p && p.legend) || "bottom";
    return { at, inside: at.indexOf("inside-") === 0, vertical: at === "left" || at === "right" };
}

/**
 * The legend's markup ("" without entries or at "none"). entries: [{ key, name, color, off, swatch }]
 * (swatch: "line" | "square" | "dot"); toggle(entry, event): a click (Alt+click: only this one);
 * o: { stats (the chart's figures, as legendProps), head (the name column's title) }.
 */
export function legendTemplate(p, entries, toggle, o) {
    const { at, inside, vertical } = legendPlace(p);
    if (at === "none" || !entries.length) return "";
    const stats = (o && o.stats) || LEGEND_STATS, title = Object.fromEntries(stats.map((x) => [x[0], x[2]]));
    const cols = legendColumns(p, stats);
    const cls = "legend" + (vertical ? " v" : "") + (inside ? " inside " + at.slice(7) : "") + (p.legendMode === "table" ? " table" : "");
    const size = "--lg-size:" + numOr(p.legendSize, 11) + "px";
    const swatch = (e) => html`<span class="lg-swatch ${e.swatch === "square" ? "sw-sq" : e.swatch === "dot" ? "sw-dot" : ""}" style="background:${e.color}"></span>`;
    const tip = "Click: show / hide. Alt+click: only this one.";
    if (p.legendMode === "table") {
        return html`
            <div class=${cls} part="legend" style=${size}>
                <table class="lg-table">
                    <thead><tr><th class="lg-th-name">${(o && o.head) || "Series"}</th>${cols.map((k) => html`<th>${title[k]}</th>`)}</tr></thead>
                    <tbody>${entries.map((e) => html`
                        <tr class="lg-item lg-row ${e.off ? "off" : ""}" data-key=${e.key} title=${tip} @click=${(ev) => toggle(e, ev)}>
                            <td><span class="lg-name-cell">${swatch(e)}<span class="lg-name">${e.name}</span></span></td>
                            ${cols.map((k) => html`<td class="lg-val" data-k=${k}></td>`)}
                        </tr>`)}
                    </tbody>
                </table>
            </div>`;
    }
    return html`
        <div class=${cls} part="legend" style=${size}>
            ${entries.map((e) => html`
                <button type="button" class="lg-item ${e.off ? "off" : ""}" data-key=${e.key} title=${tip} @click=${(ev) => toggle(e, ev)}>
                    ${swatch(e)}<span class="lg-name">${e.name}</span>${cols.length ? html`<span class="lg-val" data-k=${cols[0]}></span>` : ""}
                </button>`)}
        </div>`;
}

/** Writes the values into a rendered legend: valueOf(key, stat) -> text. */
export function fillLegend(root, valueOf) {
    const el = root && root.querySelector(".legend");
    if (!el) return;
    for (const cell of el.querySelectorAll(".lg-val[data-k]")) {
        const item = cell.closest("[data-key]");
        if (!item) continue;
        const text = valueOf(item.getAttribute("data-key"), cell.getAttribute("data-k"));
        if (cell.textContent !== text) cell.textContent = text;
    }
}

/**
 * The legend inside the plot keeps to the plot's area (not over the axes, the ruler or the ⋮
 * menu; `right`: room kept free on the right, e.g. last-value labels): its edges as CSS variables
 * on the .plot (set only when they change).
 */
export function placeInsideLegend(plot, m, width, height, right) {
    if (!plot || !m) return;
    const v = Math.round(m.plotX + 8) + "|" + Math.round(m.plotY + 6) + "|" + Math.round(width - m.plotX - m.plotW + 8 + (right || 0)) + "|" + Math.round(height - m.plotY - m.plotH + 6);
    if (plot.__lgEdges === v) return;
    plot.__lgEdges = v;
    const [l, t, r, b] = v.split("|");
    plot.style.setProperty("--lg-l", l + "px");
    plot.style.setProperty("--lg-t", t + "px");
    plot.style.setProperty("--lg-r", r + "px");
    plot.style.setProperty("--lg-b", b + "px");
}
