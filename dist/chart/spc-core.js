// Nexa UI — SPC, the maths: control limits from the process (not from the spec), the run rules, capability.
// Pure: no DOM, no SDK (tested on its own, test/chart-pure.test.js).
//
//   subgroups(values, how)        individual readings -> subgroups (each its own / by a field / every N / per interval)
//   autoType(groups, kind, countKind)   the chart that fits the data (n = 1: I-MR, 2 - 9: X̄-R, 10+: X̄-S; p / np / c / u)
//   analyse(groups, o)            per point: its statistic, centre, limits, σ at the point; the lower chart; the rules broken
//   checkRules(z, enabled)        Nelson 1 - 8 and Western Electric on z = (x − CL) / σ
//   capability(values, o)         Cp, Cpk, Pp, Ppk, the expected PPM out of spec
//
// σ is estimated WITHIN the subgroups (R̄ / d2, S̄ / c4, MR̄ / 1.128): the overall standard deviation would swallow a shift
// of the process into the limits. With a varying n each point gets its own limits (σ / √nᵢ): with a constant n this is
// exactly the textbook A2 / D3 / D4 / B3 / B4.

// d2, d3 for n = 2 .. 25 (the range of a normal sample of n, in σ)
const D2 = [NaN, NaN, 1.128, 1.693, 2.059, 2.326, 2.534, 2.704, 2.847, 2.970, 3.078, 3.173, 3.258, 3.336, 3.407, 3.472, 3.532, 3.588, 3.640, 3.689, 3.735, 3.778, 3.819, 3.858, 3.895, 3.931];
const D3T = [NaN, NaN, 0.853, 0.888, 0.880, 0.864, 0.848, 0.833, 0.820, 0.808, 0.797, 0.787, 0.778, 0.770, 0.763, 0.756, 0.750, 0.744, 0.739, 0.733, 0.729, 0.724, 0.720, 0.716, 0.712, 0.708];

