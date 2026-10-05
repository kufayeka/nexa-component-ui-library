// Nexa UI — stacking and scales for a Cartesian chart. Pure: no DOM, no SDK (tested on its own).
//
//   stackColumns(series, n, mode) -> [{ lo: Float64Array, hi: Float64Array, slot, slots }]  (one per series)
//     series: [{ y: Float64Array (aligned to n slots), group: "" | "any key" }]
//     mode  : "none"      every series from 0 to its value, drawn over each other
//             "clustered" side by side: slot / slots say which part of the category's width a series takes
//             "stacked"   one on top of the other; positives and negatives stack apart (as Excel / Power BI do)
//             "percent"   stacked, each category scaled to 100
//   Series with different `group`s stack in their own pile (a stack of floors and, beside it, another stack).
//
//   niceTicks(min, max, target) -> { min, max, step, ticks: [..] }   "nice" 1 / 2 / 5 steps
//   logTicks(min, max) -> [..]  decades (1, 2, 5 in between when few)
//   extent(arrays...) -> { min, max }  of the finite values

export function extent(arrays) {
    let min = Infinity, max = -Infinity;
    for (const a of arrays) for (let i = 0; i < a.length; i++) { const v = a[i]; if (v === v && v !== Infinity && v !== -Infinity) { if (v < min) min = v; if (v > max) max = v; } }
    return min === Infinity ? { min: NaN, max: NaN } : { min, max };
}

export function stackColumns(series, n, mode) {
    const out = series.map(() => ({ lo: new Float64Array(n).fill(NaN), hi: new Float64Array(n).fill(NaN), slot: 0, slots: 1 }));
    if (mode === "clustered") {
        // every series is a column of its own in each category; piles by group count as one column
        const keys = [];
        series.forEach((s, i) => { const k = s.group || ("#" + i); if (keys.indexOf(k) === -1) keys.push(k); });
        series.forEach((s, i) => {
            const o = out[i], k = s.group || ("#" + i);
            o.slot = keys.indexOf(k); o.slots = keys.length;
        });
        if (series.some((s) => s.group)) return stackPiles(series, n, out, false);
        series.forEach((s, i) => { for (let j = 0; j < n; j++) { const v = s.y[j]; if (v === v) { out[i].lo[j] = 0; out[i].hi[j] = v; } } });
        return out;
    }
    if (mode === "stacked" || mode === "percent") return stackPiles(series, n, out, mode === "percent");
    series.forEach((s, i) => { for (let j = 0; j < n; j++) { const v = s.y[j]; if (v === v) { out[i].lo[j] = 0; out[i].hi[j] = v; } } });
    return out;
}

function stackPiles(series, n, out, percent) {
    const groups = [];
    series.forEach((s, i) => { const k = s.group || ""; let g = groups.filter((x) => x.key === k)[0]; if (!g) { g = { key: k, idx: [] }; groups.push(g); } g.idx.push(i); });
    groups.forEach((g, gi) => {
        for (let j = 0; j < n; j++) {
            let total = 0;
            if (percent) for (const i of g.idx) { const v = series[i].y[j]; if (v === v) total += Math.abs(v); }
            let pos = 0, neg = 0;
            for (const i of g.idx) {
                let v = series[i].y[j];
                if (v !== v) continue;
                if (percent) v = total > 0 ? (v / total) * 100 : 0;
                if (v >= 0) { out[i].lo[j] = pos; pos += v; out[i].hi[j] = pos; }
                else { out[i].hi[j] = neg; neg += v; out[i].lo[j] = neg; }
            }
        }
        if (series.some((s) => s.group)) g.idx.forEach((i) => { out[i].slot = gi; out[i].slots = groups.length; });
    });
    return out;
}

/** A "nice" axis: its ends rounded to a step of 1, 2 or 5 × 10^k; `target` = about how many steps. */
export function niceTicks(min, max, target) {
    target = Math.max(2, target || 5);
    if (!(max > min)) { const c = Number.isFinite(min) ? min : 0; min = c - 1; max = c + 1; }
    const raw = (max - min) / target, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / mag;
    const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag;
    const lo = Math.floor(min / step + 1e-9) * step, hi = Math.ceil(max / step - 1e-9) * step;
    const ticks = [];
    for (let v = lo; v <= hi + step * 1e-6; v += step) ticks.push(Math.abs(v) < step * 1e-9 ? 0 : Math.round(v / step * 1e6) / 1e6 * step);
    return { min: lo, max: hi, step, ticks };
}

export function logTicks(min, max) {
    if (!(min > 0)) min = 1e-3;
    if (!(max > min)) max = min * 10;
    const a = Math.floor(Math.log10(min)), b = Math.ceil(Math.log10(max)), ticks = [];
    for (let e = a; e <= b; e++) {
        ticks.push(Math.pow(10, e));
        if (b - a <= 3) { ticks.push(2 * Math.pow(10, e)); ticks.push(5 * Math.pow(10, e)); }
    }
    return ticks.filter((t) => t >= min * 0.999 && t <= max * 1.001);
}
