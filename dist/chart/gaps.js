// Missing data on a time chart: the pure part (no DOM, no imports; test/chart-pure.test.js).
//
// A 0 is a value: a machine that is off and says 0 is data. A value that is MISSING (null / undefined / "" / not a number) is not a
// point: the buffer remembers when it was missing (`buf.breaks`) and the chart decides what to draw there:
//   connect  the line runs straight across (the chart's way before this setting);
//   gap      the line is cut where a value was missing, and where no data came for longer than `gapAfter` ms;
//   bridge   the same cut, with a thin dashed line across it: the data is missing here, and it is shown.
// The chart has the setting (`missing`, `gapAfter`); a series can have its own. A series saved with a `gapAfter` and no setting at all
// keeps cutting its line, as it did.

export const MODES = ["connect", "gap", "bridge"];

/** The value of a point, or NaN when it is missing (null, undefined, "", not a number). 0 is a value. */
export function valueOrNaN(v) {
    if (v === null || v === undefined || v === "") return NaN;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : NaN;
}

const ms = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };

/**
 * What a series does where data is missing: { mode, after, nulls }.
 * after: the silence in ms that cuts the line (0: none); nulls: whether a missing value cuts it. `connect` cuts nothing.
 */
export function gapSpec(chart, s) {
    const c = chart || {}, o = s || {};
    const cm = MODES.includes(c.missing) ? c.missing : "connect";
    const sm = MODES.includes(o.missing) ? o.missing : null;
    const own = ms(o.gapAfter);
    let mode = sm || cm;
    if (!sm && cm === "connect" && own > 0) mode = "gap";       // saved before the setting: its own gapAfter always cut the line
    if (mode === "connect") return { mode, after: 0, nulls: false };
    return { mode, after: own || ms(c.gapAfter), nulls: true };
}

/**
 * The runs of a series' (decimated) points, as [start, end, start, end ...] index pairs (end exclusive): a run ends where the time
 * to the next point is longer than `after`, or where a break (a missing value) lies between the two points.
 * dx: the times, n of them; breaks: ascending times (in the buffer's time: `shift` is added); null / [] for none.
 */
export function splitRuns(dx, n, after, breaks, shift) {
    const runs = [], nb = breaks ? breaks.length : 0, sh = shift || 0;
    let start = 0, bi = 0;
    for (let i = 1; i < n; i++) {
        let cut = after > 0 && dx[i] - dx[i - 1] > after;
        if (!cut && nb) {
            while (bi < nb && breaks[bi] + sh <= dx[i - 1]) bi++;
            if (bi < nb && breaks[bi] + sh <= dx[i]) cut = true;      // dx[i-1] < break <= dx[i]
        }
        if (cut) { runs.push(start, i); start = i; }
    }
    if (n) runs.push(start, n);
    return runs;
}

/** The dashed bridges between runs: [[lastIndexOfARun, firstIndexOfTheNext], ...] */
export function bridgesOf(runs) {
    const out = [];
    for (let r = 2; r < runs.length; r += 2) out.push([runs[r - 1] - 1, runs[r]]);
    return out;
}

const modeOptions = (chartLevel) => (chartLevel ? [] : [{ value: "", label: "As the chart" }]).concat([
    { value: "connect", label: "Connect: the line runs across" },
    { value: "gap", label: "Gap: the line is cut" },
    { value: "bridge", label: "Gap with a dashed bridge" }
]);

/** The chart's setting. `group`: the inspector group it goes in. */
export function missingProps(group) {
    return {
        missing: {
            type: "enum", group: group || "Data", label: "When data is missing", default: "connect", options: modeOptions(true),
            help: "A value that is null / undefined is MISSING (a 0 is a value: it is drawn). Connect: the line runs across the hole. Gap: the line is cut there. Gap with a dashed bridge: cut, and a thin dashed line shows that data is missing. A series can have its own setting."
        },
        gapAfter: {
            type: "number", group: group || "Data", label: "Cut the line after silence (ms)", default: 0, min: 0, step: 1000,
            help: "With Gap: no data for longer than this also cuts the line (a sensor that is off sends nothing). 0 = only a missing value cuts it.",
            visibleWhen: (p) => p.missing === "gap" || p.missing === "bridge"
        }
    };
}

/** A series' own setting: `missing` is new; `gapAfter` is the field the charts always had (its label and help are made clearer). */
export function missingFields() {
    return {
        missing: {
            type: "enum", section: "Data", label: "When data is missing", default: "", options: modeOptions(false),
            help: "As the chart, or its own: Connect / Gap / Gap with a dashed bridge. A null / undefined value is missing; a 0 is a value."
        },
        gapAfter: {
            type: "number", section: "Data", label: "Cut the line after silence (ms)", default: 0, min: 0, step: 1000,
            help: "0 = the chart's setting. No data for longer than this cuts the line (a sensor that is offline is not a straight line)."
        }
    };
}