function lgamma(x) {
    // Lanczos (g = 7): enough for c4
    const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
    x -= 1;
    let a = c[0];
    const t = x + 7.5;
    for (let i = 1; i < 9; i++) a += c[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

export function d2(n) { return n >= 2 ? D2[Math.min(25, Math.round(n))] : NaN; }
export function d3(n) { return n >= 2 ? D3T[Math.min(25, Math.round(n))] : NaN; }
export function c4(n) { return n >= 2 ? Math.sqrt(2 / (n - 1)) * Math.exp(lgamma(n / 2) - lgamma((n - 1) / 2)) : NaN; }

/** The textbook constants of a subgroup of n (for the export and the tests). */
export function constants(n) {
    const D = d2(n), d = d3(n), c = c4(n);
    return { d2: D, d3: d, c4: c, A2: 3 / (D * Math.sqrt(n)), A3: 3 / (c * Math.sqrt(n)), D3: Math.max(0, 1 - 3 * d / D), D4: 1 + 3 * d / D,
        B3: Math.max(0, 1 - 3 * Math.sqrt(1 - c * c) / c), B4: 1 + 3 * Math.sqrt(1 - c * c) / c };
}

export const TYPES = { imr: "I-MR", "xbar-r": "X̄-R", "xbar-s": "X̄-S", p: "p", np: "np", c: "c", u: "u" };
const VARIABLE = { imr: 1, "xbar-r": 1, "xbar-s": 1 };
export const isVariable = (type) => !!VARIABLE[type];

export const RULES = {
    N1: "1 point beyond 3σ",
    N2: "9 points in a row on one side of the centre",
    N3: "6 points in a row steadily rising or falling",
    N4: "14 points in a row alternating up and down",
    N5: "2 of 3 points beyond 2σ on the same side",
    N6: "4 of 5 points beyond 1σ on the same side",
    N7: "15 points in a row within 1σ (stratification)",
    N8: "8 points in a row beyond 1σ, either side (mixture)",
    WE4: "8 points in a row on one side of the centre",
    L1: "beyond its control limit"
};
export const RULE_SETS = { basic: ["N1"], we: ["N1", "N5", "N6", "WE4"], nelson: ["N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8"] };

/**
 * Readings -> subgroups. values: [{ t, v, key?, phase?, excluded? }] in their order.
 * how: { by: "none" | "field" | "size" | "time", size, interval (ms) } -> [{ key, t, phase, vals, excluded }]
 * A subgroup never spans two phases.
 */
export function subgroups(values, how) {
    const by = (how && how.by) || "none", size = Math.max(1, Math.round((how && how.size) || 1)), iv = (how && how.interval) || 0;
    const out = [];
    let cur = null, count = 0;
    const open = (r, key) => { cur = { key, t: r.t, phase: r.phase || "", vals: [], excluded: false }; out.push(cur); count = 0; };
    for (let i = 0; i < values.length; i++) {
        const r = values[i];
        if (!r || !(typeof r.v === "number" && Number.isFinite(r.v))) continue;
        const phase = r.phase || "";
        let key;
        if (by === "field") key = r.key === undefined || r.key === null ? "" : String(r.key);
        else if (by === "time" && iv > 0 && Number.isFinite(r.t)) key = String(Math.floor(r.t / iv) * iv);
        else {
            // its own key (a sample id, its time) keeps a note / an exclusion on it when the rows window moves
            const own = r.key !== undefined && r.key !== null && r.key !== "" ? String(r.key) : String(out.length + 1);
            key = by === "size" && cur && cur.phase === phase && count < size ? cur.key : own;
        }
        if (!cur || cur.key !== key || cur.phase !== phase || by === "none" || (by === "size" && count >= size)) {
            open(r, key);
            if (by === "time" && iv > 0) cur.t = Number(key);
        }
        cur.vals.push(r.v); count++;
        if (r.excluded) cur.excluded = true;
    }
    return out;
}

/** The chart that fits: measurements by their (median) subgroup size; counts by what is counted and whether n varies. */
export function autoType(groups, kind, countKind) {
    if (kind === "count") {
        const ns = groups.map((g) => g.n).filter((n) => Number.isFinite(n) && n > 0);
        const varies = ns.some((n) => n !== ns[0]), hasN = ns.length > 0;
        if (countKind === "defects") return hasN && (varies || ns[0] !== 1) ? "u" : "c";
        return varies ? "p" : "np";
    }
    const ns = groups.map((g) => (g.vals ? g.vals.length : 1)).sort((a, b) => a - b), m = ns.length ? ns[Math.floor(ns.length / 2)] : 1;
    return m <= 1 ? "imr" : m <= 9 ? "xbar-r" : "xbar-s";
}

const mean = (a) => { let s = 0; for (const v of a) s += v; return a.length ? s / a.length : NaN; };
const sd = (a) => { if (a.length < 2) return NaN; const m = mean(a); let s = 0; for (const v of a) s += (v - m) * (v - m); return Math.sqrt(s / (a.length - 1)); };

/**
 * groups: measurements [{ key, t, phase, vals, excluded }] or counts [{ key, t, phase, count, n, excluded }].
 * o: { type, baseline: { mode: "all" | "first" | "range" | "manual", count, from, to, mean, sigma, center }, rules: [ids] }
 * -> { type, points: [{ key, t, phase, n, x, cl, ucl, lcl, s, z, y, cl2, ucl2, lcl2, rules, rules2, excluded, base }],
 *      segments: [{ phase, from, to, center, sigma, cl2, baseN }] }
 */
export function analyse(groups, o) {
    const type = o.type, b = o.baseline || {}, enabled = o.rules || RULE_SETS.we, variable = isVariable(type);
    const points = groups.map((g) => {
        const vals = g.vals || [], n = variable ? vals.length : Number(g.n);
        const p = { key: g.key, t: g.t, phase: g.phase || "", n, x: NaN, y: NaN, cl: NaN, ucl: NaN, lcl: NaN, s: NaN, z: NaN, cl2: NaN, ucl2: NaN, lcl2: NaN, rules: [], rules2: [], excluded: !!g.excluded, base: false };
        if (type === "imr") p.x = vals[0];
        else if (variable) { p.x = mean(vals); p.y = type === "xbar-r" ? Math.max(...vals) - Math.min(...vals) : sd(vals); }
        else {
            const c = Number(g.count);
            p.x = type === "p" || type === "u" ? c / n : c;
            p.count = c;
        }
        return p;
    });
    // the phases: runs of the same name
    const segments = [];
    for (let i = 0; i < points.length; i++) {
        const last = segments[segments.length - 1];
        if (last && last.phase === points[i].phase) last.to = i; else segments.push({ phase: points[i].phase, from: i, to: i });
    }
    for (const seg of segments) {
        const idx = [];
        for (let i = seg.from; i <= seg.to; i++) idx.push(i);
        // I-MR: the moving range inside the phase (NaN at its start)
        if (type === "imr") for (const i of idx) points[i].y = i > seg.from ? Math.abs(points[i].x - points[i - 1].x) : NaN;
        const ok = (i) => !points[i].excluded && Number.isFinite(points[i].x) && (variable && type !== "imr" ? points[i].n >= 2 : true) && (!variable ? points[i].n > 0 || type === "c" : true);
        let base = idx.filter(ok);
        if (b.mode === "first") base = base.slice(0, Math.max(2, Math.round(b.count || 25)));
        else if (b.mode === "range") { const inR = base.filter((i) => points[i].t >= b.from && points[i].t <= b.to); if (inR.length >= 2) base = inR; }
        base.forEach((i) => (points[i].base = b.mode !== "manual"));
        seg.baseN = b.mode === "manual" ? 0 : base.length;
        const manual = b.mode === "manual";
        let center = NaN, sigma = NaN;
        if (type === "imr") {
            center = manual ? b.mean : mean(base.map((i) => points[i].x));
            const mr = base.filter((i) => i > seg.from && !points[i - 1].excluded).map((i) => points[i].y);
            sigma = manual ? b.sigma : mean(mr) / d2(2);
            for (const i of idx) {
                const P = points[i];
                P.cl = center; P.s = sigma; P.ucl = center + 3 * sigma; P.lcl = center - 3 * sigma;
                P.cl2 = d2(2) * sigma; P.ucl2 = P.cl2 + 3 * d3(2) * sigma; P.lcl2 = 0;
            }
        } else if (variable) {
            let sn = 0, sx = 0;
            for (const i of base) { sn += points[i].n; sx += points[i].n * points[i].x; }
            center = manual ? b.mean : sx / sn;
            sigma = manual ? b.sigma : mean(base.map((i) => points[i].y / (type === "xbar-r" ? d2(points[i].n) : c4(points[i].n))));
            for (const i of idx) {
                const P = points[i], n = P.n;
                P.cl = center; P.s = sigma / Math.sqrt(n); P.ucl = center + 3 * P.s; P.lcl = center - 3 * P.s;
                if (type === "xbar-r") { P.cl2 = d2(n) * sigma; P.ucl2 = P.cl2 + 3 * d3(n) * sigma; P.lcl2 = Math.max(0, P.cl2 - 3 * d3(n) * sigma); }
                else { const c = c4(n); P.cl2 = c * sigma; P.ucl2 = P.cl2 + 3 * sigma * Math.sqrt(1 - c * c); P.lcl2 = Math.max(0, P.cl2 - 3 * sigma * Math.sqrt(1 - c * c)); }
            }
        } else {
            let sc = 0, sn = 0;
            for (const i of base) { sc += points[i].count; sn += type === "c" ? 1 : points[i].n; }
            center = manual ? b.center : sc / sn;   // p̄ (p, np), c̄, ū
            for (const i of idx) {
                const P = points[i], n = P.n;
                if (type === "p") { P.cl = center; P.s = Math.sqrt(center * (1 - center) / n); }
                else if (type === "np") { P.cl = n * center; P.s = Math.sqrt(n * center * (1 - center)); }
                else if (type === "c") { P.cl = center; P.s = Math.sqrt(center); }
                else { P.cl = center; P.s = Math.sqrt(center / n); }
                P.ucl = P.cl + 3 * P.s; P.lcl = Math.max(0, P.cl - 3 * P.s);
                if (type === "p") P.ucl = Math.min(1, P.ucl);
                if (type === "np") P.ucl = Math.min(n, P.ucl);
            }
            sigma = NaN;
        }
        seg.center = center; seg.sigma = sigma;
        // the rules, inside the phase, on z (excluded points skipped)
        const live = idx.filter((i) => !points[i].excluded && Number.isFinite(points[i].x));
        const z = live.map((i) => { const P = points[i]; return P.s > 0 ? (P.x - P.cl) / P.s : P.x === P.cl ? 0 : (P.x > P.cl ? Infinity : -Infinity); });
        live.forEach((i, k) => (points[i].z = z[k]));
        const hit = checkRules(z, enabled);
        live.forEach((i, k) => { points[i].rules = hit[k]; if (points[i].x < points[i].lcl - 1e-12 && !hit[k].includes("N1") && enabled.includes("N1")) points[i].rules.push("N1"); });
        // the lower chart: beyond its limits
        for (const i of live) {
            const P = points[i];
            if (Number.isFinite(P.y) && Number.isFinite(P.ucl2) && (P.y > P.ucl2 + 1e-12 || (P.lcl2 > 0 && P.y < P.lcl2 - 1e-12))) P.rules2 = ["L1"];
        }
    }
    return { type, points, segments };
}

/** The rules broken at each point (the point that completes the pattern is marked). z: (x − CL) / σ, in order. */
export function checkRules(z, enabled) {
    const on = new Set(enabled || []), n = z.length, out = z.map(() => []);
    let side = 0, sideRun = 0, up = 0, down = 0, alt = 0, lastDiff = 0, inside = 0, outside = 0;
    for (let i = 0; i < n; i++) {
        const v = z[i], add = (r) => { if (on.has(r) && !out[i].includes(r)) out[i].push(r); };
        if (Math.abs(v) > 3) add("N1");
        const s = v > 0 ? 1 : v < 0 ? -1 : 0;
        sideRun = s !== 0 && s === side ? sideRun + 1 : s !== 0 ? 1 : 0; side = s;
        if (sideRun >= 9) add("N2");
        if (sideRun >= 8) add("WE4");
        if (i > 0) {
            const d = v - z[i - 1];
            up = d > 0 ? up + 1 : 0; down = d < 0 ? down + 1 : 0;
            alt = d !== 0 && lastDiff !== 0 && Math.sign(d) !== Math.sign(lastDiff) ? alt + 1 : d !== 0 ? 1 : 0;
            lastDiff = d;
            if (up >= 5 || down >= 5) add("N3");
            if (alt >= 13) add("N4");
        }
        for (const [rule, len, need, lim] of [["N5", 3, 2, 2], ["N6", 5, 4, 1]]) {
            if (i < need - 1 || !(Math.abs(v) > lim)) continue;
            const sg = Math.sign(v);
            let k = 0;
            for (let j = Math.max(0, i - len + 1); j <= i; j++) if (Math.sign(z[j]) === sg && Math.abs(z[j]) > lim) k++;
            if (k >= need) add(rule);
        }
        inside = Math.abs(v) < 1 ? inside + 1 : 0;
        outside = Math.abs(v) > 1 ? outside + 1 : 0;
        if (inside >= 15) add("N7");
        if (outside >= 8) add("N8");
    }
    return out;
}

// the normal CDF (Abramowitz – Stegun 7.1.26, error < 1.5e-7)
export function normCdf(x) {
    const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
    return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/**
 * Capability of the readings against the spec. o: { usl, lsl, sigmaWithin } (a missing limit: one-sided).
 * -> { n, mean, sdOverall, sdWithin, cp, cpk, cpl, cpu, pp, ppk, ppmBelow, ppmAbove, ppm, outBelow, outAbove }
 */
export function capability(values, o) {
    const v = values.filter((x) => Number.isFinite(x)), n = v.length, m = mean(v), so = sd(v), sw = Number.isFinite(o.sigmaWithin) && o.sigmaWithin > 0 ? o.sigmaWithin : so;
    const usl = Number.isFinite(o.usl) ? o.usl : NaN, lsl = Number.isFinite(o.lsl) ? o.lsl : NaN;
    const cpu = (usl - m) / (3 * sw), cpl = (m - lsl) / (3 * sw), ppu = (usl - m) / (3 * so), ppl = (m - lsl) / (3 * so);
    const two = Number.isFinite(usl) && Number.isFinite(lsl);
    const pick = (a, b) => (Number.isFinite(a) && Number.isFinite(b) ? Math.min(a, b) : Number.isFinite(a) ? a : b);
    const ppmBelow = Number.isFinite(lsl) && so > 0 ? normCdf((lsl - m) / so) * 1e6 : 0, ppmAbove = Number.isFinite(usl) && so > 0 ? (1 - normCdf((usl - m) / so)) * 1e6 : 0;
    return {
        n, mean: m, sdOverall: so, sdWithin: sw,
        cp: two ? (usl - lsl) / (6 * sw) : NaN, cpk: pick(cpu, cpl), cpu, cpl,
        pp: two ? (usl - lsl) / (6 * so) : NaN, ppk: pick(ppu, ppl),
        ppmBelow, ppmAbove, ppm: ppmBelow + ppmAbove,
        outBelow: Number.isFinite(lsl) ? v.filter((x) => x < lsl).length : 0, outAbove: Number.isFinite(usl) ? v.filter((x) => x > usl).length : 0
    };
}
